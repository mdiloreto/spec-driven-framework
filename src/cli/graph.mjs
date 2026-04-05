#!/usr/bin/env node

import { parseArgs } from '../core/args.mjs'
import { loadAdapter } from '../core/adapters.mjs'
import { discoverSpecs } from '../core/discover.mjs'
import { buildGraph } from '../core/graph.mjs'

const args = parseArgs(process.argv)
const adapter = loadAdapter(args.repo, args.adapter || 'demo')
const specs = discoverSpecs(args.repo, adapter)
const graph = buildGraph(specs, adapter)

process.stdout.write(JSON.stringify({ adapter: adapter.name, ...graph }, null, 2))
