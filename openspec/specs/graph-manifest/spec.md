# Graph Manifest Specification

## Purpose

Defines the persistent `spec-graph.json` format — the data structure that stores the dependency graph of OpenSpec capabilities and changes. The manifest is the single source of truth for cross-spec relationships and is consumed by the analysis engine, the ILO, and the CLI.

## Requirements

### Requirement: Manifest schema compliance

The system SHALL produce a `spec-graph.json` file conforming to a versioned schema with `version`, `generatedAt`, `nodes`, and `edges` fields. The `version` field MUST be a semver-compatible string. The `generatedAt` field MUST be an ISO 8601 timestamp.

#### Scenario: Valid manifest generation

- **WHEN** the graph builder produces a manifest from scanned data
- **THEN** the output file MUST contain `version: "1.0"`, a valid ISO 8601 `generatedAt`, a `nodes` array, and an `edges` array

#### Scenario: Empty project

- **WHEN** the project has an OpenSpec directory but no specs or changes
- **THEN** the manifest MUST be valid with `nodes: []` and `edges: []`

### Requirement: Node representation

The system SHALL represent each OpenSpec capability and each OpenSpec change as a distinct node. Capability nodes MUST have `type: "capability"` and a `path` pointing to the spec directory. Change nodes MUST have `type: "change"`, a `path` pointing to the change directory, a `status` field, and an `artifacts` object indicating which artifacts exist.

#### Scenario: Capability node

- **WHEN** `openspec/specs/user-auth/spec.md` exists
- **THEN** a node with `id: "capability:user-auth"`, `slug: "user-auth"`, `type: "capability"`, `path: "openspec/specs/user-auth"` MUST appear in the manifest

#### Scenario: Change node with partial artifacts

- **WHEN** `openspec/changes/add-oauth/` exists with `proposal.md` and `design.md` but no `tasks.md` or `specs/`
- **THEN** a node with `id: "change:add-oauth"`, `slug: "add-oauth"`, `type: "change"`, `artifacts: { proposal: true, design: true, specs: false, tasks: false }` MUST appear

### Requirement: Edge representation

The system SHALL represent relationships between nodes as directed edges with a `from`, `to`, `kind`, and optional `reason` field. The `kind` field MUST be one of: `depends_on`, `impacts`, `extends`, `blocks`.

#### Scenario: Explicit dependency edge

- **WHEN** change `add-payment` has frontmatter `depends-on: [{ capability: user-auth, kind: depends_on }]`
- **THEN** an edge `{ from: "change:add-payment", to: "capability:user-auth", kind: "depends_on" }` MUST appear

#### Scenario: Edge deduplication

- **WHEN** the same relationship is declared both in frontmatter and via a markdown link
- **THEN** only one edge with that `from`, `to`, and `kind` combination SHALL appear

### Requirement: Manifest file location

The system SHALL write `spec-graph.json` to the project root directory, adjacent to the `openspec/` directory.

#### Scenario: File placement

- **WHEN** the graph is built for a project at `/home/user/my-project`
- **THEN** the manifest MUST be written to `/home/user/my-project/spec-graph.json`
