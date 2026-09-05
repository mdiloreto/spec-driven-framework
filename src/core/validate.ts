import path from 'node:path'
import { resolveExplicitDependency } from './adapters.js'
import { normalizeSlashes } from './fs.js'
import { SPEC_TYPES } from './spec-types.js'
import type { AdapterDefinition, ValidationIssue, ValidationResult, SpecRecord } from './types.js'

function resolveRelativeSpec(fromPath: string, link: string): string {
  const baseDir = path.posix.dirname(fromPath)
  const cleanLink = link.split('#')[0] || ''
  return normalizeSlashes(path.posix.normalize(path.posix.join(baseDir, cleanLink)))
}

function issue(
  code: string,
  specPath: string,
  message: string,
  details: Partial<Pick<ValidationIssue, 'target' | 'dependency' | 'relatedPath'>> = {}
): ValidationIssue {
  return {
    severity: 'error',
    code,
    path: specPath,
    message,
    ...details
  }
}

export function validateSpecs(specs: SpecRecord[], adapter: AdapterDefinition): ValidationResult {
  const issues: ValidationIssue[] = []
  const knownTypes = new Set(Object.keys(SPEC_TYPES))
  const knownPaths = new Set(specs.map(spec => spec.path))
  const permalinks = new Map<string, string>()

  for (const spec of specs) {
    if (!knownTypes.has(spec.type)) {
      issues.push(issue('unknown_type', spec.path, `Unknown spec type: ${spec.type}`))
    }

    if (!spec.metadata.title) {
      issues.push(issue('missing_title', spec.path, 'Missing required frontmatter field: title'))
    }

    if (spec.permalink) {
      const existing = permalinks.get(spec.permalink)
      if (existing) {
        issues.push(issue('duplicate_permalink', spec.path, `Duplicate permalink: ${spec.permalink}`, { relatedPath: existing }))
      } else {
        permalinks.set(spec.permalink, spec.path)
      }
    }

    for (const link of spec.links) {
      const target = resolveRelativeSpec(spec.path, link)
      if (!knownPaths.has(target)) {
        issues.push(issue('broken_link', spec.path, `Broken spec link: ${link}`, { target }))
      }
    }

    for (const dependency of spec.explicitDependencies) {
      const target = resolveExplicitDependency(dependency, adapter.dependencyAliases)
      if (!target || !knownPaths.has(target)) {
        issues.push(issue('unresolved_dependency', spec.path, `Unresolved dependency: ${dependency}`, { dependency }))
      }
    }
  }

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues
  }
}
