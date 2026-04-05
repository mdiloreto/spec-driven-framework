export function extractFrontmatter(content) {
  if (!content.startsWith('---\n')) return {}
  const endIndex = content.indexOf('\n---\n', 4)
  if (endIndex === -1) return {}
  const raw = content.slice(4, endIndex)
  const result = {}
  for (const line of raw.split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    result[key] = value
  }
  return result
}
