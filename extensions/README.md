# Extensions

This directory is reserved for optional integrations:

- agents
- hooks
- CI workflows
- repo bootstrap helpers

The framework core should stay useful without anything in this directory.

Extensions should consume deterministic artifacts from core workflows, especially `validate` and `slice`, instead of re-deriving repository context on their own.
