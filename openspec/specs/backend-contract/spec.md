# Backend Contract Specification

## Purpose

Defines the contract between the ILO and any backend execution runtime such as Claude Code or OpenCode. This specification ensures backends remain interchangeable and that orchestration stays deterministic.

## Requirements

### Requirement: Backend interface compliance

A backend SHALL expose an execution interface that accepts a prompt plus execution options and returns a structured result containing success state and output. Session continuation MAY be supported, but it SHALL remain behind the same backend contract.

#### Scenario: Initial execution

- **WHEN** the ILO sends a task prompt to a backend
- **THEN** the backend SHALL return a structured result containing at least `success` and `output`

#### Scenario: Session continuation

- **WHEN** the ILO resumes an interrupted backend session
- **THEN** the backend SHALL accept a session identifier and a new prompt
- **AND** return a structured result without changing the ILO's state model

### Requirement: Backend does not own orchestration state

Backends SHALL NOT be treated as the source of truth for loop state, task completion state, or execution ordering. That state SHALL remain owned by the ILO.

#### Scenario: Task marked complete

- **WHEN** a backend finishes executing task `1.2`
- **THEN** the backend MAY report success
- **BUT** only the ILO SHALL update `ilo-state.json` to record task completion

### Requirement: Backend consumes assembled context

Backends SHALL consume context assembled by the ILO rather than discovering project context independently as a prerequisite for execution.

#### Scenario: Task prompt preparation

- **WHEN** a backend receives a task prompt
- **THEN** that prompt SHALL already contain the proposal, design, specs, and relevant graph context needed for the task
- **AND** the backend SHALL not be required to reconstruct the orchestration context model on its own

### Requirement: Backend interchangeability

The framework SHALL support multiple backend implementations without requiring changes to the ILO workflow phases. Swapping Claude Code for OpenCode, or another future backend, SHALL be an integration change rather than an orchestration redesign.

#### Scenario: Runtime swap

- **WHEN** a project switches from Claude Code to OpenCode as the execution runtime
- **THEN** the ILO scan, check, generate, plan, and execute phases SHALL remain unchanged
