import { describe, expect, it } from "vitest";
import { JournalManager } from "../journal-manager";
import { MemoryFileSystem } from "./helpers";

describe("JournalManager", () => {
  it("appends ndjson records under the hidden runtime directory", () => {
    const fs = new MemoryFileSystem();
    const journal = new JournalManager(fs, "/project");

    journal.append({ runId: "run-1", event: "phase_started", phase: "scan" });
    journal.append({ runId: "run-1", event: "phase_completed", phase: "scan" });

    const written = fs.getWritten("/project/.sdf/ilo-journal.ndjson");
    expect(written).toBeDefined();

    const lines = written!.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0].seq).toBe(1);
    expect(lines[1].seq).toBe(2);
    expect(lines[0].phase).toBe("scan");
  });

  it("continues sequence numbers and tolerates malformed historical lines", () => {
    const fs = new MemoryFileSystem({
      "/project/.sdf/ilo-journal.ndjson": [
        JSON.stringify({ seq: 2, timestamp: "2026-01-01T00:00:00Z", runId: "run-0", event: "phase_started" }),
        "not-json",
      ].join("\n"),
    });
    const journal = new JournalManager(fs, "/project");

    journal.append({ runId: "run-1", event: "run_completed" });

    const written = fs.getWritten("/project/.sdf/ilo-journal.ndjson");
    const lines = written!.trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]!);
    expect(last.seq).toBe(3);
    expect(last.event).toBe("run_completed");
  });
});
