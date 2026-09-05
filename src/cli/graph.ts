import { parseArgs } from '../core/args.js'
import { loadAdapter } from '../core/adapters.js'
import { discoverSpecs } from '../core/discover.js'
import { buildGraph } from '../core/graph.js'
import { createCommandEnvelope } from '../core/output.js'

const args = parseArgs(process.argv)
const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)
const graph = buildGraph(specs, adapter)

process.stdout.write(JSON.stringify(createCommandEnvelope({
  command: 'graph',
  adapter: adapter.name,
  repo: args.repo,
  result: graph
}), null, 2))
