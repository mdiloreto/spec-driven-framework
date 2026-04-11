/**
 * Minimal CLI argument parser. No external dependencies.
 * Parses positional args and --flag / --key value pairs.
 */
export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];

      if (next && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

export function getFlag(args: ParsedArgs, name: string): string | undefined {
  const val = args.flags.get(name);
  return typeof val === "string" ? val : undefined;
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name);
}
