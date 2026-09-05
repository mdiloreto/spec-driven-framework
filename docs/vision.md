# Vision

`spec-driven-framework` is a portable CLI-first framework for building structured software delivery loops around repo-native specs.

It is not an IDE plugin and not a codegen-only product.

Its job is to make these flows repeatable across repositories:

- discover specs
- model dependencies
- calculate impact
- validate spec integrity
- determine implementation readiness
- draft architecture slices
- draft implementation slices
- reconcile code and specs after changes land
- keep human review in the loop

## Product Position

The framework sits between ad hoc prompting and heavyweight ALM tooling.

It should feel:

- repo-native
- CLI-first
- composable
- auditable
- vendor-neutral
- agent-ready without being agent-dependent

## Non-Goals for v0.1

- automatic multi-file code generation
- automatic PR creation after a spec changes
- full spec propagation in cascade without review
- monolithic autonomous agents
- MCP as a required runtime surface
- forced migration of existing specs into one authoring format

## Product Axes

The product has two top-level axes:

1. spec lifecycle, relationships, and artifact generation from rough spec state to implementation-ready
2. bounded agent workflow for implementation, verification, and reconciliation

## Agent Workflow Principles

The framework borrows three principles from current public agent guidance:

1. keep the deterministic path simple
2. surface intermediate artifacts for inspection
3. use structured handoffs instead of broad, implicit repo context
