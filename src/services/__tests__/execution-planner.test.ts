import { describe, it, expect } from "vitest";
import { ExecutionPlanner } from "../execution-planner.js";
import { MemoryFileSystem } from "./helpers.js";
import type { SpecGraph } from "../../types/index.js";
import type { IloState } from "../../types/index.js";

function emptyState(): IloState {
  return { version: "1.0", updatedAt: "", changes: [] };
}

function makeGraph(overrides: Partial<SpecGraph> = {}): SpecGraph {
  return { version: "1.0", generatedAt: "", nodes: [], edges: [], ...overrides };
}

describe("ExecutionPlanner", () => {
  describe("parseTasks", () => {
    it("parses checkbox tasks from tasks.md", () => {
      const fs = new MemoryFileSystem({
        "/changes/add-auth/tasks.md": "## 1. Setup\n- [ ] 1.1 Create project structure\n- [x] 1.2 Install dependencies\n## 2. Core\n- [ ] 2.1 Implement auth module",
      });
      const planner = new ExecutionPlanner(fs, makeGraph());
      const tasks = planner.parseTasks("/changes/add-auth");

      expect(tasks).toHaveLength(3);
      expect(tasks[0]).toEqual({ id: "1.1", description: "Create project structure", completed: false });
      expect(tasks[1]).toEqual({ id: "1.2", description: "Install dependencies", completed: true });
      expect(tasks[2]).toEqual({ id: "2.1", description: "Implement auth module", completed: false });
    });

    it("returns empty array when tasks.md does not exist", () => {
      const fs = new MemoryFileSystem();
      const planner = new ExecutionPlanner(fs, makeGraph());
      expect(planner.parseTasks("/nonexistent")).toEqual([]);
    });
  });

  describe("plan", () => {
    it("groups independent changes into the same wave", () => {
      const graph = makeGraph({
        nodes: [
          { id: "add-auth", type: "change", path: "/changes/add-auth" },
          { id: "add-payments", type: "change", path: "/changes/add-payments" },
        ],
      });
      const fs = new MemoryFileSystem({
        "/changes/add-auth/tasks.md": "## 1. Setup\n- [ ] 1.1 Task A",
        "/changes/add-payments/tasks.md": "## 1. Setup\n- [ ] 1.1 Task B",
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(emptyState());

      expect(plan.waves).toHaveLength(1);
      expect(plan.waves[0]!.changes).toHaveLength(2);
    });

    it("orders dependent changes into sequential waves", () => {
      const graph = makeGraph({
        nodes: [
          { id: "foundation", type: "change", path: "/changes/foundation" },
          { id: "feature", type: "change", path: "/changes/feature" },
        ],
        edges: [{ from: "feature", to: "foundation", kind: "depends_on" }],
      });
      const fs = new MemoryFileSystem({
        "/changes/foundation/tasks.md": "## 1. Setup\n- [ ] 1.1 Foundation task",
        "/changes/feature/tasks.md": "## 1. Setup\n- [ ] 1.1 Feature task",
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(emptyState());

      expect(plan.waves).toHaveLength(2);
      expect(plan.waves[0]!.changes[0]!.name).toBe("foundation");
      expect(plan.waves[1]!.changes[0]!.name).toBe("feature");
    });

    it("produces diamond pattern waves: A → B,C → D", () => {
      const graph = makeGraph({
        nodes: [
          { id: "A", type: "change", path: "/changes/A" },
          { id: "B", type: "change", path: "/changes/B" },
          { id: "C", type: "change", path: "/changes/C" },
          { id: "D", type: "change", path: "/changes/D" },
        ],
        edges: [
          { from: "B", to: "A", kind: "depends_on" },
          { from: "C", to: "A", kind: "depends_on" },
          { from: "D", to: "B", kind: "depends_on" },
          { from: "D", to: "C", kind: "depends_on" },
        ],
      });
      const fs = new MemoryFileSystem({
        "/changes/A/tasks.md": "## 1.\n- [ ] 1.1 A",
        "/changes/B/tasks.md": "## 1.\n- [ ] 1.1 B",
        "/changes/C/tasks.md": "## 1.\n- [ ] 1.1 C",
        "/changes/D/tasks.md": "## 1.\n- [ ] 1.1 D",
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(emptyState());

      expect(plan.waves).toHaveLength(3);
      expect(plan.waves[0]!.changes.map((c) => c.name)).toEqual(["A"]);
      expect(plan.waves[1]!.changes.map((c) => c.name).sort()).toEqual(["B", "C"]);
      expect(plan.waves[2]!.changes.map((c) => c.name)).toEqual(["D"]);
    });

    it("detects cycles and reports blocked changes", () => {
      const graph = makeGraph({
        nodes: [
          { id: "X", type: "change", path: "/changes/X" },
          { id: "Y", type: "change", path: "/changes/Y" },
        ],
        edges: [
          { from: "X", to: "Y", kind: "depends_on" },
          { from: "Y", to: "X", kind: "depends_on" },
        ],
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(emptyState());

      expect(plan.waves).toHaveLength(0);
      expect(plan.blockedChanges).toHaveLength(2);
    });

    it("marks tasks completed from state", () => {
      const graph = makeGraph({
        nodes: [{ id: "test", type: "change", path: "/changes/test" }],
      });
      const fs = new MemoryFileSystem({
        "/changes/test/tasks.md": "## 1.\n- [ ] 1.1 First\n- [ ] 1.2 Second",
      });
      const state: IloState = {
        version: "1.0",
        updatedAt: "",
        changes: [{
          name: "test",
          status: "in-progress",
          artifacts: {
            proposal: { exists: true, valid: true, lastChecked: "" },
            design: { exists: true, valid: true, lastChecked: "" },
            specs: { exists: true, valid: true, lastChecked: "" },
            tasks: { exists: true, valid: true, lastChecked: "" },
          },
          completedTasks: ["1.1"],
          blockedBy: [],
        }],
      };

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(state);

      const tasks = plan.waves[0]!.changes[0]!.tasks;
      expect(tasks[0]!.completed).toBe(true);
      expect(tasks[1]!.completed).toBe(false);
    });
  });
});

// Shared fs instance for cycle test
const fs = new MemoryFileSystem();
