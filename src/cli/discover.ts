import { parseArgs } from '../core/args.js'
import { loadAdapter } from '../core/adapters.js'
import { discoverSpecs } from '../core/discover.js'
import { createCommandEnvelope } from '../core/output.js'

const args = parseArgs(process.argv)
const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)

process.stdout.write(JSON.stringify(createCommandEnvelope({
  command: 'discover',
  adapter: adapter.name,
  repo: args.repo,
  result: { specs }
}), null, 2))
