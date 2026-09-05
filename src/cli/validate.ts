import { parseArgs } from '../core/args.js'
import { loadAdapter } from '../core/adapters.js'
import { discoverSpecs } from '../core/discover.js'
import { createCommandEnvelope } from '../core/output.js'
import { validateSpecs } from '../core/validate.js'

const args = parseArgs(process.argv)
const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)
const validation = validateSpecs(specs, adapter)

process.stdout.write(JSON.stringify(createCommandEnvelope({
  command: 'validate',
  adapter: adapter.name,
  repo: args.repo,
  ok: validation.ok,
  result: validation
}), null, 2))

if (!validation.ok) {
  process.exitCode = 1
}
