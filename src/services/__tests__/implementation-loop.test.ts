import { describe, expect, it } from "vitest";
import { ImplementationLoop } from "../implementation-loop";
import type {
  BackendResult,
  BackendSummaryInput,
  BackendOptions,
  BackendSummarizer,
  ILOBackend,
  SpecGraph,
} from "../../types/index";
import { MemoryFileSystem, StubOpenSpecClient } from "./helpers";

function makeChangeFiles(changePath: string): Record<string, string> {
  return {
    [`${changePath}/proposal.md`]: `## Why\nSome problem.\n## What Changes\nSome scope.`,
    [`${changePath}/design.md`]: `## Context\nBackground.\n## Goals / Non-Goals\nGoals.\n## Decisions\n### Decision 1\nDo X.`,
    [`${changePath}/specs/auth.md`]: `### Requirement: User authentication\n#### Scenario: Login\n- WHEN user submits credentials\n- THEN session is created`,
    [`${changePath}/tasks.md`]: `## 1. Setup\n- [ ] 1.1 Create project`,
  };
}

class StubBackend implements ILOBackend {
  public readonly name = "stub-backend";

  public async execute(
    _prompt: string,
    _options?: BackendOptions,
  ): Promise<BackendResult> {
    return {
      success: true,
      output: "Created the project setup and verified the core task path.",
      sessionId: "session-1",
      trace: [{ type: "tool_call", tool: "write_file", target: "src/index.ts" }],
    };
  }

  public async resumeSession(
    _sessionId: string,
    prompt: string,
    options?: BackendOptions,
  ): Promise<BackendResult> {
    return this.execute(prompt, options);
  }
}

class StubSummarizer implements BackendSummarizer {
  public async summarize(_input: BackendSummaryInput): Promise<string> {
    return "Summarized by hook: created project setup and verified the path.";
  }
}

describe("ImplementationLoop", () => {
  it("writes checkpoint, journal, traces, and hook summaries during execution", async () => {
    const changePath = "/project/openspec/changes/add-auth";
    const fs = new MemoryFileSystem(makeChangeFiles(changePath));
    const openspec = new StubOpenSpecClient();
    openspec.listResponse = [{ name: "add-auth", path: changePath }];

    const graph: SpecGraph = {
      version: "1.0",
      generatedAt: "2026-01-01T00:00:00Z",
      nodes: [{ id: "add-auth", type: "change", path: changePath }],
      edges: [],
    };

    const loop = new ImplementationLoop(
      fs,
      "/project",
      openspec,
      () => graph,
      {
        backend: new StubBackend(),
        debugTrace: true,
        summarizer: new StubSummarizer(),
      },
    );

    const result = await loop.run();

    expect(result.executed).toEqual(["add-auth/1.1"]);

    const writtenState = fs.getWritten("/project/.sdf/ilo-state.json");
    expect(writtenState).toBeDefined();
    const parsedState = JSON.parse(writtenState!);
    expect(parsedState.version).toBe("1.1");
    expect(parsedState.activeRunId).toBeUndefined();
    expect(parsedState.currentPhase).toBeUndefined();
    expect(parsedState.changes[0].completedTasks).toEqual(["1.1"]);
    expect(parsedState.changes[0].backendSessionId).toBe("session-1");
    expect(parsedState.changes[0].planFingerprint).toBeTruthy();

    const journal = fs.getWritten("/project/.sdf/ilo-journal.ndjson");
    expect(journal).toBeDefined();
    const records = journal!
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const events = records.map((record) => record.event);
    expect(events).toContain("task_started");
    expect(events).toContain("backend_trace_captured");
    expect(events).toContain("backend_summary");
    expect(events).toContain("run_completed");

    const summaryRecord = records.find((record) => record.event === "backend_summary");
    expect(summaryRecord).toBeDefined();
    expect(summaryRecord!.summary).toContain("Summarized by hook");
    expect(summaryRecord!.data.source).toBe("hook");

    const traceRecord = records.find((record) => record.event === "backend_trace_captured");
    expect(traceRecord).toBeDefined();
    expect(traceRecord!.data.path).toContain("/project/.sdf/traces/");

    const writtenTracePath = traceRecord!.data.path as string;
    const writtenTrace = fs.getWritten(writtenTracePath);
    expect(writtenTrace).toBeDefined();
    const parsedTrace = JSON.parse(writtenTrace!);
    expect(parsedTrace.backend).toBe("stub-backend");
    expect(parsedTrace.trace[0].tool).toBe("write_file");
  });

  it("reconciles persisted progress when the task plan changes", async () => {
    const changePath = "/project/openspec/changes/add-auth";
    const fs = new MemoryFileSystem({
      ...makeChangeFiles(changePath),
      [`${changePath}/tasks.md`]: `## 2. Reshaped\n- [ ] 2.1 Reworked setup`,
      "/project/.sdf/ilo-state.json": JSON.stringify({
        version: "1.1",
        updatedAt: "2026-01-01T00:00:00Z",
        changes: [
          {
            name: "add-auth",
            status: "in-progress",
            artifacts: {
              proposal: { exists: true, valid: true, lastChecked: "" },
              design: { exists: true, valid: true, lastChecked: "" },
              specs: { exists: true, valid: true, lastChecked: "" },
              tasks: { exists: true, valid: true, lastChecked: "" },
            },
            currentTask: "1.2",
            completedTasks: ["1.1", "1.2"],
            blockedBy: [],
            planFingerprint: "old-fingerprint",
          },
        ],
      }),
    });
    const openspec = new StubOpenSpecClient();
    openspec.listResponse = [{ name: "add-auth", path: changePath }];

    const graph: SpecGraph = {
      version: "1.0",
      generatedAt: "2026-01-01T00:00:00Z",
      nodes: [{ id: "add-auth", type: "change", path: changePath }],
      edges: [],
    };

    const loop = new ImplementationLoop(
      fs,
      "/project",
      openspec,
      () => graph,
      {},
    );

    await loop.run();

    const writtenState = JSON.parse(fs.getWritten("/project/.sdf/ilo-state.json")!);
    expect(writtenState.changes[0].completedTasks).toEqual([]);
    expect(writtenState.changes[0].currentTask).toBeUndefined();
    expect(writtenState.changes[0].planFingerprint).not.toBe("old-fingerprint");

    const records = fs
      .getWritten("/project/.sdf/ilo-journal.ndjson")!
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const rebaseRecord = records.find((record) => record.event === "plan_rebased");
    expect(rebaseRecord).toBeDefined();
    expect(rebaseRecord!.data.droppedCompletedTasks).toEqual(["1.1", "1.2"]);
    expect(rebaseRecord!.data.nextCurrentTask).toBeUndefined();
  });

  it("keeps dry-run fully read-only for hidden runtime artifacts", async () => {
    const changePath = "/project/openspec/changes/add-auth";
    const fs = new MemoryFileSystem(makeChangeFiles(changePath));
    const openspec = new StubOpenSpecClient();
    openspec.listResponse = [{ name: "add-auth", path: changePath }];

    const graph: SpecGraph = {
      version: "1.0",
      generatedAt: "2026-01-01T00:00:00Z",
      nodes: [{ id: "add-auth", type: "change", path: changePath }],
      edges: [],
    };

    const loop = new ImplementationLoop(
      fs,
      "/project",
      openspec,
      () => graph,
      { dryRun: true },
    );

    const result = await loop.run();

    expect(result.executed).toEqual([]);
    expect(fs.getWritten("/project/.sdf/ilo-state.json")).toBeUndefined();
    expect(fs.getWritten("/project/.sdf/ilo-journal.ndjson")).toBeUndefined();
  });
});
