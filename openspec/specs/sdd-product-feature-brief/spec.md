# Product Feature Brief (PFB) Specification

## Purpose

Defines the structure, content, and quality requirements for a Product Feature Brief — the first artifact in the SDD lifecycle. The PFB establishes WHY a change is needed, WHAT it covers, and WHERE its boundaries are. It is the root artifact that all subsequent specs, designs, and tasks trace back to.

## Requirements

### Requirement: PFB structure

A PFB SHALL contain the following sections: Why (motivation), What Changes (scope of modifications), Capabilities (new and modified capability specs), and Impact (affected systems). These sections correspond to the OpenSpec `proposal.md` artifact.

#### Scenario: Complete PFB

- **WHEN** a PFB is created for a new feature
- **THEN** it MUST contain non-empty Why, What Changes, Capabilities, and Impact sections

#### Scenario: Missing section

- **WHEN** a PFB is missing the Why section
- **THEN** the artifact checker SHALL report it as invalid with issue "PFB 'Why' section is empty"

### Requirement: Why section — problem and motivation

The Why section SHALL articulate the problem being solved in 1-3 sentences. It MUST answer: what problem does this solve, why now, and who benefits. It SHALL NOT contain implementation details or technical approach.

#### Scenario: Good why section

- **WHEN** the Why section states "Users cannot export their data, blocking compliance with GDPR Article 20. Three enterprise customers have flagged this as a blocker for renewal."
- **THEN** the PFB SHALL be considered to have a valid Why section

#### Scenario: Implementation leak

- **WHEN** the Why section contains "We need to add a REST endpoint that returns CSV data using the papaparse library"
- **THEN** the PFB SHOULD flag this as an implementation detail that belongs in the EAD, not the PFB

### Requirement: Capabilities section — contract with specs

The Capabilities section SHALL list every capability spec that will be created or modified by this change. New capabilities MUST use kebab-case identifiers. Modified capabilities MUST reference existing spec names from `openspec/specs/`. This section creates the binding contract between the PFB and the specs phase.

#### Scenario: New capability declaration

- **WHEN** the PFB lists `data-export` as a new capability
- **THEN** a spec file at `specs/data-export/spec.md` MUST be created in the specs phase

#### Scenario: Modified capability declaration

- **WHEN** the PFB lists `user-auth` as a modified capability with description "Add OAuth2 support"
- **THEN** a delta spec at `specs/user-auth/spec.md` with `## MODIFIED Requirements` MUST be created

### Requirement: Scope boundaries

The PFB SHALL define clear scope boundaries — explicitly stating what is in scope and what is out of scope. This prevents scope creep during the EAD and implementation phases.

#### Scenario: Explicit out-of-scope

- **WHEN** the PFB for "add data export" states "Out of scope: scheduled exports, export to Google Sheets, export history"
- **THEN** the EAD and implementation plan SHALL NOT include work for those items

### Requirement: PFB as the root of traceability

Every spec requirement, design decision, and implementation task SHALL be traceable back to the PFB. The PFB's capability list defines the full scope of the change — nothing outside it should appear in downstream artifacts.

#### Scenario: Orphan requirement

- **WHEN** the specs phase introduces a requirement for a capability not listed in the PFB's Capabilities section
- **THEN** the artifact checker SHALL report a warning: "Spec capability X not declared in PFB"
