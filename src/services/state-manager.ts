import { join } from "node:path";
import type {
  FileSystem,
  ArtifactKind,
  IloState,
  ChangeState,
  ArtifactState,
  OpenSpecChangeListItem,
} from "../types/index.js";

const STATE_FILE = "ilo-state.json";
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
  private state: IloState;

  constructor(
    private readonly fs: FileSystem,
    private readonly projectRoot: string,
  ) {
    this.statePath = join(this.projectRoot, STATE_FILE);
    this.state = this.load();
  }

  public get current(): Readonly<IloState> {
    return this.state;
  }

  public getChange(name: string): ChangeState | undefined {
    return this.state.changes.find((c) => c.name === name);
  }

  public updateChange(name: string, update: Partial<ChangeState>): void {
    this.state = {
      ...this.state,
      changes: this.state.changes.map((c) =>
        c.name === name ? { ...c, ...update } : c,
      ),
      updatedAt: new Date().toISOString(),
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
      updatedAt: new Date().toISOString(),
    };
  }

  public save(): void {
    const updated: IloState = {
      ...this.state,
      updatedAt: new Date().toISOString(),
    };
    this.fs.writeFile(this.statePath, JSON.stringify(updated, null, 2) + "\n");
    this.state = updated;
  }

  public reload(): void {
    this.state = this.load();
  }

  private load(): IloState {
    if (!this.fs.exists(this.statePath)) {
      return StateManager.emptyState();
    }
    const raw = this.fs.readFile(this.statePath);
    const parsed: unknown = JSON.parse(raw);

    if (!StateManager.isValidState(parsed)) {
      // Corrupted or incompatible state — start fresh
      return StateManager.emptyState();
    }

    return parsed;
  }

  private static isValidState(value: unknown): value is IloState {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
      obj.version === "1.0" &&
      typeof obj.updatedAt === "string" &&
      Array.isArray(obj.changes)
    );
  }

  private static emptyState(): IloState {
    return {
      version: "1.0",
      updatedAt: new Date().toISOString(),
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
}
