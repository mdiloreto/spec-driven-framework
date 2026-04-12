## Why

OpenSpec provides a workflow for creating spec artifacts (proposal, design, specs, tasks) within a single change, but has no mechanism for orchestrating the full implementation lifecycle across multiple changes in a project. When a developer or AI agent faces a repo with dozens of feature specs, there is no tool that can: check which specs have complete PFB/EAD coverage, generate missing artifacts, create implementation plans, resolve cross-spec dependencies to determine execution order, and drive the implementation loop. The ILO bridges the gap between "specs exist" and "code gets written" by orchestrating the entire cycle as an automated, repeatable pipeline.

## What Changes

- Implementation loop engine that processes a set of OpenSpec changes in dependency order (consuming spec-graph topology)
- PFB (proposal.md) completeness checker — validates proposals exist and are coherent with related specs; generates missing proposals from codebase context
- EAD (design.md) completeness checker — validates designs exist and are consistent with their proposals and impacted capability specs; generates missing designs
- Implementation plan (tasks.md) generator — creates ordered task lists from PFB + EAD, ensuring tasks cover all design decisions and spec requirements
- Execution driver that walks tasks.md checkboxes, assembling context from the spec-graph (upstream dependencies, related specs) for each task
- Loop state tracking — hidden runtime checkpoints and journals for which changes are pending, in-progress, blocked, or complete
- Optional raw backend trace capture and summarization hooks for debugging agent execution without making traces authoritative
- CLI commands: `ilo run`, `ilo status`, `ilo check`, `ilo plan`
- Skill definitions for Claude Code and OpenCode

Builds on the spec-graph-engine for dependency ordering and impact analysis. Uses OpenSpec CLI (`openspec status`, `openspec instructions`) for artifact state queries. Does not modify OpenSpec internals.

## Capabilities

### New Capabilities

- `loop-engine`: Core orchestration loop — discover pending changes, check artifact completeness, generate missing artifacts, execute in topological order
- `artifact-checker`: Validates PFB/EAD/tasks existence and coherence; detects gaps and inconsistencies between artifacts
- `context-assembler`: Given a target spec/task, walks the spec-graph to collect all required upstream context into a structured bundle for agent consumption
- `loop-cli`: CLI commands for running, checking status, and managing the implementation loop
- `loop-skills`: Claude Code and OpenCode skill definitions that wrap the CLI

### Modified Capabilities

_(none — no existing OpenSpec specs to modify)_

## Impact

- New TypeScript package, depends on spec-graph-engine
- Integrates with OpenSpec CLI for artifact state queries
- Reads and writes to OpenSpec `changes/` directories (creates proposal.md, design.md, tasks.md when missing)
- Produces `.sdf/ilo-state.json` and `.sdf/ilo-journal.ndjson` for loop runtime persistence
- Claude Code skills in `.claude/skills/`, OpenCode skills in `.opencode/`
- Future: agent orchestration protocol for delegating task execution to AI coding agents
