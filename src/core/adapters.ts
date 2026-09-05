import fs from 'node:fs'
import path from 'node:path'
import { normalizeSlashes, wildcardToRegex } from './fs.js'
import type { AdapterDefinition, SpecType } from './types.js'

export function loadAdapter(repoRoot: string, adapterName: string): AdapterDefinition {
  const localPath = path.join(repoRoot, 'src', 'adapters', `${adapterName}.json`)

  if (!fs.existsSync(localPath)) {
    throw new Error(`Adapter not found: ${adapterName}`)
  }

  return JSON.parse(fs.readFileSync(localPath, 'utf8')) as AdapterDefinition
}

export function inferType(relativePath: string, adapter: AdapterDefinition): SpecType {
  for (const entry of adapter.typePatterns) {
    if (wildcardToRegex(entry.match).test(relativePath)) {
      return entry.type
    }
  }

  return 'unknown'
}

export function resolveExplicitDependency(rawDependency: string, aliases: Record<string, string> = {}): string | null {
  const normalized = normalizeSlashes(rawDependency.trim())

  if (aliases[normalized]) {
    return normalizeSlashes(aliases[normalized])
  }

  for (const [alias, target] of Object.entries(aliases)) {
    if (normalized.startsWith(alias)) {
      return normalizeSlashes(target)
    }
  }

  return null
}
