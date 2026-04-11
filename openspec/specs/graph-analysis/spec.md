# Graph Analysis Specification

## Purpose

Provides cycle detection, impact analysis (upstream context + downstream affected), topological sorting, and parallel wave grouping on the spec-graph.

## Requirements

### Requirement: Cycle detection

The system SHALL detect cycles in the dependency graph and report them as errors. A cycle is defined as a set of nodes where following `depends_on` and `blocks` edges returns to the starting node. Edges of kind `impacts` and `extends` SHALL NOT be considered for cycle detection (they are informational, not ordering constraints).

#### Scenario: No cycles

- **WHEN** the graph has edges A → B → C with no back-edges
- **THEN** cycle detection SHALL report no cycles

#### Scenario: Direct cycle

- **WHEN** change A `depends_on` change B and change B `depends_on` change A
- **THEN** the system SHALL report a cycle containing `[A, B]`

#### Scenario: Informational edges excluded

- **WHEN** change A `impacts` capability X and capability X is referenced by change A
- **THEN** this SHALL NOT be reported as a cycle (impacts edges are excluded from cycle detection)

### Requirement: Impact analysis — upstream context

The system SHALL compute upstream context for a set of changed specs. Upstream context is the set of specs reachable by following dependency edges **backwards** from the changed specs (i.e., what the changed specs depend on). The result SHALL exclude the changed specs themselves.

#### Scenario: Direct upstream

- **WHEN** spec B `depends_on` spec A, and B is the changed spec
- **THEN** upstream context SHALL include A

#### Scenario: Transitive upstream

- **WHEN** C `depends_on` B, B `depends_on` A, and C is the changed spec
- **THEN** upstream context SHALL include both A and B

#### Scenario: No upstream

- **WHEN** spec A has no dependencies and A is the changed spec
- **THEN** upstream context SHALL be empty

### Requirement: Impact analysis — downstream affected

The system SHALL compute downstream affected specs for a set of changed specs. Downstream affected is the set of specs reachable by following dependency edges **forward** from the changed specs (i.e., what depends on the changed specs). The result SHALL exclude the changed specs themselves.

#### Scenario: Direct downstream

- **WHEN** spec B `depends_on` spec A, and A is the changed spec
- **THEN** downstream affected SHALL include B

#### Scenario: Transitive downstream

- **WHEN** C `depends_on` B, B `depends_on` A, and A is the changed spec
- **THEN** downstream affected SHALL include both B and C

#### Scenario: Multiple changed specs

- **WHEN** A and B are both changed, and C depends on A while D depends on B
- **THEN** downstream affected SHALL include both C and D (deduplicated)

### Requirement: Topological sort

The system SHALL produce a topological ordering of all nodes in the graph based on `depends_on` and `blocks` edges. Nodes with no dependencies MUST appear before nodes that depend on them. The sort MUST fail with a cycle error if cycles exist.

#### Scenario: Linear chain

- **WHEN** the graph has A → B → C (depends_on)
- **THEN** topological order SHALL be [A, B, C]

#### Scenario: Independent nodes

- **WHEN** nodes A, B, C have no edges between them
- **THEN** topological order SHALL contain all three (order among them is unspecified)

#### Scenario: Cycle error

- **WHEN** the graph contains a cycle
- **THEN** topological sort SHALL throw an error listing the nodes in the cycle

### Requirement: Wave grouping

The system SHALL group topologically sorted nodes into parallel execution waves. Wave 0 contains nodes with no incoming ordering edges. Wave N contains nodes whose ordering dependencies are all satisfied by waves 0 through N-1. Nodes within the same wave MAY be executed in parallel.

#### Scenario: Three waves

- **WHEN** A has no deps, B `depends_on` A, C `depends_on` A, D `depends_on` B and C
- **THEN** waves SHALL be `[[A], [B, C], [D]]`

#### Scenario: All independent

- **WHEN** nodes A, B, C have no ordering edges
- **THEN** all nodes SHALL be in wave 0: `[[A, B, C]]`

#### Scenario: Strict chain

- **WHEN** A → B → C → D (all depends_on)
- **THEN** each node SHALL be its own wave: `[[A], [B], [C], [D]]`
