## Context

OpenSpec manages the artifact lifecycle within a single change (proposal → design → specs → tasks → apply). The spec-graph-engine adds cross-change dependency tracking. The ILO is the orchestration layer that drives the full implementation cycle: given a project with OpenSpec changes, it ensures all artifacts are complete, resolves execution order via the spec-graph, assembles context for each task, and drives implementation.

The ILO is an **agent-first** tool — designed to be invoked by AI coding agents (Claude Code, OpenCode) or by a human via CLI. It must produce structured output that agents can consume, and its context assembly must provide everything an agent needs to implement a task without requiring additional manual context gathering.

## Goals / Non-Goals

**Goals:**

- Orchestrate the implementation lifecycle across multiple OpenSpec changes
- Detect missing PFB/EAD/tasks artifacts and coordinate their generation
- Assemble rich context bundles from the spec-graph for agent consumption
- Drive task execution in topological order with parallel wave support
- Track loop state persistently across sessions
- Provide CLI commands and skill definitions for Claude Code and OpenCode
- Work with any repo that has OpenSpec initialized — repo-agnostic

**Non-Goals:**

- Replacing OpenSpec's artifact generation (we delegate to OpenSpec's own `/opsx:propose` and `/opsx:continue` for single-change workflows)
- Autonomous code generation (ILO assembles context and orchestrates; the agent or human writes code)
- Real-time collaboration or multi-user coordination
- Git operations (commits, branches, PRs) — that's the agent's or user's responsibility
- Modifying the spec-graph-engine's output format

## Decisions

### Decision 1: Hidden runtime model — `.sdf/ilo-state.json` + `.sdf/ilo-journal.ndjson`

```typescript
interface IloState {
  version: "1.1";
  activeRunId?: string;
  currentPhase?: "scan" | "check" | "review" | "generate" | "plan" | "execute";
  lastTransitionAt?: string;
  updatedAt: string;
  changes: ChangeState[];
}

interface ChangeState {
  name: string;                          // OpenSpec change name
  status: "pending" | "checking" | "generating" | "ready" | "in-progress" | "complete" | "blocked";
  artifacts: {
    proposal: ArtifactState;
    design: ArtifactState;
    specs: ArtifactState;
    tasks: ArtifactState;
  };
  currentTask?: string;                  // task ID currently being worked on
  completedTasks: string[];
  blockedBy: string[];                   // change names this depends on
  backendSessionId?: string;             // backend-owned continuation handle
  lastError?: string;                    // last task/backend failure
  lastTransitionAt?: string;
  planFingerprint?: string;              // detects task-plan drift across runs
}

interface ArtifactState {
  exists: boolean;
  valid: boolean;                        // passed coherence check
  lastChecked: string;
  issues?: string[];                     // validation issues found
}
```

**Why a separate state file:** OpenSpec tracks artifact existence but not cross-change orchestration state. We need to know which changes are blocked, which tasks have been completed across sessions, and what validation issues exist.

**Why a journal too:** checkpoint state is the source of truth for resumption, but it overwrites history. `.sdf/ilo-journal.ndjson` provides append-only execution history for debugging, audits, interrupted runs, and concise backend activity summaries without making raw LLM traces a hard dependency.

**Why traces stay optional:** raw backend transcripts and tool traces are useful for debugging, but too noisy and backend-specific to become part of authoritative orchestration state. They belong in opt-in `.sdf/traces/` artifacts only.

### Decision 2: The implementation loop algorithm

```
function runLoop(options: { target?: string; dryRun?: boolean }):

  1. SCAN
     - Rebuild spec-graph (call graph.build())
     - Read all OpenSpec changes via `openspec list --json`
     - Merge into .sdf/ilo-state.json

  2. CHECK (for each change, in topological order)
     - For each artifact (proposal, design, specs, tasks):
       a. Does the file exist? (openspec status --change <name> --json)
       b. Is it coherent with its dependencies?
          - proposal: has clear scope, references correct capabilities
          - design: decisions reference proposal intent, covers all capabilities
          - specs: scenarios are testable, cover all proposal capabilities
          - tasks: cover all design decisions and spec requirements
     - Update .sdf/ilo-state.json with findings
     - Append phase events to .sdf/ilo-journal.ndjson

  3. GENERATE (for changes with missing/invalid artifacts)
     - Output a structured generation request:
       { change, artifact, context: [...], instruction: "..." }
     - The agent (or user) creates the artifact
     - ILO re-checks after generation

  4. PLAN (for changes that are ready — all artifacts valid)
     - Read topological order from spec-graph
     - Group into execution waves
     - For each change, read tasks.md and produce ordered task list
     - Output: execution plan as JSON

  5. EXECUTE (for changes in the current wave)
     - For each task:
       a. Assemble context bundle (see Decision 3)
       b. Output context + task description to agent
       c. Wait for task completion signal
        d. Mark task complete in .sdf/ilo-state.json
        e. Append task lifecycle + backend summary events to .sdf/ilo-journal.ndjson
     - After all tasks: run /opsx:verify equivalent
```

Steps 3 and 5 are **interactive** — they require agent or human action. The ILO does not generate artifacts or write code itself; it orchestrates and provides context.

### Decision 3: Context assembly — the key differentiator

When an agent is about to implement a task, the ILO assembles a context bundle:

```typescript
interface ContextBundle {
  task: {
    id: string;
    description: string;
    fromChange: string;
  };
  proposal: string;         // full text of the change's proposal.md
  design: string;           // full text of the change's design.md
  specs: string[];           // full text of relevant spec files
  upstreamContext: {        // from spec-graph impact analysis
    specs: SpecContent[];   // upstream capability specs
    changes: ChangeContent[]; // upstream changes that this depends on
  };
  relatedSpecs: SpecContent[];  // specs impacted by this change (for awareness)
}
```

This is the missing piece that no tool provides: **structured, graph-aware context for agent task execution.**

**Why bundle everything:** Agents lose context between invocations. The ILO must provide a self-contained context packet for each task. Reading the spec-graph and assembling upstream dependencies is exactly what a human would do manually — the ILO automates it.

### Decision 4: Module architecture

```
src/
├── ilo/
│   ├── types.ts          # IloState, ChangeState, ContextBundle, etc.
│   ├── scanner.ts        # Reads OpenSpec state via CLI, merges with spec-graph
│   ├── checker.ts        # Validates artifact existence and coherence
│   ├── planner.ts        # Produces execution plan from spec-graph order
│   ├── context.ts        # Assembles ContextBundle for a task
│   ├── state.ts          # Read/write .sdf/ilo-state.json
│   ├── loop.ts           # Main loop orchestrator (scan → check → generate → plan → execute)
│   └── index.ts          # Public API re-exports
├── cli/
│   └── commands/
│       ├── run.ts        # ilo run [--change <name>] [--dry-run]
│       ├── status.ts     # ilo status [--json]
│       ├── check.ts      # ilo check [--change <name>]
│       └── plan.ts       # ilo plan [--change <name>] [--json]
├── skills/
│   ├── claude.ts         # Generate Claude Code skill files
│   └── opencode.ts       # Generate OpenCode skill files
└── index.ts              # Library entry point
```

### Decision 5: OpenSpec CLI integration

The ILO calls OpenSpec CLI as a subprocess for artifact state queries:

```typescript
interface OpenSpecClient {
  status(changeName: string): Promise<ChangeStatus>;
  instructions(artifactId: string, changeName: string): Promise<ArtifactInstructions>;
  list(): Promise<ChangeListItem[]>;
  listSpecs(): Promise<SpecListItem[]>;
}
```

**Why subprocess over library import:** OpenSpec is installed globally as a CLI tool, not as a library. Calling it as a subprocess with `--json` flags keeps us decoupled from its internals. If OpenSpec later exposes a programmatic API, we can swap the implementation.

### Decision 6: Coherence checking — deterministic first, AI-assisted later

v1 coherence checks are structural/deterministic:
- Proposal lists capabilities → specs exist for each capability?
- Design references proposal intent → proposal exists?
- Tasks cover design decisions → each decision section has at least one task?
- Specs have scenarios → each requirement has at least one `#### Scenario`?

AI-powered semantic coherence (e.g., "does the design actually address the proposal's goals?") is deferred to a future phase. The ILO flags structural gaps; deeper review is the agent's or human's job.

## Risks / Trade-offs

- **[OpenSpec CLI as subprocess]** → Slower than direct library calls, subprocess failures need handling. Mitigation: cache results within a single loop run; OpenSpec CLI is fast (<100ms per call).
- **[State file conflicts]** → Multiple agents running ILO concurrently could corrupt `.sdf/ilo-state.json` or `.sdf/ilo-journal.ndjson`. Mitigation: v1 is single-agent only; add file locking in v2.
- **[Context bundle size]** → Large specs could produce context bundles that exceed agent context windows. Mitigation: include a `maxTokens` option that truncates less-relevant upstream context. The spec-graph's impact analysis already prioritizes direct dependencies over transitive ones.
- **[Coherence checking scope creep]** → Temptation to make the checker "smart" — resist. Keep it structural in v1.

### Decision 7: Backend interface pattern — `ILOBackend`

The ILO drives implementation through a backend abstraction. The orchestration loop is deterministic (no LLM reasoning needed); backends simply execute prompts and return results.

```typescript
interface ILOBackend {
  name: string;
  execute(prompt: string, options?: BackendOptions): Promise<BackendResult>;
  resumeSession(sessionId: string, prompt: string): Promise<BackendResult>;
}

interface BackendOptions {
  cwd?: string;
  timeout?: number;
  maxTokens?: number;
}

interface BackendResult {
  success: boolean;
  output: string;
  sessionId?: string;
  error?: string;
}
```

**Why an interface:** Two backends today (Claude Code, OpenCode), potentially more later. The ILO doesn't care which agent writes the code — it cares about assembling context, tracking progress, and driving execution order.

### Decision 8: Claude Code backend — subprocess invocation

```typescript
// Invocation pattern:
// claude --bare -p "<assembled-context>" --output-format stream-json

class ClaudeCodeBackend implements ILOBackend {
  name = "claude-code";
  // Uses `claude` CLI with --bare (no interactive chrome)
  // Streams JSON events for progress tracking
  // Session continuity via --continue flag
}
```

**Why `--bare` + `stream-json`:** `--bare` strips interactive UI. `stream-json` gives structured events (tool calls, completions) that ILO can parse for progress tracking without screen-scraping.

### Decision 9: OpenCode backend — subprocess invocation

```typescript
// Invocation pattern:
// opencode run "<assembled-context>" --format json

class OpenCodeBackend implements ILOBackend {
  name = "opencode";
  // Uses `opencode` CLI in non-interactive mode
  // JSON output for structured result parsing
}
```

**Why subprocess for both:** Neither tool exposes a stable programmatic API. Subprocess invocation with JSON output is the most reliable integration point. If either tool later exposes a library API, the backend implementation swaps without touching the ILO loop.

### Decision 10: Three delivery surfaces

1. **CLI (primary):** `sdf ilo run`, `sdf ilo status`, `sdf ilo check`, `sdf ilo plan` — direct terminal usage
2. **MCP server (`sdf ilo serve`):** Exposes ILO capabilities as MCP tools — agents can call ILO programmatically without subprocess overhead
3. **Skills (SKILL.md):** Static skill files that teach Claude Code and OpenCode how to invoke ILO — the simplest integration path

**Priority order:** CLI first (it's the foundation), skills second (low effort, high value), MCP third (nice-to-have for agent-to-agent workflows).

### Decision 11: No agent frameworks

Evaluated: Google ADK, Claude Agent SDK, LangGraph, CrewAI, Mastra. All rejected.

**Why:** ILO's workflow (scan → check → generate → plan → execute) is fully deterministic. There is no step where the orchestrator needs LLM reasoning to decide what to do next. Agent frameworks add dependency weight, API coupling, and abstraction layers that provide zero value for a deterministic loop.

**Where the complexity budget goes:** Domain logic — spec-graph traversal, context assembly, coherence checking, wave-based execution ordering. These are graph algorithms and file parsing, not LLM orchestration.

**Dependencies:** zod (validation), @modelcontextprotocol/sdk (MCP surface), better-sqlite3 or JSON (state persistence). No LLM SDKs in the orchestrator itself.

## Risks / Trade-offs (updated)

- **[OpenSpec CLI as subprocess]** → Slower than direct library calls. Mitigation: cache results within a single loop run; OpenSpec CLI is fast (<100ms per call).
- **[State file conflicts]** → Multiple agents running ILO concurrently could corrupt `.sdf/ilo-state.json` or `.sdf/ilo-journal.ndjson`. Mitigation: v1 is single-agent only; add file locking in v2.
- **[Context bundle size]** → Large specs could exceed agent context windows. Mitigation: `maxTokens` option with truncation of less-relevant upstream context. Spec-graph impact analysis prioritizes direct dependencies over transitive ones.
- **[Coherence checking scope creep]** → Keep it structural in v1. Defer semantic analysis.
- **[Backend subprocess reliability]** → Agent CLIs may change flags/output format between versions. Mitigation: version-pin invocation patterns, wrap with retry logic, fail loudly on unexpected output.

## Resolved Questions

- **Context format:** JSON by default (structured, parseable by agents), with `--format markdown` for human reading.
- **Artifact generation signaling:** The ILO outputs a structured generation request to stdout. The backend (Claude Code, OpenCode) receives it as a prompt. No callbacks or MCP — the ILO is a CLI that prints instructions, the agent acts on them.
