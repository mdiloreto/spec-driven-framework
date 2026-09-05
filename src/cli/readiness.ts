import { parseArgs } from '../core/args.js'
import { loadAdapter } from '../core/adapters.js'
import { discoverSpecs } from '../core/discover.js'
import { buildGraph } from '../core/graph.js'
import { createCommandEnvelope } from '../core/output.js'
import { evaluateReadiness } from '../core/readiness.js'
import { validateSpecs } from '../core/validate.js'

const args = parseArgs(process.argv)
const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)
const graph = buildGraph(specs, adapter)
const validation = validateSpecs(specs, adapter)
const readiness = evaluateReadiness(
  args.target
    ? { graph, validation, targetPaths: [args.target] }
    : { graph, validation }
)
const ok = readiness.reportCount > 0 && readiness.readyCount === readiness.reportCount

process.stdout.write(JSON.stringify(createCommandEnvelope({
  command: 'readiness',
  adapter: adapter.name,
  repo: args.repo,
  ok,
  result: readiness
}), null, 2))

if (!ok) {
  process.exitCode = 1
}
