# Loop Engine Specification

## Purpose

The core orchestration loop that drives the implementation lifecycle across multiple OpenSpec changes. Delegates single-change artifact management to OpenSpec (`openspec status`, `openspec validate`, `openspec instructions`). Adds what OpenSpec does not: cross-change orchestration, dependency-ordered execution, spec-graph-aware context assembly, and loop state persistence across sessions.

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

### Requirement: Loop state persistence

The system SHALL persist loop state to `ilo-state.json` after every phase transition. The state MUST survive process restarts and allow the loop to resume from the last phase.

#### Scenario: Resume after interruption

- **WHEN** the loop was interrupted during the execute phase of `add-auth` with 3 of 5 tasks complete
- **THEN** restarting the loop SHALL resume from task 4, not restart from the beginning

### Requirement: Dry run mode

The system SHALL support a `--dry-run` flag that runs scan, check, and plan phases but skips generate and execute. Dry run MUST NOT modify `ilo-state.json`.

#### Scenario: Dry run output

- **WHEN** the user runs the loop with `--dry-run`
- **THEN** the system SHALL output the execution plan without modifying state or requesting artifact generation
