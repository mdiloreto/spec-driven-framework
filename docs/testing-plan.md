# Spec-Driven Framework - Testing Plan

**Project:** Spec-Driven Framework
**Created:** 2026-04-05

---

## Testing Strategy

### Unit Tests
- Spec parser: correctly extracts frontmatter, body, references from markdown files
- Graph engine: builds correct dependency graphs from known spec relationships
- Discovery: finds all spec files across varied directory structures

### Integration Tests
- End-to-end pipeline: discovery -> graph -> artifact generation on AGC repo specs
- End-to-end pipeline: discovery -> graph -> artifact generation on FinArg repo specs
- Cross-repo: verify framework handles different stacks without hardcoded assumptions

### Validation Tests
- Generated implementation slices match source spec requirements
- Dependency ordering is topologically correct
- Impact analysis correctly identifies affected specs when one changes

---

## Test Repos

| Repo | Purpose | Characteristics |
|------|---------|-----------------|
| AGC | Complex spec ecosystem | 23 features, 34 ADRs, Rust, 23k LOC existing |
| FinArg | Greenfield generation | 15 features, 12 ADRs, Go/Next.js, pre-implementation |

---

**Last Updated:** 2026-04-05
