# Spec Graph Specification

## Purpose

Defines the spec-graph concept — a persistent dependency graph that tracks relationships between specs and changes across an entire project. This is the methodology spec that defines WHAT a spec-graph is, what types of relationships it models, and how it enables impact analysis and execution ordering. The tool-specific implementation is covered by the `graph-*` capability specs.

## Requirements

### Requirement: Spec-graph as cross-spec dependency tracker

The spec-graph SHALL model relationships between OpenSpec capabilities (source-of-truth specs) and changes (proposed modifications) as a directed acyclic graph (DAG). Each node represents a capability or change. Each edge represents a dependency, impact, or ordering relationship.

#### Scenario: Graph with capabilities and changes

- **WHEN** a project has capabilities `user-auth` and `payments`, and changes `add-oauth` and `add-subscriptions`
- **THEN** the spec-graph SHALL contain 4 nodes (2 capabilities, 2 changes) with edges representing their relationships

### Requirement: Dependency types

The spec-graph SHALL support four types of directed edges between nodes:

- `depends_on`: the source node requires the target node to be implemented first
- `impacts`: the source node modifies behavior defined in the target node
- `extends`: the source node adds capabilities to the target node
- `blocks`: the source node must complete before the target node can start

Only `depends_on` and `blocks` edges SHALL be used for execution ordering and cycle detection. `impacts` and `extends` edges are informational.

#### Scenario: Ordering edges vs informational edges

- **WHEN** change A `depends_on` change B and change A `impacts` capability X
- **THEN** A must wait for B to complete (ordering), but A's relationship to X is informational only (no ordering constraint)

### Requirement: Explicit dependency declaration

Spec authors SHALL declare cross-spec dependencies explicitly using a `depends-on` field in YAML frontmatter at the top of spec and proposal files. Each declaration MUST specify the target (capability or change name) and the relationship kind.

#### Scenario: Frontmatter dependency

- **WHEN** a proposal includes frontmatter `depends-on: [{ capability: user-auth, kind: depends_on }]`
- **THEN** the spec-graph SHALL include a `depends_on` edge from this change to `user-auth`

### Requirement: Impact analysis

The spec-graph SHALL support impact analysis: given a set of changed specs, compute which other specs are affected upstream (what you need to understand) and downstream (what needs review or re-implementation).

#### Scenario: Upstream context

- **WHEN** a developer is about to modify the `payments` capability
- **THEN** the spec-graph SHALL identify all capabilities and changes that `payments` depends on — this is the context the developer needs

#### Scenario: Downstream impact

- **WHEN** the `user-auth` capability is modified
- **THEN** the spec-graph SHALL identify all changes and capabilities that depend on `user-auth` — these may need review or updates

### Requirement: Execution ordering

The spec-graph SHALL produce a topological ordering of changes for implementation. Changes with no dependencies SHALL be implementable first. Changes with dependencies SHALL wait until their dependencies are complete. Independent changes at the same level SHALL be grouped into parallel execution waves.

#### Scenario: Wave-based ordering

- **WHEN** the project has 5 changes with dependencies forming a diamond pattern (A → B, A → C, B → D, C → D)
- **THEN** the execution order SHALL be: Wave 0 [A], Wave 1 [B, C], Wave 2 [D]

### Requirement: Cycle prevention

The spec-graph SHALL detect and report cycles in ordering edges (`depends_on`, `blocks`). Cycles indicate a design problem — two changes cannot both depend on each other. The spec-graph MUST report cycles clearly, listing the nodes involved.

#### Scenario: Cycle detected

- **WHEN** change A `depends_on` change B and change B `depends_on` change A
- **THEN** the spec-graph SHALL report: "Cycle detected: A → B → A"
- **AND** topological ordering SHALL fail with an actionable error

### Requirement: Suspect link tracking

The spec-graph SHALL support marking downstream specs as "suspect" when an upstream spec changes. A suspect spec has not been reviewed since its dependency was modified. This is informational — it does not block implementation but flags specs that may need updating.

#### Scenario: Upstream change triggers suspect marking

- **WHEN** capability `user-auth` is modified (archived with delta specs)
- **THEN** all changes that `depend_on` or are `impacted_by` `user-auth` SHALL be marked as suspect in the spec-graph
- **AND** the suspect flag SHALL be cleared when the downstream spec is reviewed and confirmed still valid
