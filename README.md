# Spec-Driven Framework

**Status:** Research & Architecture Design
**Created:** 2026-04-05
**Last Updated:** 2026-04-05

---

## Overview

A portable spec-driven development framework that provides agentic, automated workflows for translating existing feature specs into implementation. The framework handles spec discovery, feature relationship detection (dependency graph), artifact generation, implementation workflow orchestration, and validation -- all as repeatable, automated pipelines that work across multiple repos.

**Key insight:** Existing tools (Spec Kit, OpenSpec, Kiro, Taskmaster AI, Tessl) manage spec *creation*, but what's needed is a spec *execution engine* -- taking mature spec ecosystems and driving them through implementation.

---

## Goals

- [ ] Define the architecture for the agentic execution pipeline (deterministic vs AI boundaries)
- [ ] Build spec discovery and relationship detection (dependency graph) across repos
- [ ] Implement artifact generation from specs (implementation slices, task plans)
- [ ] Create implementation workflow orchestration (automated pipelines)
- [ ] Build validation layer (spec compliance checking, test generation)
- [ ] Support two target repos: AGC (Rust CLI, 23k LOC) and FinArg (Go/Next.js, pre-implementation)
- [ ] Determine delivery mechanism: MCP server, Claude Code skills, standalone CLI, or hybrid

---

## Current Status

**Phase:** Research & Architecture Design
**Progress:** 10%
**Current Focus:** Determining the right architecture -- whether to adopt existing tools for spec standardization while building custom execution workflows, or build end-to-end.

### Target Repos

| Repo | Stack | LOC | Feature Specs | ADRs | Other |
|------|-------|-----|---------------|------|-------|
| AGC | Rust CLI | 23k | 23 | 34 | Capability matrix, 218 tests |
| FinArg | Go/Next.js | Pre-impl | 15 | 12 | Domain model, schema contract, 3 OpenCode agents |

### Research Completed

Landscape analysis of: Spec Kit (GitHub), OpenSpec (Fission-AI), Kiro, Taskmaster AI, Tessl.
Conclusion: these tools focus on spec creation/management, not spec execution.

### Prototype (v0.1)

Original TypeScript prototype exists in git history (commit `9bfd117`). Modules: discovery, graph, impact, slice generation. May be redesigned based on architecture decisions.

---

## Key Decisions Pending

1. Whether to adopt Spec Kit/OpenSpec for spec FORMAT standardization
2. Architecture of the agentic execution pipeline
3. How to implement feature relationship detection
4. Where deterministic logic vs AI judgment boundaries should be
5. Delivery mechanism: MCP server, Claude Code skills, standalone CLI, or hybrid

---

## Links

- [Workplan](./workplan.md)
- [Implementation Log](./implementation-log.md)
- [Testing Plan](./testing-plan.md)

---

**Last Updated:** 2026-04-05
