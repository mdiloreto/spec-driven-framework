import { join } from "node:path";
import type {
  FileSystem,
  ArtifactKind,
  IloState,
  ChangeState,
  ArtifactState,
  OpenSpecChangeListItem,
} from "../types/index";

const RUNTIME_DIR = ".sdf";
const STATE_FILE = "ilo-state.json";
const LEGACY_STATE_FILE = "ilo-state.json";
const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  "proposal",
  "design",
  "specs",
  "tasks",
];

/**
 * Manages ILO loop state persistence.
 * Tracks per-change artifact status, completed tasks, and blocking dependencies
 * across sessions.
 */
export class StateManager {
  private readonly statePath: string;
  private readonly legacyStatePath: string;
  private state: IloState;

  constructor(
    private readonly fs: FileSystem,
    private readonly projectRoot: string,
  ) {
    this.statePath = join(this.projectRoot, RUNTIME_DIR, STATE_FILE);
    this.legacyStatePath = join(this.projectRoot, LEGACY_STATE_FILE);
    this.state = this.load();
  }

  public get current(): Readonly<IloState> {
    return this.state;
  }

  public getChange(name: string): ChangeState | undefined {
    return this.state.changes.find((c) => c.name === name);
  }

  public updateChange(name: string, update: Partial<ChangeState>): void {
    const transitionedAt = StateManager.now();
    this.state = {
      ...this.state,
      changes: this.state.changes.map((c) =>
        c.name === name
          ? { ...c, ...update, lastTransitionAt: transitionedAt }
          : c,
      ),
      lastTransitionAt: transitionedAt,
      updatedAt: transitionedAt,
    };
  }

  public updateLoop(update: Partial<Pick<IloState, "activeRunId" | "currentPhase">>): void {
    const transitionedAt = StateManager.now();
    this.state = {
      ...this.state,
      ...update,
      lastTransitionAt: transitionedAt,
      updatedAt: transitionedAt,
    };
  }

  /**
   * Reconcile existing state with a fresh OpenSpec change list.
   * Preserves progress for known changes, adds new ones, drops removed ones.
   */
  public mergeChanges(changes: OpenSpecChangeListItem[]): void {
    const existingByName = new Map(
      this.state.changes.map((c) => [c.name, c]),
    );

    const merged: ChangeState[] = changes.map(
      (change) => existingByName.get(change.name) ?? StateManager.defaultChangeState(change.name),
    );

    this.state = {
      ...this.state,
      changes: merged,
      updatedAt: StateManager.now(),
    };
  }

  public save(): void {
    const updated: IloState = {
      ...this.state,
      updatedAt: StateManager.now(),
    };
    this.fs.writeFile(this.statePath, JSON.stringify(updated, null, 2) + "\n");
    this.state = updated;
  }

  public reload(): void {
    this.state = this.load();
  }

  private load(): IloState {
    const stateSource = this.fs.exists(this.statePath)
      ? this.statePath
      : this.fs.exists(this.legacyStatePath)
        ? this.legacyStatePath
        : undefined;

    if (!stateSource) return StateManager.emptyState();

    try {
      const raw = this.fs.readFile(stateSource);
      const parsed: unknown = JSON.parse(raw);
      return StateManager.normalizeState(parsed) ?? StateManager.emptyState();
    } catch {
      return StateManager.emptyState();
    }
  }

  private static isValidState(value: unknown): value is IloState {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
      obj.version === "1.1" &&
      typeof obj.updatedAt === "string" &&
      Array.isArray(obj.changes)
    );
  }

  private static normalizeState(value: unknown): IloState | undefined {
    if (StateManager.isValidState(value)) return value;
    if (typeof value !== "object" || value === null) return undefined;

    const obj = value as Record<string, unknown>;
    if (
      obj.version !== "1.0" ||
      typeof obj.updatedAt !== "string" ||
      !Array.isArray(obj.changes)
    ) {
      return undefined;
    }

    return {
      version: "1.1",
      updatedAt: obj.updatedAt,
      changes: obj.changes.filter(StateManager.isLegacyChangeState).map((change) => ({
        ...change,
        lastTransitionAt: undefined,
        backendSessionId: undefined,
        lastError: undefined,
        planFingerprint: undefined,
      })),
    };
  }

  private static isLegacyChangeState(value: unknown): value is ChangeState {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.name === "string" &&
      typeof obj.status === "string" &&
      typeof obj.artifacts === "object" &&
      obj.artifacts !== null &&
      Array.isArray(obj.completedTasks) &&
      Array.isArray(obj.blockedBy)
    );
  }

  private static emptyState(): IloState {
    return {
      version: "1.1",
      updatedAt: StateManager.now(),
      changes: [],
    };
  }

  public static defaultArtifactState(): ArtifactState {
    return { exists: false, valid: false, lastChecked: "" };
  }

  public static defaultChangeState(name: string): ChangeState {
    const artifacts = {} as Record<ArtifactKind, ArtifactState>;
    for (const kind of ARTIFACT_KINDS) {
      artifacts[kind] = StateManager.defaultArtifactState();
    }
    return {
      name,
      status: "pending",
      artifacts,
      completedTasks: [],
      blockedBy: [],
    };
  }

  private static now(): string {
    return new Date().toISOString();
  }
}
