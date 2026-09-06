# Tasks

## 1. Type Definitions

- [ ] 1.1 Define `IloState`, `ChangeState`, `ArtifactState` types in `src/ilo/types.ts`
- [ ] 1.2 Define `ContextBundle`, `GenerationRequest`, `ExecutionPlan` types
- [ ] 1.3 Define `OpenSpecClient` interface for OpenSpec CLI integration
- [ ] 1.4 Define `LoopOptions` type (target change, dry-run, format, max-tokens)

## 2. OpenSpec Client

- [ ] 2.1 Implement `OpenSpecClient` in `src/ilo/openspec-client.ts`: wraps `openspec status --json`, `openspec instructions --json`, `openspec list --json`
- [ ] 2.2 Implement subprocess execution with JSON output parsing
- [ ] 2.3 Implement error handling for missing OpenSpec CLI, invalid JSON, non-zero exit codes
- [ ] 2.4 Write unit tests with mocked subprocess calls

## 3. ILO State Management

- [ ] 3.1 Implement `readState()` and `writeState()` in `src/ilo/state.ts`
- [ ] 3.2 Implement state initialization for first run (empty state creation)
- [ ] 3.3 Implement state merging: reconcile existing state with fresh scan results
- [ ] 3.4 Add append-only `.sdf/ilo-journal.ndjson` execution logging with SDF events and backend summaries
- [ ] 3.5 Add optional `.sdf/traces/` debug trace capture and summarizer hook support
- [ ] 3.6 Add plan-drift reconciliation using stored fingerprints before execution continues
- [ ] 3.7 Write unit tests for state read/write, merge, migration, journaling, traces, and plan rebasing

## 4. Artifact Checker

- [ ] 4.1 Implement proposal existence and structural check in `src/ilo/checker.ts`
- [ ] 4.2 Implement design coherence check (exists, has Decisions section, proposal exists)
- [ ] 4.3 Implement specs coverage check (each proposal capability has a spec file with scenarios)
- [ ] 4.4 Implement tasks completeness check (exists, has checkbox items)
- [ ] 4.5 Implement cross-artifact coherence summary (complete/partial/missing verdict)
- [ ] 4.6 Write unit tests for each check and the summary logic

## 5. Context Assembler

- [ ] 5.1 Implement `assembleContext()` in `src/ilo/context.ts`: reads task, proposal, design, specs from change directory
- [ ] 5.2 Implement upstream context gathering: use spec-graph impact analysis to find upstream deps, read their content
- [ ] 5.3 Implement related specs inclusion: downstream specs for awareness
- [ ] 5.4 Implement JSON output format for context bundle
- [ ] 5.5 Implement markdown output format (`--format markdown`)
- [ ] 5.6 Implement token budget truncation (`--max-tokens`): prioritize direct over transitive, never truncate task/proposal/design
- [ ] 5.7 Write unit tests: full bundle assembly, upstream traversal, truncation logic

## 6. Loop Engine

- [ ] 6.1 Implement scan phase in `src/ilo/loop.ts`: rebuild spec-graph, read OpenSpec changes, merge state
- [ ] 6.2 Implement check phase: run artifact checker for each change in topological order
- [ ] 6.3 Implement generate phase: produce generation requests for missing/invalid artifacts
- [ ] 6.4 Implement plan phase: produce execution plan from spec-graph order + tasks.md parsing
- [ ] 6.5 Implement execute phase: walk tasks, assemble context, output for agent, mark complete
- [ ] 6.6 Persist checkpoint state on phase transitions and task boundaries under `.sdf/`
- [ ] 6.7 Implement dry-run mode: skip generate and execute, don't modify runtime artifacts
- [ ] 6.8 Write unit tests for each phase and the full loop flow

## 7. CLI Commands

- [ ] 7.1 Extend CLI argument parser to support `ilo` subcommands alongside `graph` subcommands
- [ ] 7.2 Implement `ilo run [--change <name>] [--dry-run] [--json]` command
- [ ] 7.3 Implement `ilo status [--json]` command
- [ ] 7.4 Implement `ilo check [--change <name>]` command
- [ ] 7.5 Implement `ilo plan [--change <name>] [--json]` command
- [ ] 7.6 Write integration tests for CLI commands

## 8. Skill Generation

- [ ] 8.1 Implement Claude Code skill template generator in `src/skills/claude.ts`
- [ ] 8.2 Implement OpenCode skill template generator in `src/skills/opencode.ts`
- [ ] 8.3 Implement `sdf skills generate --tool <claude|opencode|all>` command
- [ ] 8.4 Write skill content: instructions for each skill (run, status, check, plan, graph, impact)
- [ ] 8.5 Write tests for skill generation: file creation, content validation, regeneration safety

## 9. Integration Testing

- [ ] 9.1 Create test fixture: OpenSpec project with mixed artifact states (complete, partial, missing)
- [ ] 9.2 End-to-end test: full loop run on fixture — scan through execute
- [ ] 9.3 Test resume after interruption: modify state mid-loop, restart, verify continuation
- [ ] 9.4 Test dry-run mode: verify no `.sdf/` state or journal modification
- [ ] 9.5 Test context assembly with real spec-graph: verify upstream/downstream inclusion
