import { describe, expect, it } from "vitest";
import { TraceManager } from "../trace-manager";
import { MemoryFileSystem } from "./helpers";

describe("TraceManager", () => {
  it("writes raw backend traces under the hidden runtime directory", () => {
    const fs = new MemoryFileSystem();
    const traces = new TraceManager(fs, "/project");

    const path = traces.write({
      capturedAt: "2026-01-01T00:00:00Z",
      runId: "run/1",
      changeName: "add-auth",
      taskId: "1.1",
      backend: "stub-backend",
      sessionId: "session-1",
      success: true,
      prompt: "Implement the task",
      output: "Done",
      trace: [{ type: "tool_call", tool: "write_file" }],
    });

    expect(path).toBe("/project/.sdf/traces/run_1/add-auth/1.1.json");
    const written = fs.getWritten(path);
    expect(written).toBeDefined();
    const parsed = JSON.parse(written!);
    expect(parsed.trace[0].tool).toBe("write_file");
  });
});
