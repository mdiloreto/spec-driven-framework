# Vision

`spec-driven-framework` is a portable framework for building structured software delivery loops around specs.

It is not an IDE plugin and not a codegen-only product.

Its job is to make these flows repeatable across repositories:

- discover specs
- model dependencies
- calculate impact
- draft architecture slices
- draft implementation slices
- keep human review in the loop

## Product Position

The framework sits between ad hoc prompting and heavyweight ALM tooling.

It should feel:

- repo-native
- composable
- auditable
- vendor-neutral

## Non-Goals for v0.1

- automatic multi-file code generation
- automatic PR creation after a spec changes
- full spec propagation in cascade without review
- monolithic autonomous agents
