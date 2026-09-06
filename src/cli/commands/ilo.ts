import { resolve, join } from "node:path";
import type { ParsedArgs } from "../args";
import { getFlag, hasFlag } from "../args";
import { OpenSpecCLIClient } from "../../clients/index";
import { NodeFileSystem } from "../../lib/index";
import {
  ImplementationLoop,
  StateManager,
  ArtifactChecker,
} from "../../services/index";
import type { LoopEvent } from "../../services/implementation-loop";
import type { OpenSpecChangeListItem, SpecGraph } from "../../types/index";
import { buildProjectGraph, writeManifest } from "../../graph/index";

/**
 * Handles all `sdf ilo <subcommand>` CLI routing.
 */
export class IloCommand {
  private readonly projectRoot: string;
  private readonly fs: NodeFileSystem;
  private readonly openspec: OpenSpecCLIClient;

  constructor({ cwd }: { cwd?: string } = {}) {
    this.projectRoot = resolve(cwd ?? process.cwd());
    this.fs = new NodeFileSystem();
    this.openspec = new OpenSpecCLIClient({ cwd: this.projectRoot });
  }

  public async execute(args: ParsedArgs): Promise<void> {
    const subcommand = args.positional[1]; // positional[0] is "ilo"

    switch (subcommand) {
      case "run":
        return this.run(args);
      case "status":
        return this.status(args);
      case "check":
        return this.check(args);
      case "plan":
        return this.plan(args);
      default:
        console.error(
          subcommand
            ? `Unknown ilo command: ${subcommand}`
            : "Missing ilo subcommand",
        );
        this.printHelp();
        process.exit(1);
    }
  }

  private async run(args: ParsedArgs): Promise<void> {
    const target = getFlag(args, "change");
    const dryRun = hasFlag(args, "dry-run");
    const debugTrace = hasFlag(args, "debug-trace");
    const json = hasFlag(args, "json");

    const loop = new ImplementationLoop(
      this.fs,
      this.projectRoot,
      this.openspec,
      () => this.buildGraph(),
      { target, dryRun, debugTrace },
      json ? undefined : (event: LoopEvent) => this.logEvent(event),
    );

    const result = await loop.run();

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `\nLoop complete. ${result.checkResults.length} change(s) checked.`,
      );
      if (result.generationRequests.length > 0) {
        console.log(
          `${result.generationRequests.length} artifact(s) need generation:`,
        );
        for (const req of result.generationRequests) {
          console.log(`  - ${req.change}/${req.artifact}: ${req.instruction}`);
        }
      }
      if (result.executed.length > 0) {
        console.log(`${result.executed.length} task(s) executed.`);
      }
    }
  }

  private async status(args: ParsedArgs): Promise<void> {
    const json = hasFlag(args, "json");
    const stateManager = new StateManager(this.fs, this.projectRoot);
    const state = stateManager.current;

    if (json) {
      console.log(JSON.stringify(state, null, 2));
      return;
    }

    if (state.changes.length === 0) {
      console.log("No changes tracked. Run `sdf ilo run` to scan.");
      return;
    }

    const runtime = state.currentPhase
      ? `, phase: ${state.currentPhase}`
      : "";
    console.log(`ILO State (updated: ${state.updatedAt}${runtime})\n`);
    for (const change of state.changes) {
      const artifacts = Object.entries(change.artifacts)
        .map(([kind, s]) => {
          const icon = s.exists && s.valid ? "✓" : s.exists ? "!" : "✗";
          return `${icon} ${kind}`;
        })
        .join("  ");

      const taskProgress =
        change.completedTasks.length > 0
          ? ` [${change.completedTasks.length} tasks done]`
          : "";

      console.log(
        `  ${change.name}  [${change.status}]  ${artifacts}${taskProgress}`,
      );
    }
  }

  private async check(args: ParsedArgs): Promise<void> {
    const target = getFlag(args, "change");
    const json = hasFlag(args, "json");

    const checker = new ArtifactChecker(this.fs, this.openspec);
    const changes = await this.discoverChanges();
    const results = [];

    for (const change of changes) {
      if (target && change.name !== target) continue;

      const result = await checker.check(change.path, change.name);
      results.push(result);

      if (!json) {
        const statusIcon =
          result.status === "complete"
            ? "✓"
            : result.status === "partial"
              ? "!"
              : "✗";
        console.log(`${statusIcon} ${change.name}: ${result.status}`);
        for (const artifact of result.artifacts) {
          if (artifact.issues.length > 0) {
            for (const issue of artifact.issues) {
              console.log(`    - ${issue}`);
            }
          }
        }
      }
    }

    if (json) {
      console.log(JSON.stringify(results, null, 2));
    }
  }

  private async plan(args: ParsedArgs): Promise<void> {
    const target = getFlag(args, "change");
    const json = hasFlag(args, "json");

    const loop = new ImplementationLoop(
      this.fs,
      this.projectRoot,
      this.openspec,
      () => this.buildGraph(),
      { target },
    );

    const plan = await loop.buildPlan();

    if (json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    if (plan.waves.length === 0) {
      console.log("No execution waves. All changes may be complete or blocked.");
      return;
    }

    for (const wave of plan.waves) {
      console.log(`\nWave ${wave.waveIndex}:`);
      for (const change of wave.changes) {
        const pending = change.tasks.filter((t) => !t.completed).length;
        const done = change.tasks.filter((t) => t.completed).length;
        console.log(
          `  ${change.name}: ${change.tasks.length} tasks (${done} done, ${pending} pending)`,
        );
      }
    }

    if (plan.blockedChanges.length > 0) {
      console.log("\nBlocked:");
      for (const blocked of plan.blockedChanges) {
        console.log(
          `  ${blocked.name} — blocked by: ${blocked.blockedBy.join(", ")}`,
        );
      }
    }
  }

  /**
   * Discover changes via OpenSpec CLI, falling back to filesystem scan
   * of openspec/changes/ directory when OpenSpec isn't available.
   */
  private async discoverChanges(): Promise<OpenSpecChangeListItem[]> {
    try {
      return await this.openspec.list();
    } catch {
      const changesDir = join(this.projectRoot, "openspec", "changes");
      if (!this.fs.exists(changesDir)) return [];

      return this.fs
        .listDir(changesDir)
        .filter((name) => {
          const changePath = join(changesDir, name);
          return this.fs.exists(join(changePath, "proposal.md")) ||
            this.fs.exists(join(changePath, "design.md")) ||
            this.fs.exists(join(changePath, "tasks.md"));
        })
        .map((name) => ({
          name,
          path: join(changesDir, name),
        }));
    }
  }

  private async buildGraph(): Promise<SpecGraph> {
    const { graph } = await buildProjectGraph(
      this.projectRoot,
      this.openspec,
      this.fs,
    );
    writeManifest(this.fs, this.projectRoot, graph);
    return graph;
  }

  private logEvent(event: LoopEvent): void {
    const prefix = event.changeName
      ? `[${event.phase}:${event.changeName}]`
      : `[${event.phase}]`;
    console.log(`${prefix} ${event.message}`);
  }

  private printHelp(): void {
    console.log(`
Usage: sdf ilo <command> [options]

Commands:
  run      Run the implementation loop
  status   Show current loop state
  check    Check artifact completeness
  plan     Show execution plan

Options:
  --change <name>   Target a specific change
  --dry-run         Skip mutations
  --debug-trace     Capture raw backend traces under .sdf/traces/
  --json            Machine-parseable output
`.trim());
  }
}
