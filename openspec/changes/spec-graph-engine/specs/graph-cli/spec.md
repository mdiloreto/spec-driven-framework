# Graph CLI Specification

## Purpose

CLI commands for building, querying, and displaying the spec dependency graph.

## ADDED Requirements

### Requirement: Build command

The system SHALL provide a `graph build` command that scans the OpenSpec directory, constructs the dependency graph, and writes `spec-graph.json`. The command MUST print a summary of nodes and edges discovered. The command MUST exit with code 0 on success and code 1 on error.

#### Scenario: Successful build

- **WHEN** the user runs `spec-graph build` in a project with OpenSpec initialized
- **THEN** the system SHALL write `spec-graph.json` and print: `Built graph: X nodes, Y edges`

#### Scenario: No OpenSpec directory

- **WHEN** the user runs `spec-graph build` in a directory without `openspec/`
- **THEN** the system SHALL print an error message and exit with code 1

#### Scenario: Cycle detected during build

- **WHEN** the graph contains cycles
- **THEN** the system SHALL write `spec-graph.json` (with cycle info), print a warning listing the cycle, and exit with code 0 (cycles are warnings, not fatal errors during build)

### Requirement: Impact command

The system SHALL provide a `graph impact --changed <spec-path>` command that computes upstream context and downstream affected for the specified spec(s). The `--changed` flag MUST be repeatable for multiple specs. Output MUST include `changed`, `upstreamContext`, and `downstreamAffected` arrays.

#### Scenario: Single spec impact

- **WHEN** the user runs `spec-graph impact --changed openspec/specs/user-auth/spec.md`
- **THEN** the system SHALL print JSON with `changed`, `upstreamContext`, and `downstreamAffected`

#### Scenario: JSON output format

- **WHEN** the user adds `--json` flag
- **THEN** the output MUST be machine-parseable JSON (no decorative text)

#### Scenario: Spec not found

- **WHEN** the `--changed` path does not match any node in the graph
- **THEN** the system SHALL print a warning and compute impact for the remaining valid paths

### Requirement: Order command

The system SHALL provide a `graph order` command that prints the topological execution order of all changes, grouped by parallel waves.

#### Scenario: Wave output

- **WHEN** the graph has changes in 3 waves
- **THEN** the output SHALL show each wave with its changes, e.g.:
  ```
  Wave 0: auth-system, base-config
  Wave 1: add-oauth, user-profiles
  Wave 2: payment-flow
  ```

#### Scenario: JSON output

- **WHEN** the user adds `--json` flag
- **THEN** the output MUST be a JSON array of arrays (each inner array is a wave of change names)

### Requirement: Show command

The system SHALL provide a `graph show` command that displays the current graph summary. Default output SHALL show node count, edge count, and a list of nodes grouped by type. With `--json`, output the full `spec-graph.json` content.

#### Scenario: Summary display

- **WHEN** the user runs `spec-graph show`
- **THEN** the system SHALL print capabilities, changes, and edge counts in human-readable format

#### Scenario: Stale graph warning

- **WHEN** any spec or change file has a modification time newer than `spec-graph.json`
- **THEN** the system SHALL print a warning: `Graph may be stale. Run 'spec-graph build' to refresh.`
