import fs from 'node:fs'
import path from 'node:path'
import { walk, normalizeSlashes } from './fs.js'
import { extractFrontmatter } from './frontmatter.js'
import { extractMarkdownLinks, extractDependencies } from './markdown.js'
import { inferType } from './adapters.js'
import type { AdapterDefinition, SpecRecord } from './types.js'

export function discoverSpecs(repoRoot: string, adapter: AdapterDefinition): SpecRecord[] {
  const files = walk(repoRoot)
    .map(file => normalizeSlashes(path.relative(repoRoot, file)))
    .filter(file => file.endsWith('.md'))
    .filter(file => adapter.specRoots.some(root => file === root || file.startsWith(`${root}/`)))

  return files.map(relativePath => {
    const absolutePath = path.join(repoRoot, relativePath)
    const content = fs.readFileSync(absolutePath, 'utf8')
    const frontmatter = extractFrontmatter(content)

    return {
      path: relativePath,
      nodeKind: 'spec',
      type: inferType(relativePath, adapter),
      title: frontmatter.title || path.basename(relativePath, '.md'),
      metadata: frontmatter,
      permalink: frontmatter.permalink || null,
      links: extractMarkdownLinks(content),
      explicitDependencies: extractDependencies(content)
    }
  })
}
