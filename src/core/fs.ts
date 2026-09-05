import fs from 'node:fs'
import path from 'node:path'

const IGNORED_DIRS = new Set(['.git', '.worktrees', 'node_modules', 'dist'])

export function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, acc)
    } else {
      acc.push(fullPath)
    }
  }

  return acc
}

export function normalizeSlashes(value: string): string {
  return value.split(path.sep).join('/')
}

export function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*')

  return new RegExp(`^${escaped}$`)
}
