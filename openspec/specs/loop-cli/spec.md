# Loop CLI Specification

## Purpose

CLI commands for running, inspecting, and managing the implementation loop.

## Requirements

### Requirement: Run command

The system SHALL provide an `ilo run` command that executes the full implementation loop (scan → check → generate → plan → execute). It MUST support `--change <name>` to target a single change, `--dry-run` to skip mutations, `--debug-trace` to persist raw backend traces for debugging, and `--json` for machine-parseable output.

#### Scenario: Full loop run

- **WHEN** the user runs `ilo run`
- **THEN** the system SHALL process all active changes through the loop phases in topological order

#### Scenario: Targeted run

- **WHEN** the user runs `ilo run --change add-auth`
- **THEN** the system SHALL process only `add-auth` and its upstream dependencies

#### Scenario: Dry run

- **WHEN** the user runs `ilo run --dry-run`
- **THEN** the system SHALL output the plan without modifying state or requesting generation

#### Scenario: Debug traces enabled

- **WHEN** the user runs `ilo run --debug-trace`
- **THEN** the system SHALL persist raw backend execution traces under `.sdf/traces/`
- **AND** the default journal SHALL remain the SDF-level execution log

### Requirement: Status command

The system SHALL provide an `ilo status` command that displays the current state of all changes in the loop. Output MUST show each change's status, artifact states, blocked-by relationships, and completed task counts.

#### Scenario: Status display

- **WHEN** the user runs `ilo status`
- **THEN** the system SHALL print a table with columns: Change, Status, Proposal, Design, Specs, Tasks, Progress

#### Scenario: JSON status

- **WHEN** the user runs `ilo status --json`
- **THEN** the output SHALL be the full `.sdf/ilo-state.json` content

### Requirement: Check command

The system SHALL provide an `ilo check` command that runs only the scan and check phases, reporting artifact completeness and coherence issues without proceeding to generation or execution.

#### Scenario: Check with issues

- **WHEN** `ilo check` finds missing specs for change `add-auth`
- **THEN** it SHALL print the issues and exit with code 1

#### Scenario: Check all clear

- **WHEN** `ilo check` finds no issues
- **THEN** it SHALL print "All changes pass coherence checks" and exit with code 0

### Requirement: Plan command

The system SHALL provide an `ilo plan` command that outputs the execution plan (topological order, wave grouping, task lists) without executing it.

#### Scenario: Plan output

- **WHEN** the user runs `ilo plan`
- **THEN** the system SHALL print the execution plan showing waves, changes per wave, and tasks per change

#### Scenario: Plan with blocked changes

- **WHEN** some changes are blocked
- **THEN** the plan SHALL show blocked changes separately with their blocking dependencies

### Requirement: Unified CLI entry point

The system SHALL provide a single entry point `sdf` (spec-driven-framework) that dispatches to both graph and ilo subcommands: `sdf graph build`, `sdf graph impact`, `sdf ilo run`, `sdf ilo status`, etc.

#### Scenario: Graph subcommand

- **WHEN** the user runs `sdf graph build`
- **THEN** the system SHALL execute the spec-graph build command

#### Scenario: ILO subcommand

- **WHEN** the user runs `sdf ilo run`
- **THEN** the system SHALL execute the implementation loop run command

#### Scenario: Help text

- **WHEN** the user runs `sdf --help`
- **THEN** the system SHALL display available subcommands: `graph`, `ilo`
