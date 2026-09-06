# Implementation Plan Specification

## Purpose

Defines the structure, content, and quality requirements for an Implementation Plan — the fourth artifact in the SDD lifecycle (after PFB, specs, and EAD). The implementation plan translates the EAD's design decisions into ordered, actionable tasks that a developer or AI agent can execute.

## Requirements

### Requirement: Implementation plan structure

An implementation plan SHALL be a markdown document with numbered section headings (`## 1. Group Name`) containing checkbox tasks (`- [ ] X.Y Task description`). Tasks MUST use the `- [ ]` / `- [x]` format for progress tracking.

#### Scenario: Valid implementation plan

- **WHEN** an implementation plan is created
- **THEN** it MUST contain at least one numbered section with at least one checkbox task

#### Scenario: Tasks without checkboxes

- **WHEN** an implementation plan lists tasks as plain bullet points (`- Task description`) without checkbox syntax
- **THEN** the artifact checker SHALL report: "tasks.md has tasks without checkbox format — they won't be tracked"

### Requirement: Task granularity

Each task SHALL be small enough to complete in a single coding session (approximately 1-4 hours of work). Tasks MUST be specific and verifiable — the developer knows when a task is done.

#### Scenario: Well-scoped task

- **WHEN** a task reads "1.3 Implement `buildGraph()` in `src/graph/builder.ts`: takes scanner output, produces `SpecGraph`"
- **THEN** it SHALL be considered a well-scoped task (specific file, specific function, specific input/output)

#### Scenario: Vague task

- **WHEN** a task reads "2.1 Implement the backend"
- **THEN** this SHOULD be flagged as too vague — it should be broken into specific subtasks

### Requirement: Task ordering by dependency

Tasks SHALL be ordered so that dependencies come before dependents. Setup tasks (project config, type definitions) MUST precede implementation tasks. Implementation tasks MUST precede integration tests. Within each section, tasks SHOULD be ordered by their natural dependency chain.

#### Scenario: Correct ordering

- **WHEN** task "2.1 Define types" appears before "2.2 Implement function using those types"
- **THEN** the ordering SHALL be considered correct

#### Scenario: Broken ordering

- **WHEN** task "3.1 Write integration tests" appears before "2.1 Implement the module under test"
- **THEN** this SHOULD be flagged as a dependency ordering issue

### Requirement: Task grouping into phases

Tasks SHALL be grouped into logical phases using numbered markdown headings. Common phases: Setup, Type Definitions, Core Implementation (by module), Integration, Testing. Each phase SHOULD be independently completable.

#### Scenario: Phase grouping

- **WHEN** tasks are grouped as "1. Project Setup", "2. Type Definitions", "3. Scanner", "4. Builder", "5. Tests"
- **THEN** the plan SHALL be considered well-structured

### Requirement: Coverage of EAD decisions

The implementation plan SHALL include tasks that cover every design decision in the EAD. Each decision SHOULD map to one or more implementation tasks. Decisions without corresponding tasks indicate gaps in the plan.

#### Scenario: Full coverage

- **WHEN** the EAD has 5 decisions and the implementation plan has tasks traceable to each
- **THEN** the plan SHALL be considered to have full EAD coverage

#### Scenario: Missing coverage

- **WHEN** the EAD decides "Use Kahn's algorithm for cycle detection" but no task mentions cycle detection
- **THEN** the artifact checker SHOULD report: "EAD decision 'cycle detection' has no corresponding task"

### Requirement: Test tasks alongside implementation

The implementation plan SHALL include test tasks (unit tests, integration tests) alongside or immediately after the implementation tasks they verify. Tests SHALL NOT be deferred to a separate "testing phase" at the end.

#### Scenario: Co-located test tasks

- **WHEN** section "3. Scanner" contains "3.7 Implement delta spec detection" followed by "3.8 Write unit tests for scanner"
- **THEN** the plan SHALL be considered to have properly co-located test tasks

#### Scenario: Deferred testing

- **WHEN** all test tasks appear in a single section "9. Testing" at the end of the plan
- **THEN** this SHOULD be flagged as a practice concern — tests should be written alongside implementation
