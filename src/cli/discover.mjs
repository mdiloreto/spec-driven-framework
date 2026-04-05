#!/usr/bin/env node

import { parseArgs } from '../core/args.mjs'
import { loadAdapter } from '../core/adapters.mjs'
import { discoverSpecs } from '../core/discover.mjs'

const args = parseArgs(process.argv)
const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)

process.stdout.write(JSON.stringify({ adapter: adapter.name, specs }, null, 2))
