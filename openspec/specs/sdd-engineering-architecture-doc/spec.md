# Engineering Architecture Document (EAD) Specification

## Purpose

Defines the structure, content, and quality requirements for an Engineering Architecture Document — the third artifact in the SDD lifecycle (after PFB and specs). The EAD establishes HOW the change will be implemented. It translates spec requirements into technical decisions, architecture choices, and trade-off analysis.

## Requirements

### Requirement: EAD structure

An EAD SHALL contain the following sections: Context (background and constraints), Goals/Non-Goals (what this design achieves and excludes), Decisions (key technical choices with rationale), and Risks/Trade-offs (known limitations and mitigations). Optional sections: Migration Plan, Open Questions.

#### Scenario: Complete EAD

- **WHEN** an EAD is created for a change
- **THEN** it MUST contain non-empty Context, Goals/Non-Goals, and Decisions sections

#### Scenario: EAD without decisions

- **WHEN** an EAD has no Decisions section or an empty one
- **THEN** the artifact checker SHALL report it as invalid — every change requires at least one explicit technical decision

### Requirement: EAD depends on specs

The EAD SHALL be created after specs are complete. Every design decision in the EAD MUST trace back to one or more spec requirements. The EAD SHALL NOT introduce behavioral requirements — those belong in the specs.

#### Scenario: Decision traceability

- **WHEN** the EAD includes "Decision: Use PostgreSQL for data storage"
- **THEN** it SHOULD reference the spec requirement that necessitates persistent data storage

#### Scenario: Behavioral leak

- **WHEN** the EAD introduces "Users SHALL be able to filter exports by date range" — a new behavioral requirement
- **THEN** this SHOULD be flagged as belonging in the specs, not the EAD

### Requirement: Decision format

Each decision in the EAD SHALL follow a structured format: the decision statement, the rationale (why this choice over alternatives), alternatives considered (at least one), and trade-offs accepted.

#### Scenario: Well-structured decision

- **WHEN** a decision states "Use tsup for bundling" with rationale "Zero-config, supports ESM and CJS, handles declaration files" and alternatives "esbuild (no dts), rollup (complex config), tsc only (slow)"
- **THEN** the EAD SHALL be considered to have a well-structured decision

#### Scenario: Decision without rationale

- **WHEN** a decision states "Use Redis for caching" with no rationale or alternatives
- **THEN** this SHOULD be flagged as an incomplete decision

### Requirement: Risks and mitigations

The Risks/Trade-offs section SHALL identify known risks with explicit mitigations. Each risk MUST follow the format: [Risk description] → Mitigation strategy.

#### Scenario: Risk with mitigation

- **WHEN** the EAD states "[Full table scan on large datasets] → Add database index on export_date column; paginate results with cursor-based pagination"
- **THEN** the EAD SHALL be considered to have a properly documented risk

### Requirement: EAD scope alignment with PFB

The EAD SHALL NOT design capabilities beyond the PFB's declared scope. If the EAD discovers that additional capabilities are needed, the PFB MUST be updated first.

#### Scenario: Scope creep detection

- **WHEN** the EAD designs a notification system that was not in the PFB's capabilities list
- **THEN** the artifact checker SHALL report: "EAD designs capability 'notifications' not declared in PFB"
