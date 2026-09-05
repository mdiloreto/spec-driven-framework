# Architecture

## Layers

### 1. Core

Deterministic modules:

- adapters
- discovery
- command contracts
- graph evidence
- graph
- impact
- validation
- slice packaging
- templates

### 2. Workflow Layer

Named workflows built on top of core:

- `discover`
- `graph`
- `impact`
- `validate`
- `slice`
- `readiness`
- later: `artifacts`, `trace`, `reconcile`

### 3. Operator Layer

Operator integrations call the CLI instead of replacing it:

- local agents and skills
- hooks
- CI workflows
- repo-specific automation
- optional format emitters

## Canonical Source Rule

Repo-native specs remain the source of truth.

The framework does not require a full migration into a new spec authoring format. Its job is to compile existing repo-native artifacts into an internal execution graph that can drive deterministic workflows and bounded agent loops.

## Design Rule

If a problem can be solved deterministically, it belongs in core or workflow code.

If a problem requires judgment, drafting, or interpretation, it can be delegated to an extension.

## Agentic Boundary

The framework is intentionally opinionated about where agents start and stop.

- discovery, dependency resolution, validation, and slice packaging are deterministic
- command output contracts are deterministic
- architecture and implementation drafting are optional agent-assisted steps
- validation output is the hard gate before agent execution
- slice output is the structured handoff artifact for agent prompts, tool calls, or human review

This keeps the agent-computer interface explicit and debuggable.

## Graph Evidence

Execution graph edges carry extraction evidence.

- `explicit`: directly extracted from the source artifact
- `derived`: introduced by deterministic adapter rules or framework defaults
- `inferred`: reserved for future advisory-only relationship hints

Each edge should be explainable from the source repository rather than existing as hidden agent state.

## Workstreams

### 1. Spec Lifecycle and Artifacts

Deterministic lifecycle work covers:

- discovery and normalization
- relationship extraction
- impact analysis
- implementation readiness evaluation
- readiness and missing-artifact detection
- architecture, implementation, and validation artifact generation

### 2. Agent Loop and Reconciliation

The bounded agent workflow covers:

- agent handoff bundles
- implementation execution against bounded context
- verification and review gates
- drift and reconciliation reporting back to canonical specs

## CLI Contract

Commands return a stable envelope with:

- `contractVersion`
- `command`
- `adapter`
- `repo`
- `ok`
- `result`

The envelope is part of the product surface because local scripts, skills, agents, and CI can all consume it consistently.

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
