# Spec-Driven Framework

Spec-driven execution engine built on OpenSpec.

This project extends OpenSpec with two additional layers for end-to-end delivery:

- a Spec Graph for cross-change and cross-capability dependency modeling
- an Implementation Loop Orchestrator (ILO) for `scan -> check -> generate -> plan -> execute`

## Core Concepts

- OpenSpec: manages the artifact lifecycle within a single change
- Spec Graph: models dependencies, impact, and execution ordering across changes
- ILO: coordinates artifact checks, planning, context assembly, and execution flow
- Backend agent: consumes ILO prompts to draft artifacts or implement code

## Status

Experimental. Core service boundaries and specs are in place, but some runtime surfaces are still being wired.

## Quick Start

```bash
npm install
npm test
npm run typecheck
npm run sdf -- --help
npm run sdf -- ilo check
npm run sdf -- ilo plan
```

## Repository Structure

- `src/` - framework implementation
- `openspec/specs/` - durable framework and capability contracts
- `openspec/changes/` - concrete implementation initiatives
- `docs/` - narrative documentation, plans, and architecture notes

## Documentation

- [Project Overview](./docs/project-overview.md)
- [Information Architecture](./docs/information-architecture.md)
- [Workplan](./docs/workplan.md)
- [Implementation Log](./docs/implementation-log.md)
- [Testing Plan](./docs/testing-plan.md)
