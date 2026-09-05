import { parseArgs } from '../core/args.js'
import { loadAdapter } from '../core/adapters.js'
import { discoverSpecs } from '../core/discover.js'
import { buildGraph } from '../core/graph.js'
import { computeImpact } from '../core/impact.js'
import { createCommandEnvelope } from '../core/output.js'

const args = parseArgs(process.argv)
const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)
const graph = buildGraph(specs, adapter)
const impact = computeImpact(graph, args.changed)

process.stdout.write(JSON.stringify(createCommandEnvelope({
  command: 'impact',
  adapter: adapter.name,
  repo: args.repo,
  result: impact
}), null, 2))
