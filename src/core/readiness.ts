import { computeImpact } from './impact.js'
import type {
  Graph,
  GraphEdge,
  ReadinessArtifactRequirement,
  ReadinessCheck,
  ReadinessReport,
  ReadinessResult,
  SpecRecord,
  ValidationIssue,
  ValidationResult
} from './types.js'

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

function collectValidationIssues(scope: string[], issues: ValidationIssue[]): ValidationIssue[] {
  const scoped = new Set(scope)

  return issues.filter(issue => {
    if (scoped.has(issue.path)) return true
    return Boolean(issue.relatedPath && scoped.has(issue.relatedPath))
  })
}

function hasExplicitDependencyCycle(graph: Graph, target: string): boolean {
  const adjacency = new Map<string, string[]>()

  for (const edge of graph.edges) {
    if (edge.kind !== 'depends_on_explicit') continue
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, [])
    }
    adjacency.get(edge.from)?.push(edge.to)
  }

  const queue = [...(adjacency.get(target) || [])]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    if (current === target) return true
    if (visited.has(current)) continue

    visited.add(current)
    queue.push(...(adjacency.get(current) || []))
  }

  return false
}

function makeRequirement(kind: ReadinessArtifactRequirement['kind'], target: string, satisfied: boolean): ReadinessArtifactRequirement {
  return { kind, target, satisfied }
}

function addRequirementBlocker(blockers: ReadinessCheck[], requirements: ReadinessArtifactRequirement[], kind: ReadinessArtifactRequirement['kind'], code: string, message: string): void {
  const missing = requirements
    .filter(requirement => requirement.kind === kind && !requirement.satisfied)
    .map(requirement => requirement.target)

  if (missing.length === 0) return

  blockers.push({
    code,
    severity: 'blocker',
    message,
    relatedPaths: missing
  })
}

function collectDerivedTargets(edges: GraphEdge[], target: string, kind: GraphEdge['kind']): string[] {
  return unique(
    edges
      .filter(edge => edge.from === target && edge.kind === kind)
      .map(edge => edge.to)
  )
}

function pickStage(blockers: ReadinessCheck[]): ReadinessReport['stage'] {
  const codes = new Set(blockers.map(blocker => blocker.code))

  if (codes.has('missing_target') || codes.has('unknown_target_type')) {
    return 'missing_spec'
  }

  if (codes.has('missing_brief_context') || codes.has('missing_architecture_context')) {
    return 'needs_context'
  }

  if (blockers.length > 0) {
    return 'needs_validation'
  }

  return 'implementation_ready'
}

export function evaluateReadiness(input: {
  graph: Graph
  validation: ValidationResult
  targetPaths?: string[]
}): ReadinessResult {
  const specIndex = new Map<string, SpecRecord>(input.graph.nodes.map(spec => [spec.path, spec]))
  const defaultTargets = input.graph.nodes
    .filter(spec => spec.type === 'feature')
    .map(spec => spec.path)
  const targets = input.targetPaths && input.targetPaths.length > 0 ? input.targetPaths : defaultTargets
  const validationSpecs = input.graph.nodes
    .filter(spec => spec.type === 'validation')
    .map(spec => spec.path)

  const reports = targets.map<ReadinessReport>(target => {
    const spec = specIndex.get(target)

    if (!spec) {
      const blockers: ReadinessCheck[] = [{
        code: 'missing_target',
        severity: 'blocker',
        message: 'Target spec does not exist in the discovered graph.',
        relatedPaths: [target]
      }]

      return {
        target,
        type: 'missing',
        ready: false,
        stage: 'missing_spec',
        scope: [target],
        requiredContext: [],
        artifactRequirements: [],
        blockers,
        warnings: []
      }
    }

    const blockers: ReadinessCheck[] = []
    const warnings: ReadinessCheck[] = []

    if (spec.type === 'unknown') {
      blockers.push({
        code: 'unknown_target_type',
        severity: 'blocker',
        message: 'Target spec has an unknown type and cannot be evaluated for readiness.',
        relatedPaths: [target]
      })
    }

    const impact = computeImpact(input.graph, [target])
    const requiredContext = impact.requiredContext
    const contextSpecs = requiredContext
      .map(specPath => specIndex.get(specPath))
      .filter((contextSpec): contextSpec is SpecRecord => Boolean(contextSpec))
    const architectureContext = unique(contextSpecs.filter(contextSpec => contextSpec.type === 'architecture').map(contextSpec => contextSpec.path))
    const briefContext = unique(contextSpecs.filter(contextSpec => contextSpec.type === 'brief').map(contextSpec => contextSpec.path))
    const missingArchitectureTargets = collectDerivedTargets(input.graph.edges, target, 'depends_on_architecture').filter(specPath => !specIndex.has(specPath))
    const missingBriefTargets = collectDerivedTargets(input.graph.edges, target, 'depends_on_brief').filter(specPath => !specIndex.has(specPath))
    const artifactRequirements: ReadinessArtifactRequirement[] = []

    if (spec.type === 'feature') {
      if (architectureContext.length > 0) {
        artifactRequirements.push(...architectureContext.map(specPath => makeRequirement('architecture', specPath, true)))
      } else if (missingArchitectureTargets.length > 0) {
        artifactRequirements.push(...missingArchitectureTargets.map(specPath => makeRequirement('architecture', specPath, false)))
      } else {
        artifactRequirements.push(makeRequirement('architecture', 'at least one architecture context spec', false))
      }

      if (briefContext.length > 0) {
        artifactRequirements.push(...briefContext.map(specPath => makeRequirement('brief', specPath, true)))
      } else if (missingBriefTargets.length > 0) {
        artifactRequirements.push(...missingBriefTargets.map(specPath => makeRequirement('brief', specPath, false)))
      } else {
        artifactRequirements.push(makeRequirement('brief', 'at least one brief context spec', false))
      }

      if (validationSpecs.length > 0) {
        artifactRequirements.push(...validationSpecs.map(specPath => makeRequirement('validation', specPath, true)))
      } else {
        artifactRequirements.push(makeRequirement('validation', 'validation coverage', false))
      }
    }

    addRequirementBlocker(
      blockers,
      artifactRequirements,
      'architecture',
      'missing_architecture_context',
      'Implementation readiness requires architecture context for the target.'
    )
    addRequirementBlocker(
      blockers,
      artifactRequirements,
      'brief',
      'missing_brief_context',
      'Implementation readiness requires brief or product-intent context for the target.'
    )
    addRequirementBlocker(
      blockers,
      artifactRequirements,
      'validation',
      'missing_validation_artifacts',
      'Implementation readiness requires at least one validation artifact or validation surface.'
    )

    const scope = unique([target, ...requiredContext, ...validationSpecs])
    const scopedIssues = collectValidationIssues(scope, input.validation.issues)

    if (scopedIssues.length > 0) {
      blockers.push({
        code: 'scoped_validation_issues',
        severity: 'blocker',
        message: `${scopedIssues.length} validation issue(s) affect the target scope.`,
        relatedPaths: unique(scopedIssues.map(issue => issue.path))
      })
    }

    if (spec.type === 'feature' && hasExplicitDependencyCycle(input.graph, target)) {
      warnings.push({
        code: 'dependency_cycle_in_scope',
        severity: 'warning',
        message: 'The target participates in an explicit dependency cycle; implementation ordering may require manual review.',
        relatedPaths: [target]
      })
    }

    const ready = blockers.length === 0

    return {
      target,
      type: spec.type,
      ready,
      stage: pickStage(blockers),
      scope,
      requiredContext,
      artifactRequirements,
      blockers,
      warnings
    }
  })

  const readyCount = reports.filter(report => report.ready).length

  return {
    targets,
    reportCount: reports.length,
    readyCount,
    reports
  }
}
