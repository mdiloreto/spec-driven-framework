import type { ArtifactKind } from "./index";

// -- ILO State --

export type LoopPhase =
  | "scan"
  | "check"
  | "review"
  | "generate"
  | "plan"
  | "execute";

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
  backendSessionId?: string;
  lastError?: string;
  lastTransitionAt?: string;
  planFingerprint?: string;
}

export interface IloState {
  version: "1.1";
  activeRunId?: string;
  currentPhase?: LoopPhase;
  lastTransitionAt?: string;
  updatedAt: string;
  changes: ChangeState[];
}

export type JournalEventType =
  | "phase_started"
  | "phase_completed"
  | "generation_requested"
  | "execution_plan_built"
  | "plan_rebased"
  | "task_started"
  | "backend_invoked"
  | "backend_completed"
  | "backend_summary"
  | "backend_trace_captured"
  | "task_completed"
  | "task_failed"
  | "run_completed";

export interface JournalEntry {
  seq: number;
  timestamp: string;
  runId: string;
  event: JournalEventType;
  phase?: LoopPhase;
  changeName?: string;
  taskId?: string;
  backend?: string;
  sessionId?: string;
  summary?: string;
  data?: unknown;
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
  debugTrace?: boolean;
  format?: "json" | "markdown";
  maxTokens?: number;
  backend?: ILOBackend;
  summarizer?: BackendSummarizer;
}

// -- Backend --

export interface BackendSummaryInput {
  backend: string;
  changeName: string;
  taskId: string;
  sessionId?: string;
  prompt: string;
  output: string;
  trace?: unknown;
  success: boolean;
  error?: string;
}

export interface BackendSummaryResult {
  summary: string;
  provider?: string;
}

export interface BackendSummarizer {
  summarize(
    input: BackendSummaryInput,
  ): Promise<string | BackendSummaryResult | undefined>;
}

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
  trace?: unknown;
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
