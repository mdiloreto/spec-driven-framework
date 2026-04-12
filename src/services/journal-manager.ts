import { join } from "node:path";
import type { FileSystem, JournalEntry } from "../types/index";

const RUNTIME_DIR = ".sdf";
const JOURNAL_FILE = "ilo-journal.ndjson";

type JournalWrite = Omit<JournalEntry, "seq" | "timestamp"> & {
  timestamp?: string;
};

export class JournalManager {
  private readonly journalPath: string;
  private nextSeq: number;

  constructor(
    private readonly fs: FileSystem,
    projectRoot: string,
  ) {
    this.journalPath = join(projectRoot, RUNTIME_DIR, JOURNAL_FILE);
    this.nextSeq = this.loadNextSeq();
  }

  public append(entry: JournalWrite): JournalEntry {
    const record: JournalEntry = {
      seq: this.nextSeq,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      runId: entry.runId,
      event: entry.event,
      phase: entry.phase,
      changeName: entry.changeName,
      taskId: entry.taskId,
      backend: entry.backend,
      sessionId: entry.sessionId,
      summary: entry.summary,
      data: entry.data,
    };

    this.nextSeq += 1;

    const existing = this.fs.exists(this.journalPath)
      ? this.fs.readFile(this.journalPath)
      : "";
    const prefix = existing.length > 0 && !existing.endsWith("\n")
      ? `${existing}\n`
      : existing;

    this.fs.writeFile(this.journalPath, `${prefix}${JSON.stringify(record)}\n`);
    return record;
  }

  private loadNextSeq(): number {
    if (!this.fs.exists(this.journalPath)) return 1;

    let maxSeq = 0;
    for (const line of this.fs.readFile(this.journalPath).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof (parsed as { seq?: unknown }).seq === "number"
        ) {
          maxSeq = Math.max(maxSeq, (parsed as { seq: number }).seq);
        }
      } catch {
        // Ignore malformed historical lines. New entries remain append-only.
      }
    }

    return maxSeq + 1;
  }
}
