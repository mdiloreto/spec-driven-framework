# spec-driven-framework

Portable hybrid framework for spec-driven development.

## Thesis

Spec-driven development works best when the system separates:

1. deterministic structure
2. human review checkpoints
3. agentic help for ambiguity

This repository exists to build that framework in a portable, repo-native way.

## Goals

- support `spec -> architecture -> implementation -> validation`
- stay portable across repos and domains
- prefer deterministic workflows for parsing, graph, and impact
- use agents as optional extensions, not as the only source of truth

## Initial Scope

- canonical spec model
- repo adapters
- dependency graph
- impact analysis
- slice templates
- extension points for agents and hooks

## Status

Early bootstrap.
