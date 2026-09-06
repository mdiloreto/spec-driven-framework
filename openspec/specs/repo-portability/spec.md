# Repo Portability Specification

## Purpose

Defines the portability guarantees of the framework. The spec-driven framework is intended to work across repositories with different languages, project layouts, and tooling, as long as the repository exposes OpenSpec artifacts and the framework's required contracts.

## Requirements

### Requirement: OpenSpec as the portability boundary

The framework SHALL treat the OpenSpec directory structure and artifact contracts as the primary portability boundary. Repository-specific language or build tooling SHALL remain outside the framework core unless explicitly modeled as backend execution context.

#### Scenario: Different implementation stacks

- **WHEN** one target repo uses Rust and another uses Go plus Next.js
- **THEN** the framework SHALL still be able to process their changes if both repos expose compatible OpenSpec artifacts

### Requirement: No framework-level language coupling

The framework core SHALL NOT assume a specific application language, package manager, test runner, or deployment model in order to scan artifacts, build the spec graph, or orchestrate the implementation loop.

#### Scenario: Graph build on heterogeneous repos

- **WHEN** the spec graph is rebuilt for two repos with different source languages
- **THEN** graph construction SHALL depend on OpenSpec artifact content and dependency declarations rather than language-specific AST parsing

### Requirement: Repo-specific execution delegated to backends

Repo-specific execution details such as coding conventions, build steps, or test commands SHALL be handled by backend prompts, project context, or downstream execution logic rather than embedded in the framework core.

#### Scenario: Repo-specific implementation task

- **WHEN** a task requires updating a Rust crate in one repo and a Next.js route in another
- **THEN** the ILO SHALL orchestrate the task in the same way for both repos
- **AND** the backend SHALL adapt execution details using repo context

### Requirement: Explicit assumptions only

Any repository assumption required by the framework core SHALL be expressed explicitly as a documented contract rather than as an implicit convention embedded in the code.

#### Scenario: New repo onboarding

- **WHEN** maintainers onboard a new repo to the framework
- **THEN** they SHALL be able to identify the required repo contracts from the specs and docs without reverse-engineering hidden assumptions from implementation code
