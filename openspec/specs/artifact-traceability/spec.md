# Artifact Traceability Specification

## Purpose

Defines the traceability contract across the spec-driven development lifecycle. It ensures that every implementation task can be traced back through the EAD and specs to the original product intent in the PFB.

## Requirements

### Requirement: Linear traceability chain

Every change SHALL preserve the traceability chain `proposal.md` -> `specs/` -> `design.md` -> `tasks.md` -> implementation. Downstream artifacts SHALL depend on and stay within the scope defined by upstream artifacts.

#### Scenario: Task traceability

- **WHEN** a reviewer reads a task in `tasks.md`
- **THEN** they SHALL be able to identify the design decision it implements
- **AND** the underlying requirement in the specs
- **AND** the motivating intent in the proposal

### Requirement: Scope containment

No downstream artifact SHALL introduce scope outside the PFB's declared capabilities and boundaries without first updating the PFB.

#### Scenario: Out-of-scope task

- **WHEN** a task introduces work for `notifications` but the proposal only covers `user-auth`
- **THEN** the change SHALL be considered out of scope
- **AND** the proposal SHALL be updated before the task plan is accepted as complete

### Requirement: EAD decision coverage

Every material design decision in `design.md` SHALL be covered by one or more tasks in `tasks.md`. A missing mapping indicates an incomplete implementation plan.

#### Scenario: Unmapped decision

- **WHEN** the EAD states `Use Kahn's algorithm for wave planning`
- **AND** `tasks.md` contains no task for topological ordering or wave planning
- **THEN** the implementation plan SHALL be considered incomplete

### Requirement: Context bundle traceability

When the ILO assembles context for a task, the bundle SHALL preserve links to the originating change and its upstream artifacts. Context assembly SHALL not strip away the artifact lineage needed for review.

#### Scenario: Context for task execution

- **WHEN** the ILO assembles context for task `3.2 Implement dependency scanner`
- **THEN** the context bundle SHALL include the current change's proposal, design, and relevant specs
- **AND** any upstream graph context needed to understand the task's dependency chain
