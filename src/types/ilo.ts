import type { ArtifactKind } from "./index.js";

// -- ILO State --

export interface ArtifactState {
  exists: boolean;
  valid: boolean;
  lastChecked: string;
  issues?: string[];
}

export type ChangeStatus =
  | "pending"
  | "checking"
  | "generating"
  | "ready"
  | "in-progress"
  | "complete"
  | "blocked";

export interface ChangeState {
  name: string;
  status: ChangeStatus;
  artifacts: Record<ArtifactKind, ArtifactState>;
  currentTask?: string;
  completedTasks: string[];
  blockedBy: string[];
}

export interface IloState {
  version: "1.0";
  updatedAt: string;
  changes: ChangeState[];
}

// -- Context Assembly --

export interface SpecContent {
  id: string;
  path: string;
  content: string;
}

export interface ChangeContent {
  name: string;
  path: string;
  proposal?: string;
  design?: string;
}

export interface ContextBundle {
  task: {
    id: string;
    description: string;
    fromChange: string;
  };
  proposal: string;
  design: string;
  specs: string[];
  upstreamContext: {
    specs: SpecContent[];
    changes: ChangeContent[];
  };
  relatedSpecs: SpecContent[];
  truncated?: boolean;
  omittedSources?: string[];
}

// -- Generation & Execution --

export interface GenerationRequest {
  action: "generate";
  change: string;
  artifact: ArtifactKind;
  context: Record<string, unknown>;
  instruction: string;
}

export interface ExecutionPlan {
  waves: ExecutionWave[];
  blockedChanges: BlockedChange[];
}

export interface ExecutionWave {
  waveIndex: number;
  changes: WaveChange[];
}

export interface WaveChange {
  name: string;
  tasks: TaskItem[];
}

export interface TaskItem {
  id: string;
  description: string;
  completed: boolean;
}

export interface BlockedChange {
  name: string;
  blockedBy: string[];
}

// -- Loop Options --

export interface LoopOptions {
  target?: string;
  dryRun?: boolean;
  format?: "json" | "markdown";
  maxTokens?: number;
  backend?: ILOBackend;
}

// -- Backend --

export interface BackendOptions {
  cwd?: string;
  timeout?: number;
  maxTokens?: number;
}

export interface BackendResult {
  success: boolean;
  output: string;
  sessionId?: string;
  error?: string;
}

export interface ILOBackend {
  readonly name: string;
  execute(prompt: string, options?: BackendOptions): Promise<BackendResult>;
  resumeSession(
    sessionId: string,
    prompt: string,
    options?: BackendOptions,
  ): Promise<BackendResult>;
}

// -- Check Results --

export interface ArtifactCheckResult {
  artifact: ArtifactKind;
  exists: boolean;
  valid: boolean;
  issues: string[];
}

export interface ChangeCheckResult {
  changeName: string;
  status: "complete" | "partial" | "missing";
  artifacts: ArtifactCheckResult[];
}
