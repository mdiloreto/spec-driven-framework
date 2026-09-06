#!/usr/bin/env node

import { parseArgs } from "./args.js";
import { IloCommand } from "./commands/ilo.js";
import { GraphCommand } from "./commands/graph.js";

const args = parseArgs(process.argv.slice(2));
const subcommand = args.positional[0];

async function main(): Promise<void> {
  switch (subcommand) {
    case "graph": {
      const graph = new GraphCommand();
      await graph.execute(args);
      break;
    }
    case "ilo": {
      const ilo = new IloCommand();
      await ilo.execute(args);
      break;
    }
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${subcommand}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
sdf - spec-driven framework

Usage: sdf <command> [options]

Commands:
  graph build                Build the spec dependency graph
  graph impact --changed <path>  Compute impact of spec changes
  graph order                Show topological execution order
  graph show                 Display graph summary

  ilo run [--change <name>]  Run the implementation loop
  ilo status                 Show loop state
  ilo check                  Check artifact completeness
  ilo plan                   Show execution plan

  skills generate --tool <claude|opencode|all>  Generate skill files

Options:
  --json                     Machine-parseable JSON output
  --dry-run                  Skip mutations (ilo commands)
  --help, -h                 Show this help
`.trim());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
