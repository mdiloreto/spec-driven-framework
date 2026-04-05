import fs from 'node:fs'
import path from 'node:path'
import { walk, normalizeSlashes } from './fs.mjs'
import { extractFrontmatter } from './frontmatter.mjs'
import { extractMarkdownLinks, extractDependencies } from './markdown.mjs'
import { inferType } from './adapters.mjs'

export function discoverSpecs(repoRoot, adapter) {
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
      type: inferType(relativePath, adapter),
      title: frontmatter.title || path.basename(relativePath, '.md'),
      permalink: frontmatter.permalink || null,
      links: extractMarkdownLinks(content),
      explicitDependencies: extractDependencies(content)
    }
  })
}
