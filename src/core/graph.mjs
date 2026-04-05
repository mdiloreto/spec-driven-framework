import path from 'node:path'
import { normalizeSlashes } from './fs.mjs'
import { resolveExplicitDependency } from './adapters.mjs'

function resolveRelativeSpec(fromPath, link) {
  const baseDir = path.posix.dirname(fromPath)
  const cleanLink = link.split('#')[0]
  return normalizeSlashes(path.posix.normalize(path.posix.join(baseDir, cleanLink)))
}

export function buildGraph(specs, adapter) {
  const knownPaths = new Set(specs.map(spec => spec.path))
  const edges = []

  for (const spec of specs) {
    for (const link of spec.links) {
      const target = resolveRelativeSpec(spec.path, link)
      if (knownPaths.has(target)) {
        edges.push({ from: spec.path, to: target, kind: 'links_to' })
      }
    }

    for (const dependency of spec.explicitDependencies) {
      const target = resolveExplicitDependency(dependency, adapter.dependencyAliases)
      if (target && knownPaths.has(target)) {
        edges.push({ from: spec.path, to: target, kind: 'depends_on_explicit' })
      }
    }
  }

  for (const spec of specs) {
    if (spec.type === 'feature') {
      for (const dependency of adapter.relations.featureDependsOnArchitecture || []) {
        edges.push({ from: spec.path, to: dependency, kind: 'depends_on_architecture' })
      }
      for (const dependency of adapter.relations.featureDependsOnBrief || []) {
        edges.push({ from: spec.path, to: dependency, kind: 'depends_on_brief' })
      }
    }
    if (spec.type === 'decision') {
      for (const target of adapter.relations.decisionFeedsArchitecture || []) {
        edges.push({ from: spec.path, to: target, kind: 'feeds_architecture' })
      }
    }
  }

  const unique = []
  const seen = new Set()
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}|${edge.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(edge)
  }

  return { nodes: specs, edges: unique }
}
