# spec-driven-framework

CLI-first execution engine for repo-native specs.

## Thesis

Spec-driven development works best when the system separates:

1. deterministic structure
2. human review checkpoints
3. agentic help for ambiguity

This repository exists to build that framework in a portable, repo-native way.

## Why This Shape

Recent public guidance on agentic systems converges on the same pattern:

- keep workflows simple and composable
- make intermediate state explicit
- validate before delegating
- prefer structured handoffs over free-form prompting

This framework follows that guidance by keeping discovery, graphing, validation, impact analysis, and slice packaging deterministic. Agents stay optional and sit on top of those artifacts rather than replacing them.

The bootstrap implementation is written in TypeScript and runs the local CLI directly with `tsx` during development. MCP is not the primary delivery surface; local commands and their structured outputs are.

## Goals

- support `rough spec -> implementation-ready -> verified and reconciled`
- stay portable across repos and domains
- prefer deterministic workflows for parsing, graph, validation, impact, and traceability
- use agents as optional extensions, not as the only source of truth

## Current Workstreams

1. spec lifecycle, relationships, and artifacts from no spec to implementation-ready
2. bounded agent workflow for implementation, verification, and reconciliation

## Core Workflows

- `discover`: find spec documents and extract metadata
- `graph`: build deterministic dependencies between specs
- `impact`: calculate required context and downstream effects for changed specs
- `validate`: fail fast on broken links, missing metadata, unresolved dependencies, and unknown spec types
- `slice`: package the validated context an agent or human needs for the next reviewable implementation step
- `readiness`: evaluate whether a target has enough context and validation coverage to start implementation
- later: `artifacts`, `trace`, `reconcile`

## Agentic Workflow Contract

The intended loop is:

1. write or update specs
2. run `validate`
3. run `graph` and `impact`
4. run `slice --changed ...`
5. review the bundle with a human
6. ask an agent to draft architecture or implementation slices using that bundle
7. validate downstream changes against the affected specs

This keeps the agent bounded by explicit context instead of letting it infer scope from the whole repository.

## CLI

```bash
npm run discover -- --adapter demo --repo .
npm run graph -- --adapter demo --repo .
npm run impact -- --adapter demo --repo . --changed examples/demo-repo/specs/features/f-01-income.md
npm run validate -- --adapter demo --repo .
npm run slice -- --adapter demo --repo . --changed examples/demo-repo/specs/features/f-01-income.md
npm run readiness -- --adapter demo --repo .
```

## CLI Contract

All commands return a stable JSON envelope:

```json
{
  "contractVersion": "0.1",
  "command": "graph",
  "adapter": "demo",
  "repo": "/path/to/repo",
  "ok": true,
  "result": {
    "nodes": [],
    "edges": []
  }
}
```

`slice` returns a structured JSON bundle with:

- changed specs
- required context specs
- affected downstream specs
- validation state
- template hints for the next slice

`readiness` returns target reports with:

- lifecycle stage
- required context
- artifact requirements for brief, architecture, and validation coverage
- blocking issues and warnings

## Development

```bash
npm run typecheck
npm test
npm run check
```

`npm test` currently covers the core validation and slice logic, including negative-path validation failures.

## Repo Adoption

Start from `src/adapters/template.json` and point it at your spec roots. The canonical source remains the repo-native spec corpus. Adapters translate that corpus into the internal execution graph instead of requiring a migration into a new authoring format.

## Status

Early bootstrap with deterministic discovery, graph, validation, impact, and slice handoff flows, plus a stable CLI output contract for future lifecycle and agent-loop work.
