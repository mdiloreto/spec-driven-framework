import path from 'node:path'
import { normalizeSlashes } from './fs.js'
import { resolveExplicitDependency } from './adapters.js'
import type { AdapterDefinition, EdgeEvidence, Graph, GraphEdge, SpecRecord } from './types.js'

interface PendingEdge {
  from: string
  to: string
  kind: GraphEdge['kind']
  evidence: EdgeEvidence
}

function resolveRelativeSpec(fromPath: string, link: string): string {
  const baseDir = path.posix.dirname(fromPath)
  const cleanLink = link.split('#')[0] || ''
  return normalizeSlashes(path.posix.normalize(path.posix.join(baseDir, cleanLink)))
}

function pushEdge(edges: PendingEdge[], edge: PendingEdge): void {
  edges.push(edge)
}

function mergeEvidence(target: EdgeEvidence[], evidence: EdgeEvidence): void {
  const key = `${evidence.extraction}|${evidence.sourcePath}|${evidence.sourceLine ?? ''}|${evidence.detail}`
  const exists = target.some(item => `${item.extraction}|${item.sourcePath}|${item.sourceLine ?? ''}|${item.detail}` === key)
  if (!exists) {
    target.push(evidence)
  }
}

export function buildGraph(specs: SpecRecord[], adapter: AdapterDefinition): Graph {
  const knownPaths = new Set(specs.map(spec => spec.path))
  const edges: PendingEdge[] = []

  for (const spec of specs) {
    for (const link of spec.links) {
      const target = resolveRelativeSpec(spec.path, link)
      if (knownPaths.has(target)) {
        pushEdge(edges, {
          from: spec.path,
          to: target,
          kind: 'links_to',
          evidence: {
            extraction: 'explicit',
            sourcePath: spec.path,
            detail: `Markdown link: ${link}`
          }
        })
      }
    }

    for (const dependency of spec.explicitDependencies) {
      const target = resolveExplicitDependency(dependency, adapter.dependencyAliases)
      if (target && knownPaths.has(target)) {
        pushEdge(edges, {
          from: spec.path,
          to: target,
          kind: 'depends_on_explicit',
          evidence: {
            extraction: 'explicit',
            sourcePath: spec.path,
            detail: `Explicit dependency: ${dependency}`
          }
        })
      }
    }
  }

  for (const spec of specs) {
    if (spec.type === 'feature') {
      for (const dependency of adapter.relations.featureDependsOnArchitecture || []) {
        pushEdge(edges, {
          from: spec.path,
          to: dependency,
          kind: 'depends_on_architecture',
          evidence: {
            extraction: 'derived',
            sourcePath: spec.path,
            detail: 'Adapter relation: featureDependsOnArchitecture'
          }
        })
      }

      for (const dependency of adapter.relations.featureDependsOnBrief || []) {
        pushEdge(edges, {
          from: spec.path,
          to: dependency,
          kind: 'depends_on_brief',
          evidence: {
            extraction: 'derived',
            sourcePath: spec.path,
            detail: 'Adapter relation: featureDependsOnBrief'
          }
        })
      }
    }

    if (spec.type === 'decision') {
      for (const target of adapter.relations.decisionFeedsArchitecture || []) {
        pushEdge(edges, {
          from: spec.path,
          to: target,
          kind: 'feeds_architecture',
          evidence: {
            extraction: 'derived',
            sourcePath: spec.path,
            detail: 'Adapter relation: decisionFeedsArchitecture'
          }
        })
      }
    }
  }

  const unique = new Map<string, GraphEdge>()

  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}|${edge.kind}`
    const existing = unique.get(key)

    if (existing) {
      mergeEvidence(existing.evidence, edge.evidence)
      continue
    }

    unique.set(key, {
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      evidence: [edge.evidence]
    })
  }

  return { nodes: specs, edges: [...unique.values()] }
}
