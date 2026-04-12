# Framework Architecture Specification

## Purpose

Defines the high-level architecture boundaries of the spec-driven framework. This specification establishes the responsibilities and ownership of the major layers: OpenSpec, the spec-graph engine, the Implementation Loop Orchestrator (ILO), and backend agents. It prevents overlap between narrative docs and normative system contracts.

## Requirements

### Requirement: Layered architecture boundaries

The framework SHALL be organized into four logical layers with distinct responsibilities:

- OpenSpec: artifact lifecycle within a single change
- Spec Graph: cross-change and cross-capability dependency modeling
- ILO: end-to-end orchestration across changes
- Backend Agent: artifact drafting and code execution

#### Scenario: Single-change artifact management

- **WHEN** a user needs to know whether `proposal.md`, `design.md`, `specs/`, or `tasks.md` exist for a change
- **THEN** OpenSpec SHALL be treated as the source of truth for that artifact lifecycle state
- **AND** the ILO SHALL consume that state rather than redefining the artifact model

#### Scenario: Cross-change ordering

- **WHEN** the system needs to determine whether change `add-payments` must wait for `add-auth`
- **THEN** the Spec Graph SHALL own that dependency and ordering decision
- **AND** neither OpenSpec nor the backend agent SHALL invent execution order independently

### Requirement: ILO as coordinator, not author

The ILO SHALL coordinate the workflow across changes, but it SHALL NOT be treated as the semantic author of specs, EADs, implementation plans, or code changes. The ILO may detect missing artifacts, assemble context, and issue generation requests, but the resulting content is authored by a human or backend agent.

#### Scenario: Missing design artifact

- **WHEN** `design.md` is missing for a change
- **THEN** the ILO SHALL emit a structured generation request with relevant context
- **AND** a backend agent or human SHALL create the artifact

### Requirement: Clear ownership of execution prompts

The system SHALL treat context bundles and execution prompts as ILO-owned orchestration outputs. Backend agents SHALL consume those prompts and return results, but SHALL NOT define the orchestration model or loop state format.

#### Scenario: Task execution

- **WHEN** the ILO prepares task `2.3 Implement graph builder`
- **THEN** the ILO SHALL assemble the task context bundle and prompt
- **AND** the backend agent SHALL return execution output without mutating orchestration rules

### Requirement: Narrative vs normative separation

Repository guidance SHALL separate narrative documentation from normative specifications. `docs/` SHALL contain explanatory material, project planning, and architecture narrative. `openspec/specs/` SHALL contain durable contracts, invariants, and behavior the framework can validate or rely on.

#### Scenario: Research note

- **WHEN** maintainers document a comparison between OpenSpec and other tools
- **THEN** that material SHALL live in `docs/`
- **AND** it SHALL NOT be encoded as a normative spec unless it defines a lasting system contract

#### Scenario: Architecture invariant

- **WHEN** maintainers define that the ILO coordinates execution while the backend agent authors code
- **THEN** that rule SHALL live in `openspec/specs/`
