import path from 'node:path'

export function parseArgs(argv) {
  const args = { changed: [] }
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i]
    if (!current.startsWith('--')) continue
    const key = current.slice(2)
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    if (key === 'changed') {
      args.changed.push(value)
    } else {
      args[key] = value
    }
  }
  args.repo = path.resolve(args.repo || process.cwd())
  return args
}
