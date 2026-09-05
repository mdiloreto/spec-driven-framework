import { parseArgs } from '../core/args.js'
import { loadAdapter } from '../core/adapters.js'
import { discoverSpecs } from '../core/discover.js'
import { buildGraph } from '../core/graph.js'
import { createCommandEnvelope } from '../core/output.js'
import { validateSpecs } from '../core/validate.js'
import { buildSliceBundle } from '../core/slice.js'

const args = parseArgs(process.argv)

if (args.changed.length === 0) {
  throw new Error('slice requires at least one --changed <spec-path> argument')
}

const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)
const graph = buildGraph(specs, adapter)
const validation = validateSpecs(specs, adapter)
const slice = buildSliceBundle({
  adapter,
  graph,
  changed: args.changed,
  validation
})

const ok = validation.ok && slice.missingChanged.length === 0

process.stdout.write(JSON.stringify(createCommandEnvelope({
  command: 'slice',
  adapter: adapter.name,
  repo: args.repo,
  ok,
  result: slice
}), null, 2))

if (!ok) {
  process.exitCode = 1
}
