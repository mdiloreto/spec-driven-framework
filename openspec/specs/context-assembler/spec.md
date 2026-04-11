# Context Assembler Specification

## Purpose

Assembles cross-change, spec-graph-aware context bundles for agent task execution. OpenSpec's `openspec instructions --json` already provides within-change context (template, project context, rules, dependency artifacts). This assembler adds what OpenSpec cannot: upstream context from the spec-graph (specs and changes that the current change depends on across the graph), downstream awareness (specs impacted by the change), and task-level context targeting (assembling context for a specific implementation task, not just for artifact creation).

## Requirements

### Requirement: Delegate within-change context to OpenSpec

The system SHALL use `openspec instructions --json` to retrieve within-change context (template, project context, rules, completed dependency artifacts) when assembling context for artifact generation. It SHALL NOT reimplement OpenSpec's context injection.

#### Scenario: Artifact generation context

- **WHEN** assembling context to generate a missing `design.md` for change `add-auth`
- **THEN** the system SHALL call `openspec instructions design --change add-auth --json` and include the returned context, template, and rules in the bundle

### Requirement: Cross-change upstream context from spec-graph

The system SHALL use the spec-graph's impact analysis to gather upstream dependencies that span across changes. For each upstream node, it MUST include the relevant spec content. This is context that OpenSpec cannot provide because it has no cross-change dependency tracking.

#### Scenario: Direct upstream inclusion

- **WHEN** change `add-payments` depends on capability `user-auth` in the spec-graph
- **THEN** the context bundle SHALL include `openspec/specs/user-auth/spec.md` in `upstreamContext.specs`

#### Scenario: Transitive upstream

- **WHEN** `add-payments` depends on `add-oauth` which depends on `user-auth`
- **THEN** the context bundle SHALL include both `add-oauth` (as upstream change) and `user-auth` (as upstream spec)

### Requirement: Task-level context assembly

The system SHALL assemble context targeted at a specific implementation task (from `tasks.md`), not just for artifact creation. The bundle MUST include: the task description, the change's proposal, design, and relevant specs, plus the cross-change upstream context.

#### Scenario: Full task context bundle

- **WHEN** assembling context for task "1.1 Create user model" in change `add-auth`
- **THEN** the bundle SHALL contain:
  - `task.id`, `task.description`, `task.fromChange`
  - `proposal`: full text of `add-auth/proposal.md`
  - `design`: full text of `add-auth/design.md`
  - `specs`: full text of all spec files in `add-auth/specs/`
  - `upstreamContext.specs`: upstream capability specs from the spec-graph
  - `upstreamContext.changes`: summary of upstream completed changes

### Requirement: Related specs inclusion

The system SHALL include specs that the current change impacts (downstream), for awareness. These are read-only context to prevent the agent from making breaking changes to downstream consumers.

#### Scenario: Downstream awareness

- **WHEN** change `add-auth` impacts capability `user-profiles`
- **THEN** the context bundle SHALL include `user-profiles/spec.md` in `relatedSpecs`

### Requirement: Output format

The system SHALL support JSON output (default) and markdown output (`--format markdown`). JSON output MUST be machine-parseable. Markdown output SHALL concatenate all context sections with clear headers for human reading.

#### Scenario: JSON output

- **WHEN** the context is assembled with default format
- **THEN** the output SHALL be a valid JSON object matching the `ContextBundle` type

#### Scenario: Markdown output

- **WHEN** the context is assembled with `--format markdown`
- **THEN** the output SHALL be a markdown document with `# Task`, `# Proposal`, `# Design`, `# Specs`, `# Upstream Context`, `# Related Specs` sections

### Requirement: Token budget awareness

The system SHALL accept an optional `--max-tokens` parameter. When set, it MUST prioritize direct dependencies over transitive ones, and truncate the least-relevant upstream context to fit within the budget. The task, proposal, design, and direct specs SHALL never be truncated.

#### Scenario: Budget exceeded

- **WHEN** the full context bundle exceeds the token budget
- **THEN** the system SHALL drop transitive upstream specs first, then related specs, keeping task + proposal + design + direct specs intact
- **AND** the output SHALL include a `truncated: true` flag with a list of omitted sources
