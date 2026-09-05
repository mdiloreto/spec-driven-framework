import path from 'node:path'

export interface ParsedArgs extends Record<string, string | string[] | undefined> {
  changed: string[]
  repo: string
  adapter: string | undefined
  target: string | undefined
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    changed: [],
    repo: process.cwd(),
    adapter: undefined,
    target: undefined
  }

  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i]
    if (!current) continue
    if (!current.startsWith('--')) continue

    const key = current.slice(2)
    const next = argv[i + 1]
    const value = next && !next.startsWith('--') ? next : 'true'

    if (next && !next.startsWith('--')) {
      i += 1
    }

    if (key === 'changed') {
      args.changed.push(value)
      continue
    }

    args[key] = value
  }

  args.repo = path.resolve(typeof args.repo === 'string' ? args.repo : process.cwd())
  args.adapter = typeof args.adapter === 'string' ? args.adapter : undefined
  args.target = typeof args.target === 'string' ? args.target : undefined

  return args
}
