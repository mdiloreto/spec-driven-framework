import fs from 'node:fs'
import path from 'node:path'

export function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.worktrees' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue
    }
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, acc)
    } else {
      acc.push(fullPath)
    }
  }
  return acc
}

export function normalizeSlashes(value) {
  return value.split(path.sep).join('/')
}

export function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*')
  return new RegExp(`^${escaped}$`)
}
