# Architecture

## Layers

### 1. Core

Deterministic modules:

- adapters
- discovery
- graph
- impact
- templates

### 2. Workflow Layer

Named workflows built on top of core:

- `discover`
- `graph`
- `impact`
- later: `slice`, `review`, `sync`

### 3. Extension Layer

Optional integrations:

- agents
- hooks
- CI workflows
- repo-specific automation

## Design Rule

If a problem can be solved deterministically, it belongs in core or workflow code.

If a problem requires judgment, drafting, or interpretation, it can be delegated to an extension.

## Repo Shape

```text
spec-driven-framework/
├── docs/
├── examples/
├── src/
│   ├── cli/
│   ├── core/
│   └── adapters/
├── templates/
└── extensions/
```
