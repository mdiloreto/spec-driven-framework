# Artifact Checker Specification

## Purpose

Provides cross-change and spec-graph-aware validation that OpenSpec does not cover. OpenSpec already validates structural correctness of individual changes (`openspec validate`) and tracks artifact existence (`openspec status --json`). This checker adds: cross-change coherence (does change A's design align with change B's specs?), spec-graph dependency validation (do `depends-on` frontmatter declarations point to real nodes?), and capability coverage gaps (does the proposal list capabilities that have no matching spec files?).

## Requirements

### Requirement: Delegate structural validation to OpenSpec

The system SHALL use `openspec validate --json` for structural validation of individual changes and specs. It SHALL NOT reimplement checks that OpenSpec already performs (delta header format, scenario presence, artifact file existence).

#### Scenario: OpenSpec validation pass-through

- **WHEN** the checker validates change `add-auth`
- **THEN** it SHALL first run `openspec validate add-auth --json` and include any OpenSpec issues in its report

#### Scenario: OpenSpec validation failure

- **WHEN** `openspec validate add-auth --json` reports structural issues
- **THEN** the checker SHALL include those issues and mark the change as invalid without running further cross-change checks

### Requirement: Spec-graph dependency validation

The system SHALL verify that all `depends-on` declarations in frontmatter point to nodes that exist in the spec-graph. A dependency referencing a non-existent capability or change MUST be reported as an issue.

#### Scenario: Valid dependency reference

- **WHEN** change `add-payment` declares `depends-on: [{ capability: user-auth, kind: depends_on }]` and `user-auth` exists in the spec-graph
- **THEN** the checker SHALL report no dependency issues

#### Scenario: Dangling dependency reference

- **WHEN** change `add-payment` declares `depends-on: [{ capability: billing-engine, kind: depends_on }]` but `billing-engine` is not in the spec-graph
- **THEN** the checker SHALL report issue: `"Dependency references non-existent capability: billing-engine"`

### Requirement: Cross-change coherence check

The system SHALL verify that when change A depends on change B, change B's capability specs are consistent with change A's assumptions. Specifically: if change A's design references capabilities introduced by change B, those capabilities MUST exist in change B's delta specs.

#### Scenario: Coherent dependency chain

- **WHEN** change `add-payment` depends on `add-auth`, and `add-payment/design.md` references the `user-auth` capability that `add-auth` introduces
- **THEN** the checker SHALL report no cross-change coherence issues

#### Scenario: Incoherent dependency

- **WHEN** change `add-payment` depends on `add-auth`, but `add-payment/design.md` references a capability `session-management` that `add-auth` does not introduce
- **THEN** the checker SHALL report a warning: `"Change add-payment references capability session-management not provided by dependency add-auth"`

### Requirement: Coherence summary with spec-graph context

The system SHALL produce a summary report that combines OpenSpec's structural validation with spec-graph-aware checks. The verdict MUST be: `complete` (all OpenSpec + graph checks pass), `partial` (OpenSpec passes but graph checks have warnings), or `invalid` (OpenSpec validation fails).

#### Scenario: Complete verdict

- **WHEN** OpenSpec validation passes and all dependency references resolve
- **THEN** the summary verdict SHALL be `complete`

#### Scenario: Partial verdict with warnings

- **WHEN** OpenSpec validation passes but a dangling dependency reference exists
- **THEN** the summary verdict SHALL be `partial` with the dangling reference listed as a warning
