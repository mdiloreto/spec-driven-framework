# Tasks

## 1. Project Setup

- [x] 1.1 Initialize TypeScript project with `tsconfig.json` (strict mode, ES modules, NodeNext module resolution)
- [x] 1.2 Configure `tsup` for building CLI binary and library entry point
- [x] 1.3 Configure `vitest` for unit and integration tests
- [x] 1.4 Create `package.json` with `sdf` binary entry point and `exports` field for library usage
- [x] 1.5 Set up project directory structure: `src/graph/`, `src/cli/`, `src/cli/commands/`

## 2. Type Definitions

- [x] 2.1 Define `SpecGraph`, `GraphNode`, `GraphEdge`, `EdgeKind` types in `src/graph/types.ts`
- [x] 2.2 Define `RawNode`, `RawEdge`, `ScanResult` types for scanner output
- [x] 2.3 Define `FileReader` interface for I/O injection
- [x] 2.4 Define `ImpactResult`, `WaveGroup` types for analysis output
- [x] 2.5 Write type tests (type-level assertions that types are correct)

## 3. Graph Scanner

- [x] 3.1 Implement `FileReader` using Node.js `fs` module in `src/graph/scanner.ts`
- [x] 3.2 Implement capability discovery: scan `openspec/specs/` for directories with `spec.md`
- [x] 3.3 Implement change discovery: scan `openspec/changes/` for directories with `.openspec.yaml`, skip `archive/`
- [x] 3.4 Implement artifact existence detection for change nodes (proposal, design, specs, tasks)
- [x] 3.5 Implement YAML frontmatter parser for `depends-on` field extraction
- [x] 3.6 Implement markdown cross-reference extraction (links pointing to other openspec files)
- [x] 3.7 Implement delta spec impact detection (change's `specs/<capability>/` → impacts edge)
- [x] 3.8 Write unit tests for scanner: capability discovery, change discovery, frontmatter parsing, link extraction, edge cases (no frontmatter, malformed YAML, empty dirs)

## 4. Graph Builder

- [x] 4.1 Implement `buildGraph()` in `src/graph/builder.ts`: takes scanner output, produces `SpecGraph`
- [x] 4.2 Implement edge deduplication (same from/to/kind = single edge)
- [x] 4.3 Implement node validation (reject edges referencing non-existent nodes)
- [x] 4.4 Write unit tests for builder: dedup, validation, empty graph, single node, complex graph

## 5. Graph Analysis

- [x] 5.1 Implement exact cycle detection and topological generations using Graphology in `src/graph/analysis.ts`
- [x] 5.2 Implement `computeImpact()`: BFS upstream context + downstream affected
- [x] 5.3 Implement `topologicalSort()`: returns ordered node list (fails on cycles)
- [x] 5.4 Implement `groupWaves()`: groups topologically sorted nodes into parallel execution waves
- [x] 5.5 Write unit tests: cycle detection (no cycle, direct cycle, transitive cycle), impact analysis (direct, transitive, multiple changed), topological sort (linear, diamond, independent), wave grouping (all scenarios from spec)

## 6. Graph Manifest

- [x] 6.1 Implement `writeManifest()` in `src/graph/manifest.ts`: writes `SpecGraph` to `spec-graph.json`
- [x] 6.2 Implement `readManifest()`: reads and validates `spec-graph.json`
- [x] 6.3 Implement stale detection: compare manifest mtime vs spec file mtimes
- [x] 6.4 Write unit tests for manifest read/write and stale detection

## 7. CLI Commands

- [x] 7.1 Implement CLI argument parser in `src/cli/args.ts` (subcommand routing: `graph build`, `graph impact`, etc.)
- [x] 7.2 Implement `graph build` command in `src/cli/commands/build.ts`
- [x] 7.3 Implement `graph impact --changed <path> [--json]` command in `src/cli/commands/impact.ts`
- [x] 7.4 Implement `graph order [--json]` command in `src/cli/commands/order.ts`
- [x] 7.5 Implement `graph show [--json]` command in `src/cli/commands/show.ts`
- [x] 7.6 Write integration tests: run CLI against a fixture OpenSpec project, verify JSON output

## 8. Library Entry Point

- [x] 8.1 Create `src/graph/index.ts` re-exporting public API: `buildGraph`, `computeImpact`, `topologicalSort`, `groupWaves`, `readManifest`, `writeManifest`
- [x] 8.2 Create `src/index.ts` re-exporting graph module for library consumers
- [x] 8.3 Verify `tsup` build produces both ESM and CJS outputs with correct type declarations

## 9. Integration Testing

- [x] 9.1 Create test fixture: minimal OpenSpec project with 3 capabilities, 3 changes, known dependencies
- [x] 9.2 End-to-end test: scan → build → analyze → manifest write/read cycle
- [x] 9.3 Edge case test: empty project, single spec, circular deps, missing frontmatter
