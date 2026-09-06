## Why

No AI-native spec-driven development tool provides cross-spec dependency tracking or impact analysis. OpenSpec, Kiro, Spec Kit, GSD, and Taskmaster AI all handle dependencies within a single change or task — none track how specs relate to each other across changes, how modifying one spec affects others, or in what order a set of changes should be implemented. Enterprise ALM tools (Jama, DOORS) solve this but are proprietary, non-git-native, and disconnected from AI coding agents. The spec-graph engine fills this gap: a persistent, queryable DAG that sits on top of OpenSpec and adds cross-spec relationships, impact analysis, and topological execution ordering.

## What Changes

- New `spec-graph.json` manifest format: persistent DAG storing nodes (OpenSpec capabilities and changes) and edges (dependency relationships)
- Graph scanner that reads OpenSpec `specs/` and `changes/` directories, extracts dependency declarations from frontmatter `depends-on` fields, and detects cross-references from markdown links
- Dependency graph builder with cycle detection and edge deduplication
- Impact analysis engine: given a changed spec, compute upstream context (what you need to understand) and downstream affected (what needs review/re-implementation)
- Topological sort with parallel wave grouping: order changes for execution, grouping independent changes into waves that can run concurrently
- "Suspect link" marking: when an upstream spec changes, flag downstream specs as needing review
- CLI commands: `graph build`, `graph impact`, `graph order`, `graph show`

Evolves the prototype's `graph.mjs` (edge types, dedup) and `impact.mjs` (BFS upstream/downstream) from commit `9bfd117`, replacing raw markdown file scanning with OpenSpec-aware discovery. Drops the prototype's `discover.mjs`, `frontmatter.mjs`, `markdown.mjs` (OpenSpec handles parsing), and `adapters.mjs` (replaced by OpenSpec `config.yaml` + `spec-graph.json`).

## Capabilities

### New Capabilities

- `graph-manifest`: Persistent `spec-graph.json` format — nodes, edges, metadata, versioning
- `graph-scanner`: Reads OpenSpec directories, extracts dependency declarations, builds the in-memory graph
- `graph-analysis`: Cycle detection, impact analysis (upstream/downstream BFS), topological ordering with parallel waves
- `graph-cli`: CLI commands for building, querying, and visualizing the dependency graph

### Modified Capabilities

_(none — no existing OpenSpec specs to modify)_

## Impact

- New TypeScript package with CLI entry point
- Reads OpenSpec directory structure (non-destructive, read-only)
- Produces `spec-graph.json` alongside `openspec/` directory
- No modifications to OpenSpec itself — pure extension layer
- Future consumers: ILO (implementation-loop-orchestrator) will use graph-analysis APIs
