import { join } from "node:path";
import type {
  FileSystem,
  LoopOptions,
  IloState,
  ExecutionPlan,
  GenerationRequest,
  ContextBundle,
  ChangeCheckResult,
  ChangeStatus,
  ArtifactKind,
  OpenSpecClient,
  SpecGraph,
} from "../types/index.js";
import { StateManager } from "./state-manager.js";
import { ArtifactChecker } from "./checker.js";
import { ContextAssembler } from "./context-assembler.js";
import { ExecutionPlanner } from "./execution-planner.js";

/**
 * Events emitted during loop execution for observability.
 */
export interface LoopEvent {
  phase: "scan" | "check" | "generate" | "plan" | "execute";
  changeName?: string;
  message: string;
  data?: unknown;
}

export type LoopEventHandler = (event: LoopEvent) => void;

/**
 * Result of a full loop run.
 */
export interface LoopResult {
  state: IloState;
  checkResults: ChangeCheckResult[];
  generationRequests: GenerationRequest[];
  executionPlan: ExecutionPlan;
  executed: string[];
}

/**
 * The Implementation Loop Orchestrator.
 *
 * Drives the full lifecycle: scan → check → generate → plan → execute.
 * The loop is deterministic — no LLM reasoning in the orchestration.
 * Backends (Claude Code, OpenCode) handle the actual code generation.
 */
export class ImplementationLoop {
  private readonly stateManager: StateManager;
  private readonly checker: ArtifactChecker;
  private readonly onEvent: LoopEventHandler;

  constructor(
    private readonly fs: FileSystem,
    private readonly projectRoot: string,
    private readonly openspec: OpenSpecClient,
    private readonly buildGraph: () => SpecGraph,
    private readonly options: LoopOptions = {},
    onEvent?: LoopEventHandler,
  ) {
    this.stateManager = new StateManager(fs, projectRoot);
    this.checker = new ArtifactChecker(fs, openspec);
    this.onEvent = onEvent ?? (() => {});
  }

  public get state(): Readonly<IloState> {
    return this.stateManager.current;
  }

  public async run(): Promise<LoopResult> {
    const graph = await this.scan();
    const checkResults = await this.check();
    const generationRequests = await this.generate(checkResults);

    const planner = new ExecutionPlanner(this.fs, graph);
    const executionPlan = planner.plan(this.stateManager.current);
    this.emit("plan", undefined, "Execution plan built", executionPlan);

    const executed: string[] = [];
    if (!this.options.dryRun && generationRequests.length === 0) {
      const assembler = new ContextAssembler(this.fs, graph, this.openspec);
      const completedIds = await this.execute(executionPlan, assembler);
      executed.push(...completedIds);
    }

    if (!this.options.dryRun) {
      this.stateManager.save();
    }

    return {
      state: this.stateManager.current,
      checkResults,
      generationRequests,
      executionPlan,
      executed,
    };
  }

  // -- Individual phases (exposed for CLI commands) --

  public async scan(): Promise<SpecGraph> {
    this.emit("scan", undefined, "Rebuilding spec-graph and reading changes");

    const graph = this.buildGraph();
    const changes = await this.openspec.list();
    this.stateManager.mergeChanges(changes);

    this.emit("scan", undefined, `Found ${changes.length} change(s)`, {
      changes: changes.map((c) => c.name),
    });

    return graph;
  }

  public async check(): Promise<ChangeCheckResult[]> {
    const results: ChangeCheckResult[] = [];

    for (const change of this.stateManager.current.changes) {
      if (this.options.target && change.name !== this.options.target) continue;

      this.emit("check", change.name, `Checking artifacts for ${change.name}`);

      const changePath = this.resolveChangePath(change.name);
      const result = await this.checker.check(changePath, change.name);
      results.push(result);

      const artifactStates = Object.fromEntries(
        result.artifacts.map((a) => [a.artifact, this.checker.toArtifactState(a)]),
      ) as Record<ArtifactKind, { exists: boolean; valid: boolean; lastChecked: string; issues?: string[] }>;

      // Only advance status for early-phase states; never regress in-progress/complete/blocked
      const preservedStatuses: ChangeStatus[] = ["in-progress", "complete", "blocked"];
      const newStatus = preservedStatuses.includes(change.status)
        ? change.status
        : result.status === "complete"
          ? "ready"
          : change.status === "pending"
            ? "checking"
            : change.status;

      this.stateManager.updateChange(change.name, {
        status: newStatus,
        artifacts: artifactStates,
      });

      this.emit("check", change.name, `${change.name}: ${result.status}`, result);
    }

    return results;
  }

  public async generate(checkResults: ChangeCheckResult[]): Promise<GenerationRequest[]> {
    const requests: GenerationRequest[] = [];
    const artifactOrder: ArtifactKind[] = ["proposal", "design", "specs", "tasks"];

    for (const result of checkResults) {
      if (result.status === "complete") continue;

      for (const artifact of result.artifacts) {
        if (artifact.exists && artifact.valid) continue;

        const artifactIdx = artifactOrder.indexOf(artifact.artifact);
        const priorsMissing = result.artifacts
          .filter((a) => artifactOrder.indexOf(a.artifact) < artifactIdx)
          .some((a) => !a.exists || !a.valid);

        if (priorsMissing) continue;

        // Enrich context with openspec instructions when available
        const context: Record<string, unknown> = { issues: artifact.issues };
        try {
          const enriched = await this.openspec.instructions(
            artifact.artifact,
            result.changeName,
          );
          context.instruction = enriched.instruction;
          context.template = enriched.template;
          context.openspecContext = enriched.context;
          context.outputPath = enriched.outputPath;
        } catch {
          // OpenSpec instructions unavailable — fall back to built-in instruction
        }

        requests.push({
          action: "generate",
          change: result.changeName,
          artifact: artifact.artifact,
          context,
          instruction: (context.instruction as string | undefined)
            ?? this.buildGenerationInstruction(
              result.changeName,
              artifact.artifact,
              artifact.issues,
            ),
        });

        this.stateManager.updateChange(result.changeName, { status: "generating" });
        this.emit(
          "generate",
          result.changeName,
          `Requesting generation of ${artifact.artifact} for ${result.changeName}`,
          { artifact: artifact.artifact, issues: artifact.issues },
        );

        break; // One artifact at a time per change (linear flow)
      }
    }

    return requests;
  }

  public async buildPlan(): Promise<ExecutionPlan> {
    const graph = await this.scan();
    await this.check();
    const planner = new ExecutionPlanner(this.fs, graph);
    return planner.plan(this.stateManager.current);
  }

  // -- Execution --

  private async execute(
    plan: ExecutionPlan,
    assembler: ContextAssembler,
  ): Promise<string[]> {
    const backend = this.options.backend;
    if (!backend) {
      this.emit("execute", undefined, "No backend configured — skipping execution");
      return [];
    }

    const executed: string[] = [];

    for (const wave of plan.waves) {
      this.emit("execute", undefined, `Executing wave ${wave.waveIndex}`);

      for (const waveChange of wave.changes) {
        const pendingTasks = waveChange.tasks.filter((t) => !t.completed);
        if (pendingTasks.length === 0) continue;

        this.stateManager.updateChange(waveChange.name, { status: "in-progress" });

        for (const task of pendingTasks) {
          this.emit("execute", waveChange.name, `Executing task ${task.id}: ${task.description}`);

          const changePath = this.resolveChangePath(waveChange.name);
          const bundle = await assembler.assemble(
            changePath,
            waveChange.name,
            task,
            { maxTokens: this.options.maxTokens },
          );

          const prompt = this.buildExecutionPrompt(bundle, assembler);
          const result = await backend.execute(prompt, {
            cwd: this.projectRoot,
          });

          if (result.success) {
            const changeState = this.stateManager.current.changes.find(
              (c) => c.name === waveChange.name,
            );
            if (changeState) {
              this.stateManager.updateChange(waveChange.name, {
                completedTasks: [...changeState.completedTasks, task.id],
                currentTask: undefined,
              });
            }
            // Persist after each task so progress survives interruptions
            this.stateManager.save();
            executed.push(`${waveChange.name}/${task.id}`);
          } else {
            this.emit(
              "execute",
              waveChange.name,
              `Task ${task.id} failed: ${result.error ?? "unknown error"}`,
            );
            break;
          }
        }

        const allDone = waveChange.tasks.every((t) => t.completed) ||
          this.stateManager.current.changes
            .find((c) => c.name === waveChange.name)
            ?.completedTasks.length === waveChange.tasks.length;

        if (allDone) {
          this.stateManager.updateChange(waveChange.name, { status: "complete" });
        }
      }
    }

    return executed;
  }

  // -- Helpers --

  private resolveChangePath(changeName: string): string {
    return join(this.projectRoot, "openspec", "changes", changeName);
  }

  private buildGenerationInstruction(
    changeName: string,
    artifact: ArtifactKind,
    issues: string[],
  ): string {
    const issueList = issues.length > 0 ? `\nIssues found:\n${issues.map((i) => `- ${i}`).join("\n")}` : "";

    switch (artifact) {
      case "proposal":
        return `Create proposal.md (PFB) for change "${changeName}". Define the problem, purpose, scope, and capabilities.${issueList}`;
      case "specs":
        return `Create spec files in specs/ for change "${changeName}". Each capability needs requirements with testable scenarios.${issueList}`;
      case "design":
        return `Create design.md (EAD) for change "${changeName}". Include Context, Goals/Non-Goals, Decisions (with rationale and alternatives), and Risks/Trade-offs.${issueList}`;
      case "tasks":
        return `Create tasks.md for change "${changeName}". Break down into numbered sections with checkbox tasks. Each task should be completable in 1-4 hours.${issueList}`;
    }
  }

  private buildExecutionPrompt(bundle: ContextBundle, assembler: ContextAssembler): string {
    return assembler.formatAsMarkdown(bundle);
  }

  private emit(
    phase: LoopEvent["phase"],
    changeName: string | undefined,
    message: string,
    data?: unknown,
  ): void {
    this.onEvent({ phase, changeName, message, data });
  }
}
