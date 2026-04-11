# Graph Scanner Specification

## Purpose

Extracts cross-spec dependency declarations that OpenSpec does not track — frontmatter `depends-on` fields, markdown cross-references between specs/changes, and delta spec impact relationships — and produces raw graph data for the builder. Delegates spec and change discovery to OpenSpec CLI (`openspec list --specs --json`, `openspec list --json`, `openspec status --json`).

## Requirements

### Requirement: Delegate discovery to OpenSpec

The system SHALL use OpenSpec CLI commands to discover capabilities and changes rather than scanning the filesystem directly. Capability discovery MUST use `openspec list --specs --json`. Change discovery MUST use `openspec list --json`. Artifact existence MUST use `openspec status --change <name> --json`.

#### Scenario: Capability discovery via OpenSpec

- **WHEN** the scanner runs and OpenSpec lists specs `user-auth`, `payments`, `notifications`
- **THEN** the scanner SHALL produce three raw nodes with IDs matching the OpenSpec output

#### Scenario: Change discovery via OpenSpec

- **WHEN** OpenSpec lists active changes `add-oauth` and `add-payment`
- **THEN** the scanner SHALL produce two change nodes, excluding any archived changes (OpenSpec handles the filtering)

#### Scenario: Artifact existence via OpenSpec

- **WHEN** `openspec status --change add-oauth --json` reports artifacts with statuses
- **THEN** the change node SHALL derive artifact existence from the OpenSpec status response

### Requirement: Frontmatter dependency extraction

The system SHALL extract dependency declarations from an optional YAML frontmatter block (delimited by `---`) at the top of `proposal.md`, `design.md`, and `specs/**/spec.md` files. The frontmatter field `depends-on` MUST be parsed as an array of dependency objects with `capability` or `change` and `kind` fields. This is the primary value-add over OpenSpec, which has no cross-spec dependency tracking.

#### Scenario: Frontmatter with dependencies

- **WHEN** `openspec/changes/add-payment/proposal.md` starts with:
  ```
  ---
  depends-on:
    - capability: user-auth
      kind: depends_on
    - change: add-oauth
      kind: blocks
  ---
  ```
- **THEN** the scanner SHALL produce edges: `add-payment → user-auth (depends_on)` and `add-payment → add-oauth (blocks)`

#### Scenario: No frontmatter

- **WHEN** a spec file has no `---` delimited frontmatter block
- **THEN** the scanner SHALL produce no frontmatter-based edges for that file and SHALL NOT error

#### Scenario: Malformed frontmatter

- **WHEN** a spec file has frontmatter with invalid YAML syntax
- **THEN** the scanner SHALL emit a warning with the file path and continue scanning other files

### Requirement: Markdown cross-reference extraction

The system SHALL detect markdown links (`[text](path)`) pointing to other spec or change files within the `openspec/` directory. Non-HTTP, non-anchor links to files matching `openspec/specs/**` or `openspec/changes/**` SHALL produce `impacts` edges.

#### Scenario: Cross-reference link

- **WHEN** `openspec/changes/add-payment/design.md` contains `[see auth spec](../../specs/user-auth/spec.md)`
- **THEN** the scanner SHALL produce an edge `add-payment → user-auth (impacts)`

#### Scenario: External links ignored

- **WHEN** a spec contains `[docs](https://example.com/docs)`
- **THEN** the scanner SHALL NOT produce any edge for that link

### Requirement: Delta spec impact detection

The system SHALL detect which capabilities a change impacts by scanning the change's `specs/` subdirectory. Each `specs/<capability>/spec.md` within a change directory indicates that the change impacts that capability.

#### Scenario: Delta spec detection

- **WHEN** change `add-oauth` has `specs/user-auth/spec.md` (a delta spec)
- **THEN** the scanner SHALL produce an edge `add-oauth → user-auth (impacts)`
