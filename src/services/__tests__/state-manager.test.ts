import { describe, it, expect } from "vitest";
import { StateManager } from "../state-manager";
import { MemoryFileSystem } from "./helpers";

describe("StateManager", () => {
  it("initializes empty state when no file exists", () => {
    const fs = new MemoryFileSystem();
    const manager = new StateManager(fs, "/project");

    expect(manager.current.version).toBe("1.1");
    expect(manager.current.changes).toEqual([]);
  });

  it("loads existing state from the hidden runtime directory", () => {
    const existing = {
      version: "1.1" as const,
      activeRunId: "run-123",
      currentPhase: "check" as const,
      lastTransitionAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      changes: [
        {
          name: "add-auth",
          status: "ready" as const,
          artifacts: {
            proposal: { exists: true, valid: true, lastChecked: "" },
            design: { exists: true, valid: true, lastChecked: "" },
            specs: { exists: true, valid: true, lastChecked: "" },
            tasks: { exists: true, valid: true, lastChecked: "" },
          },
          completedTasks: ["1.1"],
          blockedBy: [],
          planFingerprint: "abc123",
        },
      ],
    };

    const fs = new MemoryFileSystem({
      "/project/.sdf/ilo-state.json": JSON.stringify(existing),
    });
    const manager = new StateManager(fs, "/project");

    expect(manager.current.changes).toHaveLength(1);
    expect(manager.current.changes[0]!.name).toBe("add-auth");
    expect(manager.current.changes[0]!.completedTasks).toEqual(["1.1"]);
    expect(manager.current.activeRunId).toBe("run-123");
  });

  it("migrates legacy root state into the new schema", () => {
    const fs = new MemoryFileSystem({
      "/project/ilo-state.json": JSON.stringify({
        version: "1.0",
        updatedAt: "2026-01-01T00:00:00Z",
        changes: [
          {
            name: "add-auth",
            status: "ready",
            artifacts: {
              proposal: { exists: true, valid: true, lastChecked: "" },
              design: { exists: true, valid: true, lastChecked: "" },
              specs: { exists: true, valid: true, lastChecked: "" },
              tasks: { exists: true, valid: true, lastChecked: "" },
            },
            completedTasks: ["1.1"],
            blockedBy: [],
          },
        ],
      }),
    });

    const manager = new StateManager(fs, "/project");

    expect(manager.current.version).toBe("1.1");
    expect(manager.current.changes[0]!.completedTasks).toEqual(["1.1"]);
  });

  it("merges new changes while preserving existing progress", () => {
    const fs = new MemoryFileSystem();
    const manager = new StateManager(fs, "/project");

    manager.mergeChanges([{ name: "add-auth", path: "/changes/add-auth" }]);
    manager.updateChange("add-auth", {
      status: "in-progress",
      completedTasks: ["1.1", "1.2"],
    });

    manager.mergeChanges([
      { name: "add-auth", path: "/changes/add-auth" },
      { name: "add-payments", path: "/changes/add-payments" },
    ]);

    expect(manager.current.changes).toHaveLength(2);
    expect(manager.getChange("add-auth")?.completedTasks).toEqual(["1.1", "1.2"]);
    expect(manager.getChange("add-payments")?.status).toBe("pending");
  });

  it("removes changes no longer present in OpenSpec", () => {
    const fs = new MemoryFileSystem();
    const manager = new StateManager(fs, "/project");

    manager.mergeChanges([
      { name: "old-change", path: "/changes/old-change" },
      { name: "keep-change", path: "/changes/keep-change" },
    ]);

    manager.mergeChanges([{ name: "keep-change", path: "/changes/keep-change" }]);

    expect(manager.current.changes).toHaveLength(1);
    expect(manager.current.changes[0]!.name).toBe("keep-change");
  });

  it("saves state to file", () => {
    const fs = new MemoryFileSystem();
    const manager = new StateManager(fs, "/project");

    manager.mergeChanges([{ name: "test", path: "/changes/test" }]);
    manager.save();

    const written = fs.getWritten("/project/.sdf/ilo-state.json");
    expect(written).toBeDefined();
    const parsed = JSON.parse(written!);
    expect(parsed.version).toBe("1.1");
    expect(parsed.changes).toHaveLength(1);
  });

  it("updates loop-level runtime state", () => {
    const fs = new MemoryFileSystem();
    const manager = new StateManager(fs, "/project");

    manager.updateLoop({ activeRunId: "run-123", currentPhase: "scan" });

    expect(manager.current.activeRunId).toBe("run-123");
    expect(manager.current.currentPhase).toBe("scan");
  });

  it("updates individual change state", () => {
    const fs = new MemoryFileSystem();
    const manager = new StateManager(fs, "/project");

    manager.mergeChanges([{ name: "test", path: "/changes/test" }]);
    manager.updateChange("test", { status: "checking" });

    expect(manager.getChange("test")?.status).toBe("checking");
  });

  it("falls back to empty state when file is corrupted JSON", () => {
    const fs = new MemoryFileSystem({
      "/project/.sdf/ilo-state.json": "not valid json {{{",
    });

    const manager = new StateManager(fs, "/project");
    expect(manager.current.version).toBe("1.1");
    expect(manager.current.changes).toEqual([]);
  });

  it("falls back to empty state when file has wrong version", () => {
    const fs = new MemoryFileSystem({
      "/project/.sdf/ilo-state.json": JSON.stringify({
        version: "2.0",
        updatedAt: "2026-01-01T00:00:00Z",
        changes: [],
      }),
    });
    const manager = new StateManager(fs, "/project");

    expect(manager.current.version).toBe("1.1");
    expect(manager.current.changes).toEqual([]);
  });

  it("falls back to empty state when file has missing fields", () => {
    const fs = new MemoryFileSystem({
      "/project/.sdf/ilo-state.json": JSON.stringify({ version: "1.1" }),
    });
    const manager = new StateManager(fs, "/project");

    expect(manager.current.version).toBe("1.1");
    expect(manager.current.changes).toEqual([]);
  });
});
