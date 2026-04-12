# Spec-Driven Framework - Workplan

**Status:** Research & Architecture Design
**Created:** 2026-04-05

---

## Summary

Build a portable spec-driven development framework that takes mature spec ecosystems (feature specs, ADRs, domain models) and drives them through implementation via automated agentic pipelines. The framework must work across multiple repos with different stacks (Rust, Go/Next.js) and balance deterministic processing with AI-powered judgment.

---

## Objectives

1. Design an architecture that cleanly separates deterministic spec processing from AI-powered execution
2. Build a spec ingestion layer that handles diverse spec formats and extracts structured data
3. Create a dependency graph engine that detects feature relationships and determines implementation order
4. Implement an execution pipeline that generates implementation artifacts and orchestrates work
5. Validate implementations against their source specs

---

## Implementation Phases

### Phase 1: Research & Architecture Design
**Goal:** Determine the right architecture and make key design decisions
**Status:** In Progress

- [ ] Task 1.1: Evaluate Spec Kit/OpenSpec for format standardization (adopt vs build)
- [ ] Task 1.2: Map the deterministic vs AI judgment boundaries
- [ ] Task 1.3: Design the execution pipeline architecture
- [ ] Task 1.4: Choose delivery mechanism (MCP server / Claude Code skills / CLI / hybrid)
- [ ] Task 1.5: Document architecture decisions as ADRs

### Phase 2: Spec Ingestion & Discovery
**Goal:** Reliably discover and parse specs from any repo structure
**Status:** Pending

- [ ] Task 2.1: Spec discovery engine (filesystem scanning, frontmatter parsing)
- [ ] Task 2.2: Spec format normalization (handle markdown variants, YAML frontmatter)
- [ ] Task 2.3: Spec type classification (feature, architecture, validation, ADR)
- [ ] Task 2.4: Cross-reference extraction (detect spec-to-spec links)

### Phase 3: Dependency Graph & Relationship Detection
**Goal:** Build a dependency graph that determines implementation order
**Status:** Pending

- [ ] Task 3.1: Relationship detection from explicit references (links, IDs)
- [ ] Task 3.2: Implicit dependency detection (shared domain concepts, API contracts)
- [ ] Task 3.3: Graph construction and topological ordering
- [ ] Task 3.4: Impact analysis (what changes when a spec changes)

### Phase 4: Artifact Generation & Execution Pipeline
**Goal:** Generate implementation artifacts and orchestrate work
**Status:** Pending

- [ ] Task 4.1: Implementation slice generation from feature specs
- [ ] Task 4.2: Task plan generation with ordered steps
- [ ] Task 4.3: Execution orchestration (automated pipeline runner)
- [ ] Task 4.4: Progress tracking and state management

### Phase 5: Validation & Compliance
**Goal:** Verify implementations match their source specs
**Status:** Pending

- [ ] Task 5.1: Spec compliance checking (does implementation satisfy requirements)
- [ ] Task 5.2: Test generation from spec acceptance criteria
- [ ] Task 5.3: Drift detection (spec changed but implementation didn't)

---

## Notes

- The v0.1 TypeScript prototype (discovery/graph/impact/slice) exists in git history and may inform the redesign
- AGC repo has a mature spec ecosystem (23 features, 34 ADRs) -- good for testing complex dependency detection
- FinArg repo is pre-implementation -- good for testing the full generation pipeline
- The framework should be repo-agnostic: no assumptions about language, structure, or tooling

---

**Last Updated:** 2026-04-05
