/**
 * Minimal CLI argument parser. No external dependencies.
 * Parses positional args and --flag / --key value pairs.
 */
export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true | string[]>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg.startsWith("--")) {
      const raw = arg.slice(2);
      const eqIdx = raw.indexOf("=");

      if (eqIdx !== -1) {
        // --key=value form
        addFlag(flags, raw.slice(0, eqIdx), raw.slice(eqIdx + 1));
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          addFlag(flags, raw, next);
          i++;
        } else {
          flags.set(raw, true);
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

export function getFlag(args: ParsedArgs, name: string): string | undefined {
  const val = args.flags.get(name);
  if (typeof val === "string") return val;
  return Array.isArray(val) ? val.at(-1) : undefined;
}

export function getFlags(args: ParsedArgs, name: string): string[] {
  const value = args.flags.get(name);
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name);
}

function addFlag(
  flags: ParsedArgs["flags"],
  name: string,
  value: string,
): void {
  const current = flags.get(name);
  if (typeof current === "string") {
    flags.set(name, [current, value]);
  } else if (Array.isArray(current)) {
    current.push(value);
  } else {
    flags.set(name, value);
  }
}
