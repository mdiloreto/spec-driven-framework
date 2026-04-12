import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  BackendSummaryInput,
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
  LoopPhase,
  JournalEntry,
} from "../types/index";
import { StateManager } from "./state-manager";
import { ArtifactChecker } from "./checker";
import { ContextAssembler } from "./context-assembler";
import { ExecutionPlanner } from "./execution-planner";
import { JournalManager } from "./journal-manager";
import { TraceManager } from "./trace-manager";

/**
 * Events emitted during loop execution for observability.
 */
export interface LoopEvent {
  phase: LoopPhase;
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
  private readonly journalManager?: JournalManager;
  private readonly traceManager?: TraceManager;
  private readonly onEvent: LoopEventHandler;
  private runId?: string;

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
    this.journalManager = options.dryRun
      ? undefined
      : new JournalManager(fs, projectRoot);
    this.traceManager = options.dryRun || !options.debugTrace
      ? undefined
      : new TraceManager(fs, projectRoot);
    this.onEvent = onEvent ?? (() => {});
  }

  public get state(): Readonly<IloState> {
    return this.stateManager.current;
  }

  public async run(): Promise<LoopResult> {
    this.runId = this.options.dryRun ? undefined : randomUUID();

    const graph = await this.withPhase("scan", () => this.scan());
    const checkResults = await this.withPhase("check", () => this.check());
    const generationRequests = await this.withPhase(
      "generate",
      () => this.generate(checkResults),
    );

    const planner = new ExecutionPlanner(this.fs, graph);
    const executionPlan = await this.withPhase("plan", async () => {
      const plan = planner.plan(this.stateManager.current);
      this.reconcilePlanFingerprints(plan);
      this.appendJournal({
        event: "execution_plan_built",
        phase: "plan",
        data: {
          waves: plan.waves.length,
          blockedChanges: plan.blockedChanges.length,
        },
      });
      return plan;
    });
    this.emit("plan", undefined, "Execution plan built", executionPlan);

    const executed: string[] = [];
    if (!this.options.dryRun && generationRequests.length === 0) {
      const assembler = new ContextAssembler(this.fs, graph, this.openspec);
      const completedIds = await this.withPhase("execute", () =>
        this.execute(executionPlan, assembler)
      );
      executed.push(...completedIds);
    }

    if (!this.options.dryRun) {
      this.appendJournal({
        event: "run_completed",
        data: {
          executedTasks: executed.length,
          generationRequests: generationRequests.length,
        },
      });
      this.stateManager.updateLoop({ activeRunId: undefined, currentPhase: undefined });
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
        this.appendJournal({
          event: "generation_requested",
          phase: "generate",
          changeName: result.changeName,
          data: { artifact: artifact.artifact, issues: artifact.issues },
        });
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
          this.stateManager.updateChange(waveChange.name, {
            currentTask: task.id,
            lastError: undefined,
          });
          this.stateManager.save();
          this.appendJournal({
            event: "task_started",
            phase: "execute",
            changeName: waveChange.name,
            taskId: task.id,
          });

          const changePath = this.resolveChangePath(waveChange.name);
          const bundle = await assembler.assemble(
            changePath,
            waveChange.name,
            task,
            { maxTokens: this.options.maxTokens },
          );

          const prompt = this.buildExecutionPrompt(bundle, assembler);
          this.appendJournal({
            event: "backend_invoked",
            phase: "execute",
            changeName: waveChange.name,
            taskId: task.id,
            backend: backend.name,
          });
          const result = await backend.execute(prompt, {
            cwd: this.projectRoot,
          });

          const tracePath = this.captureDebugTrace({
            backend: backend.name,
            changeName: waveChange.name,
            taskId: task.id,
            prompt,
            output: result.output,
            trace: result.trace,
            sessionId: result.sessionId,
            success: result.success,
            error: result.error,
          });
          if (tracePath) {
            this.appendJournal({
              event: "backend_trace_captured",
              phase: "execute",
              changeName: waveChange.name,
              taskId: task.id,
              backend: backend.name,
              sessionId: result.sessionId,
              data: { path: tracePath },
            });
          }

          this.appendJournal({
            event: "backend_completed",
            phase: "execute",
            changeName: waveChange.name,
            taskId: task.id,
            backend: backend.name,
            sessionId: result.sessionId,
            data: { success: result.success },
          });

          const summary = await this.summarizeBackendResult({
            backend: backend.name,
            changeName: waveChange.name,
            taskId: task.id,
            sessionId: result.sessionId,
            prompt,
            output: result.output,
            trace: result.trace,
            success: result.success,
            error: result.error,
          });
          if (summary) {
            this.appendJournal({
              event: "backend_summary",
              phase: "execute",
              changeName: waveChange.name,
              taskId: task.id,
              backend: backend.name,
              sessionId: result.sessionId,
              summary: summary.summary,
              data: {
                source: summary.source,
                provider: summary.provider,
                error: summary.error,
              },
            });
          }

          if (result.success) {
            const changeState = this.stateManager.current.changes.find(
              (c) => c.name === waveChange.name,
            );
            if (changeState) {
              const completedTasks = new Set(changeState.completedTasks);
              completedTasks.add(task.id);
              this.stateManager.updateChange(waveChange.name, {
                completedTasks: [...completedTasks],
                currentTask: undefined,
                backendSessionId: result.sessionId,
                lastError: undefined,
              });
            }
            // Persist after each task so progress survives interruptions
            this.stateManager.save();
            this.appendJournal({
              event: "task_completed",
              phase: "execute",
              changeName: waveChange.name,
              taskId: task.id,
              backend: backend.name,
              sessionId: result.sessionId,
            });
            executed.push(`${waveChange.name}/${task.id}`);
          } else {
            this.stateManager.updateChange(waveChange.name, {
              backendSessionId: result.sessionId,
              lastError: result.error ?? "unknown error",
            });
            this.stateManager.save();
            this.appendJournal({
              event: "task_failed",
              phase: "execute",
              changeName: waveChange.name,
              taskId: task.id,
              backend: backend.name,
              sessionId: result.sessionId,
              data: { error: result.error ?? "unknown error" },
            });
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

  private async withPhase<T>(
    phase: LoopPhase,
    action: () => Promise<T>,
  ): Promise<T> {
    this.emit(phase, undefined, `Starting ${phase}`);

    if (!this.options.dryRun && this.runId) {
      this.stateManager.updateLoop({ activeRunId: this.runId, currentPhase: phase });
      this.stateManager.save();
      this.appendJournal({ event: "phase_started", phase });
    }

    const result = await action();

    if (!this.options.dryRun) {
      this.stateManager.save();
      this.appendJournal({ event: "phase_completed", phase });
    }

    return result;
  }

  private appendJournal(
    entry: Omit<JournalEntry, "seq" | "timestamp" | "runId">,
  ): void {
    if (!this.runId) return;
    this.journalManager?.append({ runId: this.runId, ...entry });
  }

  private reconcilePlanFingerprints(plan: ExecutionPlan): void {
    for (const wave of plan.waves) {
      for (const change of wave.changes) {
        const existingState = this.stateManager.getChange(change.name);
        const planFingerprint = createHash("sha1")
          .update(
            change.tasks
              .map((task) => `${task.id}:${task.description}`)
              .join("\n"),
          )
          .digest("hex");

        if (
          existingState?.planFingerprint &&
          existingState.planFingerprint !== planFingerprint
        ) {
          const nextTaskIds = new Set(change.tasks.map((task) => task.id));
          const preservedCompletedTasks = existingState.completedTasks.filter((taskId) =>
            nextTaskIds.has(taskId)
          );
          const droppedCompletedTasks = existingState.completedTasks.filter((taskId) =>
            !nextTaskIds.has(taskId)
          );
          const nextCurrentTask = existingState.currentTask && nextTaskIds.has(existingState.currentTask)
            ? existingState.currentTask
            : undefined;

          this.stateManager.updateChange(change.name, {
            completedTasks: preservedCompletedTasks,
            currentTask: nextCurrentTask,
            planFingerprint,
          });

          this.appendJournal({
            event: "plan_rebased",
            phase: "plan",
            changeName: change.name,
            data: {
              previousFingerprint: existingState.planFingerprint,
              nextFingerprint: planFingerprint,
              preservedCompletedTasks,
              droppedCompletedTasks,
              previousCurrentTask: existingState.currentTask,
              nextCurrentTask,
            },
          });

          this.emit(
            "plan",
            change.name,
            `Plan changed for ${change.name}; reconciled persisted progress`,
            {
              preservedCompletedTasks,
              droppedCompletedTasks,
              previousCurrentTask: existingState.currentTask,
              nextCurrentTask,
            },
          );
          continue;
        }

        this.stateManager.updateChange(change.name, { planFingerprint });
      }
    }
  }

  private async summarizeBackendResult(input: BackendSummaryInput): Promise<{
    summary: string;
    source: "hook" | "fallback";
    provider?: string;
    error?: string;
  } | undefined> {
    if (this.options.summarizer) {
      try {
        const result = await this.options.summarizer.summarize(input);
        if (typeof result === "string") {
          const summary = this.normalizeSummary(result);
          if (summary) {
            return { summary, source: "hook" };
          }
        } else if (result?.summary) {
          const summary = this.normalizeSummary(result.summary);
          if (summary) {
            return {
              summary,
              source: "hook",
              provider: result.provider,
            };
          }
        }
      } catch (error) {
        const fallback = this.fallbackBackendSummary(input.output);
        if (fallback) {
          return {
            summary: fallback,
            source: "fallback",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }

    const fallback = this.fallbackBackendSummary(input.output);
    if (!fallback) return undefined;
    return { summary: fallback, source: "fallback" };
  }

  private captureDebugTrace(input: BackendSummaryInput): string | undefined {
    if (!this.traceManager || !this.runId) return undefined;

    return this.traceManager.write({
      capturedAt: new Date().toISOString(),
      runId: this.runId,
      backend: input.backend,
      changeName: input.changeName,
      taskId: input.taskId,
      sessionId: input.sessionId,
      success: input.success,
      error: input.error,
      prompt: input.prompt,
      output: input.output,
      trace: input.trace,
    });
  }

  private fallbackBackendSummary(output: string): string | undefined {
    const normalized = this.normalizeSummary(output);
    if (!normalized) return undefined;
    return normalized.length <= 280
      ? normalized
      : `${normalized.slice(0, 277)}...`;
  }

  private normalizeSummary(summary: string): string | undefined {
    const normalized = summary.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private emit(
    phase: LoopPhase,
    changeName: string | undefined,
    message: string,
    data?: unknown,
  ): void {
    this.onEvent({ phase, changeName, message, data });
  }
}
