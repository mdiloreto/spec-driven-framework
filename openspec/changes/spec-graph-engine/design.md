## Context

The prototype (commit `9bfd117`) implemented a working spec discovery → graph → impact pipeline in plain JavaScript (.mjs). It operated on raw markdown files with a custom adapter system. Now we're rebuilding on top of OpenSpec as the spec standard, in TypeScript, with the graph operating on OpenSpec's directory structure rather than arbitrary markdown repos.

OpenSpec provides: `openspec/specs/<capability>/spec.md` for source-of-truth specs, `openspec/changes/<name>/` for proposed changes with `proposal.md`, `design.md`, `specs/`, `tasks.md`. OpenSpec's CLI offers `status --json` and `instructions --json` for machine-readable artifact state. OpenSpec has no cross-change or cross-spec dependency tracking.

The spec-graph-engine must be a pure library that can be consumed by the CLI, by the ILO, and by future skill integrations.

## Goals / Non-Goals

**Goals:**

- Persistent dependency graph (`spec-graph.json`) tracking relationships between OpenSpec capabilities and changes
- Automatic graph construction by scanning OpenSpec directories and extracting `depends-on` frontmatter
- Impact analysis: given changed specs, compute upstream context + downstream affected
- Topological ordering with parallel wave grouping for execution sequencing
- Cycle detection with clear error reporting
- Clean TypeScript API that the ILO and CLI can consume
- Zero runtime dependencies beyond Node.js built-ins

**Non-Goals:**

- Modifying OpenSpec's internal format or behavior
- NLP-based implicit dependency detection (future phase)
- Visual graph rendering (future — output JSON, let consumers render)
- Real-time file watching or incremental graph updates (rebuild on demand)
- Multi-repo graph federation (single repo scope for v1)

## Decisions

### Decision 1: Graph manifest format — `spec-graph.json`

The graph persists as a single JSON file at the project root (alongside `openspec/`). Rebuilt on demand by scanning the OpenSpec directory, not maintained incrementally.

```typescript
interface SpecGraph {
  version: "1.0";
  generatedAt: string; // ISO timestamp
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;           // capability name or change name
  type: "capability" | "change";
  path: string;         // relative path to spec dir or change dir
  status?: "active" | "archived"; // for changes
  artifacts?: {         // for changes — which artifacts exist
    proposal: boolean;
    design: boolean;
    specs: boolean;
    tasks: boolean;
  };
}

interface GraphEdge {
  from: string;   // node id
  to: string;     // node id
  kind: EdgeKind;
  reason?: string; // human-readable explanation
}

type EdgeKind =
  | "depends_on"          // from requires to be implemented first
  | "impacts"             // from modifies behavior defined in to
  | "extends"             // from adds capabilities to to
  | "blocks"              // from must complete before to can start
```

**Why over alternatives:** A single JSON file is simple, git-diffable, and portable. Considered SQLite (too heavy for a spec tool), in-memory only (loses state between runs), and YAML (JSON is more naturally consumed by TypeScript and agent tooling).

### Decision 2: Dependency declaration in spec frontmatter

Specs and proposals declare dependencies via a `depends-on` YAML frontmatter field. Since OpenSpec specs are plain markdown without frontmatter, we add an optional frontmatter block:

```markdown
---
depends-on:
  - capability: user-auth
    kind: depends_on
  - change: add-payment-flow
    kind: blocks
---

## ADDED Requirements
...
```

For OpenSpec `proposal.md` files, dependencies go in the same frontmatter format. The scanner also detects implicit references from markdown links (`[text](../other-spec/spec.md)`) as `impacts` edges.

**Why frontmatter:** It's the established convention in spec tooling (Kiro, Spec Kit, Jekyll). OpenSpec doesn't use frontmatter in specs, but adding it is non-breaking — OpenSpec ignores unknown content above the first `##` heading.

### Decision 3: Module architecture — pure functions with I/O injection

```
src/
├── graph/
│   ├── types.ts          # All type definitions (GraphNode, GraphEdge, SpecGraph, etc.)
│   ├── scanner.ts        # Reads OpenSpec dirs → raw dependency data
│   ├── builder.ts        # Raw data → SpecGraph (nodes + edges + dedup + validation)
│   ├── analysis.ts       # Impact analysis (BFS), topological sort, wave grouping
│   ├── manifest.ts       # Read/write spec-graph.json
│   └── index.ts          # Public API re-exports
├── cli/
│   ├── graph.ts          # CLI entry point for graph commands
│   └── commands/
│       ├── build.ts      # graph build
│       ├── impact.ts     # graph impact --changed <spec>
│       ├── order.ts      # graph order
│       └── show.ts       # graph show [--json]
└── index.ts              # Library entry point
```

**Scanner** is the only module that touches the filesystem. It receives a `FileReader` interface for testability:

```typescript
interface FileReader {
  readFile(path: string): string;
  listDir(path: string): string[];
  exists(path: string): boolean;
}
```

**Builder** is a pure function: `(nodes: RawNode[], rawEdges: RawEdge[]) => SpecGraph`. Handles deduplication, cycle detection, and edge validation.

**Analysis** is pure functions on the `SpecGraph` type: `computeImpact(graph, changed)`, `topologicalSort(graph)`, `groupWaves(graph)`.

**Why this split:** Prototype's `graph.mjs` mixed graph building with dependency resolution. Separating scanner → builder → analysis makes each testable in isolation. The `FileReader` interface allows tests to run without filesystem access.

### Decision 4: Cycle detection strategy

Use Kahn's algorithm (BFS-based topological sort) — if the sort doesn't consume all nodes, the remaining nodes form cycles. Report cycles as an array of node IDs in the error.

**Why over DFS-based:** Kahn's naturally produces the topological order we need for execution sequencing, so cycle detection is a free byproduct rather than a separate pass.

### Decision 5: Wave grouping for parallel execution

After topological sort, group nodes into waves where each wave contains nodes whose dependencies are all satisfied by previous waves:

```typescript
function groupWaves(graph: SpecGraph): GraphNode[][] {
  // Wave 0: nodes with no incoming edges
  // Wave 1: nodes whose deps are all in wave 0
  // Wave N: nodes whose deps are all in waves 0..N-1
}
```

Independent changes in the same wave can be implemented in parallel. This is inspired by GSD's wave-based execution model.

### Decision 6: CLI framework — minimal, no dependencies

Use a hand-rolled CLI parser (evolving the prototype's `args.mjs`). No commander, yargs, or other deps.

**Why:** Zero-dependency principle. The CLI is simple enough (4 commands, few flags each) that a framework adds weight without value.

## Risks / Trade-offs

- **[Frontmatter in OpenSpec specs]** → Adding frontmatter to files that OpenSpec doesn't expect frontmatter in. Mitigation: OpenSpec ignores content before the first `##` heading, so frontmatter is safe. If OpenSpec adds its own frontmatter support later, we may need to namespace our fields.
- **[Full rebuild on every graph command]** → Scanning all specs on every `graph build` could be slow on large repos. Mitigation: spec repos are small (dozens to low hundreds of files). If this becomes a problem, add file hash caching in v2.
- **[spec-graph.json drift]** → The manifest can become stale if specs change without rebuilding. Mitigation: the ILO always rebuilds before using the graph. CLI commands print a warning if the manifest is older than any spec file.
- **[Cycle handling policy]** → Cycles are reported as errors, but real-world specs may have legitimate mutual references (e.g., auth ↔ user-management). Mitigation: allow `kind: "references"` edges that are excluded from topological ordering — they're informational, not blocking.

## Open Questions

- Should `spec-graph.json` be committed to git or gitignored as a derived artifact? Leaning toward committed (enables review of dependency changes in PRs).
- Should the scanner also extract dependency hints from `tasks.md` task descriptions, or only from frontmatter and markdown links?
