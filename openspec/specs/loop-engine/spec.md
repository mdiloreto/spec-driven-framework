# Loop Engine Specification

## Purpose

The core orchestration loop that drives the implementation lifecycle across multiple OpenSpec changes. Delegates single-change artifact management to OpenSpec (`openspec status`, `openspec validate`, `openspec instructions`). Adds what OpenSpec does not: cross-change orchestration, dependency-ordered execution, spec-graph-aware context assembly, and durable loop runtime persistence across sessions.

## Requirements

### Requirement: Loop scan phase

The system SHALL discover all active OpenSpec changes by calling `openspec list --json`, rebuild the spec-graph, and merge results into the loop state. The scan MUST detect new changes added since the last run and remove changes that no longer exist.

#### Scenario: Fresh scan with new changes

- **WHEN** the loop runs for the first time and `openspec list --json` returns `add-auth` and `add-payments`
- **THEN** the loop state SHALL contain both changes with status `pending`

#### Scenario: Incremental scan

- **WHEN** a new change `add-notifications` appears in `openspec list --json` since the last run
- **THEN** the loop state SHALL add it with status `pending` while preserving existing change states

#### Scenario: Removed change

- **WHEN** change `add-auth` no longer appears in `openspec list --json` but exists in loop state
- **THEN** it SHALL be removed from the loop state

### Requirement: Loop check phase

The system SHALL validate artifact completeness for each change in topological order. It MUST delegate structural validation to `openspec validate --json` and add spec-graph-aware checks via the artifact-checker.

#### Scenario: Complete change

- **WHEN** `openspec validate add-auth --json` reports valid and artifact-checker finds no graph issues
- **THEN** the change status SHALL be set to `ready`

#### Scenario: Missing artifacts

- **WHEN** `openspec status --change add-auth --json` shows blocked/missing artifacts
- **THEN** the change status SHALL be `checking` with issues from OpenSpec's status report

#### Scenario: Blocked change

- **WHEN** change `add-payments` depends on `add-auth` in the spec-graph and `add-auth` is not `complete`
- **THEN** `add-payments` status SHALL be `blocked` with `blockedBy: ["add-auth"]`

### Requirement: Loop generate phase

The system SHALL identify changes with missing or invalid artifacts and output structured generation requests. Each request MUST include the change name, missing artifact ID, and context assembled by the context-assembler (which delegates within-change context to `openspec instructions --json`).

#### Scenario: Generation request output

- **WHEN** change `add-auth` is missing `design.md`
- **THEN** the system SHALL output a generation request with context from both `openspec instructions design --change add-auth --json` and cross-change upstream context from the spec-graph

#### Scenario: Multiple missing artifacts

- **WHEN** change `add-auth` is missing both `design.md` and `specs/`
- **THEN** the system SHALL output generation requests in OpenSpec's artifact dependency order (design before specs if design is a prerequisite)

### Requirement: Loop plan phase

The system SHALL produce an execution plan for all `ready` changes, ordered by the spec-graph topology and grouped into parallel waves.

#### Scenario: Execution plan

- **WHEN** changes `base-config` (wave 0), `add-auth` (wave 1), and `add-payments` (wave 2) are all ready
- **THEN** the plan SHALL output waves with task lists for each change in order

### Requirement: Loop execute phase

The system SHALL walk the execution plan wave by wave, assembling a context bundle for each task via the context-assembler and outputting it for agent consumption. After a task is signaled complete, it MUST be marked in the loop state and the next task presented.

#### Scenario: Task execution flow

- **WHEN** the loop is executing change `add-auth`, task "1.1 Create user model"
- **THEN** the system SHALL output a context bundle from the context-assembler containing task-level + cross-change context

#### Scenario: Task completion

- **WHEN** task "1.1" is signaled complete
- **THEN** it SHALL be added to `completedTasks` and the next task presented

#### Scenario: All tasks complete

- **WHEN** all tasks in change `add-auth` are complete
- **THEN** the change status SHALL transition to `complete`

### Requirement: Hidden runtime directory

The system SHALL store ILO runtime artifacts under a hidden `.sdf/` directory at the project root. The runtime directory MUST contain `.sdf/ilo-state.json` as the authoritative checkpoint and `.sdf/ilo-journal.ndjson` as the append-only execution journal.

#### Scenario: Runtime artifacts written

- **WHEN** a non-dry-run loop execution persists state
- **THEN** it SHALL write `.sdf/ilo-state.json`
- **AND** append journal entries to `.sdf/ilo-journal.ndjson`

### Requirement: Loop state persistence

The system SHALL persist loop state to `.sdf/ilo-state.json` after every phase transition and task-boundary transition. The state MUST survive process restarts and allow the loop to resume from the last durable phase or task checkpoint.

#### Scenario: Resume after interruption

- **WHEN** the loop was interrupted during the execute phase of `add-auth` with 3 of 5 tasks complete
- **THEN** restarting the loop SHALL resume from task 4, not restart from the beginning

#### Scenario: Mid-task interruption

- **WHEN** the loop had already marked task `1.2` as `currentTask` before invoking the backend
- **AND** the process exits before completion is recorded
- **THEN** the checkpoint SHALL still indicate execute-phase progress for that task
- **AND** the next run MAY resume or re-drive task `1.2` instead of losing the in-flight state

### Requirement: Execution journal

The system SHALL append structured execution events to `.sdf/ilo-journal.ndjson`. Journal entries MUST record SDF-level workflow transitions and backend invocation summaries, but SHALL NOT require raw LLM transcripts or hidden model reasoning to be persisted.

#### Scenario: Task lifecycle events

- **WHEN** the loop starts, runs, and completes task `1.1`
- **THEN** the journal SHALL contain phase transition entries
- **AND** task start/completion entries
- **AND** backend invocation metadata for the task

#### Scenario: Backend logging boundary

- **WHEN** a coding backend returns a large transcript or streaming tool trace
- **THEN** the framework SHALL treat `.sdf/ilo-journal.ndjson` as an SDF execution log, not a full trace sink
- **AND** it MAY persist a concise backend summary
- **BUT** it SHALL NOT require chain-of-thought or raw transcript capture for correctness

### Requirement: Optional debug trace capture

The system MAY persist raw backend traces under `.sdf/traces/` when explicitly requested. Debug trace capture MUST be opt-in and SHALL NOT change the authoritative checkpoint or journal semantics.

#### Scenario: Debug trace capture

- **WHEN** the loop runs with debug trace capture enabled
- **THEN** the system SHALL write per-task trace artifacts under `.sdf/traces/<runId>/...`
- **AND** the journal MAY reference the trace file paths

### Requirement: Optional backend summarizer hook

The system MAY use a pluggable summarizer hook to compress backend transcripts or traces into concise backend summaries. If the summarizer is unavailable or fails, the loop SHALL fall back to a local heuristic summary and continue execution.

#### Scenario: Summarizer failure

- **WHEN** a configured backend summarizer errors during task execution
- **THEN** the loop SHALL still complete the task lifecycle
- **AND** it SHALL record a fallback summary instead of failing the run

### Requirement: Plan drift reconciliation

The system SHALL detect when a persisted task plan no longer matches the current `tasks.md` content for a change. When plan drift occurs, the loop MUST reconcile stored progress against the new task set before continuing execution.

#### Scenario: Plan rebase clears stale progress

- **WHEN** a change previously recorded completed tasks `1.1` and `1.2`
- **AND** the current plan no longer contains those task IDs
- **THEN** the loop SHALL remove the stale completed task IDs from checkpoint state
- **AND** clear an invalid `currentTask`
- **AND** append a `plan_rebased` journal event describing the reconciliation

### Requirement: Dry run mode

The system SHALL support a `--dry-run` flag that runs scan, check, and plan phases but skips generate and execute. Dry run MUST NOT modify `.sdf/ilo-state.json` or `.sdf/ilo-journal.ndjson`.

#### Scenario: Dry run output

- **WHEN** the user runs the loop with `--dry-run`
- **THEN** the system SHALL output the execution plan without modifying state or requesting artifact generation
