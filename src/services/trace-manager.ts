import { join } from "node:path";
import type { FileSystem } from "../types/index";

const RUNTIME_DIR = ".sdf";
const TRACE_DIR = "traces";

export interface TraceRecord {
  capturedAt: string;
  runId: string;
  changeName: string;
  taskId: string;
  backend: string;
  sessionId?: string;
  success: boolean;
  error?: string;
  prompt: string;
  output: string;
  trace?: unknown;
}

export class TraceManager {
  constructor(
    private readonly fs: FileSystem,
    private readonly projectRoot: string,
  ) {}

  public write(record: TraceRecord): string {
    const tracePath = join(
      this.projectRoot,
      RUNTIME_DIR,
      TRACE_DIR,
      this.sanitize(record.runId),
      this.sanitize(record.changeName),
      `${this.sanitize(record.taskId)}.json`,
    );

    this.fs.writeFile(tracePath, JSON.stringify(record, null, 2) + "\n");
    return tracePath;
  }

  private sanitize(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9._-]+/g, "_");
  }
}
