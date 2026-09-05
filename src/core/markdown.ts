export function extractMarkdownLinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[[^\]]+\]\(([^)]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const target = match[1]
    if (!target) continue
    if (!target.startsWith('http')) {
      links.push(target)
    }
  }

  return [...new Set(links)]
}

export function extractDependencies(content: string): string[] {
  const lines = content.split('\n')
  const dependencies: string[] = []
  let inSection = false

  for (const line of lines) {
    if (/^##\s+Dependencies/.test(line)) {
      inSection = true
      continue
    }

    if (inSection && /^##\s+/.test(line)) break

    if (inSection) {
      const match = line.match(/^[-*]\s+(.*)$/)
      if (match?.[1]) {
        dependencies.push(match[1].trim())
      }
    }
  }

  return dependencies
}
