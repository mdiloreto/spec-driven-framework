import fs from 'node:fs'
import path from 'node:path'
import { wildcardToRegex } from './fs.mjs'

export function loadAdapter(repoRoot, adapterName) {
  const localPath = path.join(repoRoot, 'src', 'adapters', `${adapterName}.json`)
  if (!fs.existsSync(localPath)) {
    throw new Error(`Adapter not found: ${adapterName}`)
  }
  return JSON.parse(fs.readFileSync(localPath, 'utf8'))
}

export function inferType(relativePath, adapter) {
  for (const entry of adapter.typePatterns) {
    if (wildcardToRegex(entry.match).test(relativePath)) {
      return entry.type
    }
  }
  return 'unknown'
}

export function resolveExplicitDependency(rawDependency, aliases = {}) {
  const normalized = rawDependency.trim()
  if (aliases[normalized]) return aliases[normalized]
  for (const [alias, target] of Object.entries(aliases)) {
    if (normalized.startsWith(alias)) return target
  }
  return null
}
