import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGraph } from './graph.js'
import { createCommandEnvelope } from './output.js'
import { evaluateReadiness } from './readiness.js'
import { buildSliceBundle } from './slice.js'
import { validateSpecs } from './validate.js'
import type { AdapterDefinition, SpecRecord } from './types.js'

function createAdapter(): AdapterDefinition {
  return {
    name: 'test',
    description: 'Test adapter',
    specRoots: ['specs'],
    typePatterns: [],
    dependencyAliases: {
      'F-01': 'specs/features/f-01.md',
      'F-02': 'specs/features/f-02.md'
    },
    relations: {
      featureDependsOnArchitecture: ['specs/architecture/domain.md'],
      featureDependsOnBrief: ['specs/briefs/vision.md'],
      decisionFeedsArchitecture: []
    }
  }
}

function createValidSpecs(): SpecRecord[] {
  return [
    {
      path: 'specs/briefs/vision.md',
      nodeKind: 'spec',
      type: 'brief',
      title: 'vision',
      metadata: { title: 'vision' },
      permalink: null,
      links: [],
      explicitDependencies: []
    },
    {
      path: 'specs/architecture/domain.md',
      nodeKind: 'spec',
      type: 'architecture',
      title: 'domain',
      metadata: { title: 'domain' },
      permalink: null,
      links: ['../briefs/vision.md'],
      explicitDependencies: []
    },
    {
      path: 'specs/features/f-01.md',
      nodeKind: 'spec',
      type: 'feature',
      title: 'feature-01',
      metadata: { title: 'feature-01' },
      permalink: null,
      links: [],
      explicitDependencies: ['F-02']
    },
    {
      path: 'specs/features/f-02.md',
      nodeKind: 'spec',
      type: 'feature',
      title: 'feature-02',
      metadata: { title: 'feature-02' },
      permalink: null,
      links: [],
      explicitDependencies: ['F-01']
    },
    {
      path: 'specs/validation/basic-checks.md',
      nodeKind: 'spec',
      type: 'validation',
      title: 'basic-checks',
      metadata: { title: 'basic-checks' },
      permalink: null,
      links: [],
      explicitDependencies: []
    }
  ]
}

test('validateSpecs accepts a coherent spec set', () => {
  const validation = validateSpecs(createValidSpecs(), createAdapter())

  assert.equal(validation.ok, true)
  assert.equal(validation.issueCount, 0)
  assert.deepEqual(validation.issues, [])
})

test('validateSpecs reports unknown types, missing titles, broken links, unresolved dependencies, and duplicate permalinks', () => {
  const adapter = createAdapter()
  const specs: SpecRecord[] = [
    {
      path: 'specs/briefs/vision.md',
      nodeKind: 'spec',
      type: 'brief',
      title: 'vision',
      metadata: { title: 'vision' },
      permalink: '/shared',
      links: [],
      explicitDependencies: []
    },
    {
      path: 'specs/misc/untyped.md',
      nodeKind: 'spec',
      type: 'unknown',
      title: 'untyped',
      metadata: {},
      permalink: '/shared',
      links: ['../missing.md'],
      explicitDependencies: ['F-404']
    }
  ]

  const validation = validateSpecs(specs, adapter)
  const issueCodes = validation.issues.map(issue => issue.code).sort()

  assert.equal(validation.ok, false)
  assert.equal(validation.issueCount, 5)
  assert.deepEqual(issueCodes, [
    'broken_link',
    'duplicate_permalink',
    'missing_title',
    'unknown_type',
    'unresolved_dependency'
  ])
})

test('buildGraph annotates edges with extraction evidence', () => {
  const graph = buildGraph(createValidSpecs(), createAdapter())

  const explicitEdge = graph.edges.find(edge => (
    edge.from === 'specs/features/f-01.md'
      && edge.to === 'specs/features/f-02.md'
      && edge.kind === 'depends_on_explicit'
  ))

  const derivedEdge = graph.edges.find(edge => (
    edge.from === 'specs/features/f-01.md'
      && edge.to === 'specs/architecture/domain.md'
      && edge.kind === 'depends_on_architecture'
  ))

  assert.deepEqual(explicitEdge?.evidence, [{
    extraction: 'explicit',
    sourcePath: 'specs/features/f-01.md',
    detail: 'Explicit dependency: F-02'
  }])

  assert.deepEqual(derivedEdge?.evidence, [{
    extraction: 'derived',
    sourcePath: 'specs/features/f-01.md',
    detail: 'Adapter relation: featureDependsOnArchitecture'
  }])
})

test('buildSliceBundle exposes context, downstream impact, and missing changed specs', () => {
  const adapter = createAdapter()
  const specs = createValidSpecs()
  const graph = buildGraph(specs, adapter)
  const validation = validateSpecs(specs, adapter)
  const bundle = buildSliceBundle({
    adapter,
    graph,
    changed: ['specs/features/f-01.md', 'specs/features/missing.md'],
    validation
  })

  assert.deepEqual(bundle.missingChanged, ['specs/features/missing.md'])
  assert.deepEqual(bundle.changed, ['specs/features/f-01.md', 'specs/features/missing.md'])
  assert.equal(bundle.validation.ok, true)
  assert.deepEqual(
    bundle.requiredContext,
    ['specs/features/f-02.md', 'specs/architecture/domain.md', 'specs/briefs/vision.md']
  )
  assert.deepEqual(bundle.affectedDownstream, ['specs/features/f-02.md'])
  assert.deepEqual(
    bundle.handoff.templateHints.map(hint => hint.path),
    ['templates/architecture-slice-template.md', 'templates/implementation-slice-template.md']
  )
})

test('evaluateReadiness reports implementation readiness when context and validation artifacts exist', () => {
  const adapter = createAdapter()
  const specs = createValidSpecs()
  const graph = buildGraph(specs, adapter)
  const validation = validateSpecs(specs, adapter)
  const readiness = evaluateReadiness({
    graph,
    validation,
    targetPaths: ['specs/features/f-01.md']
  })

  assert.equal(readiness.reportCount, 1)
  assert.equal(readiness.readyCount, 1)
  assert.equal(readiness.reports[0]?.ready, true)
  assert.equal(readiness.reports[0]?.stage, 'implementation_ready')
  assert.deepEqual(readiness.reports[0]?.blockers, [])
  assert.equal(readiness.reports[0]?.artifactRequirements.filter(requirement => requirement.satisfied).length, 3)
  assert.equal(readiness.reports[0]?.warnings[0]?.code, 'dependency_cycle_in_scope')
})

test('evaluateReadiness reports missing context and validation artifacts', () => {
  const adapter = createAdapter()
  const specs: SpecRecord[] = [
    {
      path: 'specs/features/f-01.md',
      nodeKind: 'spec',
      type: 'feature',
      title: 'feature-01',
      metadata: { title: 'feature-01' },
      permalink: null,
      links: [],
      explicitDependencies: []
    }
  ]
  const graph = buildGraph(specs, adapter)
  const validation = validateSpecs(specs, adapter)
  const readiness = evaluateReadiness({
    graph,
    validation,
    targetPaths: ['specs/features/f-01.md']
  })
  const blockerCodes = readiness.reports[0]?.blockers.map(blocker => blocker.code).sort()

  assert.equal(readiness.reportCount, 1)
  assert.equal(readiness.readyCount, 0)
  assert.equal(readiness.reports[0]?.ready, false)
  assert.equal(readiness.reports[0]?.stage, 'needs_context')
  assert.deepEqual(blockerCodes, [
    'missing_architecture_context',
    'missing_brief_context',
    'missing_validation_artifacts'
  ])
})

test('createCommandEnvelope wraps deterministic command metadata around results', () => {
  const envelope = createCommandEnvelope({
    command: 'graph',
    adapter: 'demo',
    repo: '/tmp/demo',
    result: { nodes: [], edges: [] }
  })

  assert.deepEqual(envelope, {
    contractVersion: '0.1',
    command: 'graph',
    adapter: 'demo',
    repo: '/tmp/demo',
    ok: true,
    result: { nodes: [], edges: [] }
  })
})
