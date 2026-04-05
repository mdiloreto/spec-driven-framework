export function extractMarkdownLinks(content) {
  const links = []
  const regex = /\[[^\]]+\]\(([^)]+)\)/g
  let match
  while ((match = regex.exec(content)) !== null) {
    const target = match[1]
    if (!target.startsWith('http')) links.push(target)
  }
  return [...new Set(links)]
}

export function extractDependencies(content) {
  const lines = content.split('\n')
  const dependencies = []
  let inSection = false
  for (const line of lines) {
    if (/^##\s+Dependencies/.test(line)) {
      inSection = true
      continue
    }
    if (inSection && /^##\s+/.test(line)) break
    if (inSection) {
      const match = line.match(/^[-*]\s+(.*)$/)
      if (match) dependencies.push(match[1].trim())
    }
  }
  return dependencies
}
