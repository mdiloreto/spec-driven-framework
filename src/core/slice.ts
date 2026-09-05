import { computeImpact } from './impact.js'
import type { Graph, SliceBundle, SpecRecord, TemplateHint, ValidationResult } from './types.js'

function pickSpecs(paths: string[], specIndex: Map<string, SpecRecord>): SpecRecord[] {
  return paths
    .map(specPath => specIndex.get(specPath))
    .filter((spec): spec is SpecRecord => Boolean(spec))
}

function buildTemplateHints(changedSpecs: SpecRecord[]): TemplateHint[] {
  const changedTypes = new Set(changedSpecs.map(spec => spec.type))
  const hints: TemplateHint[] = []

  if (changedTypes.has('brief') || changedTypes.has('feature') || changedTypes.has('decision')) {
    hints.push({
      path: 'templates/architecture-slice-template.md',
      reason: 'Draft or update design constraints before implementation work starts.'
    })
  }

  if (changedTypes.has('feature') || changedTypes.has('architecture') || changedTypes.has('implementation')) {
    hints.push({
      path: 'templates/implementation-slice-template.md',
      reason: 'Plan the next reviewable implementation step with explicit verification.'
    })
  }

  return hints
}

export function buildSliceBundle(input: {
  adapter: { name: string }
  graph: Graph
  changed: string[]
  validation: ValidationResult
}): SliceBundle {
  const specIndex = new Map(input.graph.nodes.map(spec => [spec.path, spec]))
  const impact = computeImpact(input.graph, input.changed)
  const missingChanged = input.changed.filter(specPath => !specIndex.has(specPath))
  const changedSpecs = pickSpecs(impact.changed, specIndex)
  const requiredContextSpecs = pickSpecs(impact.requiredContext, specIndex)
  const affectedDownstreamSpecs = pickSpecs(impact.affectedDownstream, specIndex)

  return {
    adapter: input.adapter.name,
    changed: impact.changed,
    missingChanged,
    changedSpecs,
    requiredContext: impact.requiredContext,
    requiredContextSpecs,
    affectedDownstream: impact.affectedDownstream,
    affectedDownstreamSpecs,
    validation: input.validation,
    handoff: {
      workflow: 'spec-review-and-slice',
      checkpoints: [
        'Treat validation errors as blockers before asking an agent to draft changes.',
        'Review changed specs and required context before drafting architecture or implementation.',
        'Use affected downstream specs as the validation surface after the implementation changes land.'
      ],
      templateHints: buildTemplateHints(changedSpecs)
    }
  }
}
