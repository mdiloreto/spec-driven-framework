import { describe, it, expect } from "vitest";
import { ExecutionPlanner } from "../execution-planner.js";
import { MemoryFileSystem } from "./helpers.js";
import type { SpecGraph } from "../../types/index.js";
import type { IloState } from "../../types/index.js";
import { createGraphId } from "../../types/index.js";

function stateFor(...slugs: string[]): IloState {
  return {
    version: "1.0",
    updatedAt: "",
    changes: slugs.map((name) => ({
      name,
      status: "ready",
      artifacts: {
        proposal: { exists: true, valid: true, lastChecked: "" },
        design: { exists: true, valid: true, lastChecked: "" },
        specs: { exists: true, valid: true, lastChecked: "" },
        tasks: { exists: true, valid: true, lastChecked: "" },
      },
      completedTasks: [],
      blockedBy: [],
    })),
  };
}

function makeGraph(overrides: Partial<SpecGraph> = {}): SpecGraph {
  return { version: "1.0", generatedAt: "", nodes: [], edges: [], ...overrides };
}

function changeNode(slug: string, path = `/changes/${slug}`) {
  return { id: createGraphId("change", slug), slug, type: "change" as const, path };
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
          changeNode("add-auth"),
          changeNode("add-payments"),
        ],
      });
      const fs = new MemoryFileSystem({
        "/changes/add-auth/tasks.md": "## 1. Setup\n- [ ] 1.1 Task A",
        "/changes/add-payments/tasks.md": "## 1. Setup\n- [ ] 1.1 Task B",
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(stateFor("add-auth", "add-payments"));

      expect(plan.waves).toHaveLength(1);
      expect(plan.waves[0]!.changes).toHaveLength(2);
    });

    it("orders dependent changes into sequential waves", () => {
      const graph = makeGraph({
        nodes: [
          changeNode("foundation"),
          changeNode("feature"),
        ],
        edges: [{
          from: createGraphId("change", "feature"),
          to: createGraphId("change", "foundation"),
          kind: "depends_on",
        }],
      });
      const fs = new MemoryFileSystem({
        "/changes/foundation/tasks.md": "## 1. Setup\n- [ ] 1.1 Foundation task",
        "/changes/feature/tasks.md": "## 1. Setup\n- [ ] 1.1 Feature task",
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(stateFor("foundation", "feature"));

      expect(plan.waves).toHaveLength(2);
      expect(plan.waves[0]!.changes[0]!.name).toBe("foundation");
      expect(plan.waves[1]!.changes[0]!.name).toBe("feature");
    });

    it("produces diamond pattern waves: A → B,C → D", () => {
      const graph = makeGraph({
        nodes: [
          changeNode("A"),
          changeNode("B"),
          changeNode("C"),
          changeNode("D"),
        ],
        edges: [
          { from: createGraphId("change", "B"), to: createGraphId("change", "A"), kind: "depends_on" },
          { from: createGraphId("change", "C"), to: createGraphId("change", "A"), kind: "depends_on" },
          { from: createGraphId("change", "D"), to: createGraphId("change", "B"), kind: "depends_on" },
          { from: createGraphId("change", "D"), to: createGraphId("change", "C"), kind: "depends_on" },
        ],
      });
      const fs = new MemoryFileSystem({
        "/changes/A/tasks.md": "## 1.\n- [ ] 1.1 A",
        "/changes/B/tasks.md": "## 1.\n- [ ] 1.1 B",
        "/changes/C/tasks.md": "## 1.\n- [ ] 1.1 C",
        "/changes/D/tasks.md": "## 1.\n- [ ] 1.1 D",
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(stateFor("A", "B", "C", "D"));

      expect(plan.waves).toHaveLength(3);
      expect(plan.waves[0]!.changes.map((c) => c.name)).toEqual(["A"]);
      expect(plan.waves[1]!.changes.map((c) => c.name).sort()).toEqual(["B", "C"]);
      expect(plan.waves[2]!.changes.map((c) => c.name)).toEqual(["D"]);
    });

    it("detects cycles and reports blocked changes", () => {
      const graph = makeGraph({
        nodes: [
          changeNode("X"),
          changeNode("Y"),
        ],
        edges: [
          { from: createGraphId("change", "X"), to: createGraphId("change", "Y"), kind: "depends_on" },
          { from: createGraphId("change", "Y"), to: createGraphId("change", "X"), kind: "depends_on" },
        ],
      });

      const planner = new ExecutionPlanner(fs, graph);
      const plan = planner.plan(stateFor("X", "Y"));

      expect(plan.waves).toHaveLength(0);
      expect(plan.blockedChanges).toHaveLength(2);
    });

    it("marks tasks completed from state", () => {
      const graph = makeGraph({
        nodes: [changeNode("test")],
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

  it("plans only ready target changes", () => {
    const graph = makeGraph({
      nodes: [changeNode("ready"), changeNode("complete"), changeNode("other")],
    });
    const fs = new MemoryFileSystem({
      "/changes/ready/tasks.md": "## 1.\n- [ ] 1.1 Ready",
      "/changes/complete/tasks.md": "## 1.\n- [ ] 1.1 Complete",
      "/changes/other/tasks.md": "## 1.\n- [ ] 1.1 Other",
    });
    const state = stateFor("ready", "complete", "other");
    state.changes[1]!.status = "complete";

    const plan = new ExecutionPlanner(fs, graph, "/").plan(state, "ready");
    expect(plan.waves.flatMap((wave) => wave.changes.map((change) => change.name))).toEqual([
      "ready",
    ]);
  });

  it("includes unfinished upstream dependencies for a target", () => {
    const graph = makeGraph({
      nodes: [changeNode("foundation"), changeNode("feature")],
      edges: [{
        from: createGraphId("change", "feature"),
        to: createGraphId("change", "foundation"),
        kind: "depends_on",
      }],
    });
    const fs = new MemoryFileSystem({
      "/changes/foundation/tasks.md": "## 1.\n- [ ] 1.1 Foundation",
      "/changes/feature/tasks.md": "## 1.\n- [ ] 1.1 Feature",
    });
    const planner = new ExecutionPlanner(fs, graph, "/");

    expect(planner.plan(stateFor("foundation", "feature"), "feature").waves
      .map((wave) => wave.changes.map((change) => change.name))).toEqual([
      ["foundation"],
      ["feature"],
    ]);

    const state = stateFor("foundation", "feature");
    state.changes[0]!.status = "complete";
    expect(planner.plan(state, "feature").waves
      .flatMap((wave) => wave.changes.map((change) => change.name))).toEqual(["feature"]);
  });

  it("reports persisted blocked changes", () => {
    const graph = makeGraph({ nodes: [changeNode("feature")] });
    const state = stateFor("feature");
    state.changes[0]!.status = "blocked";
    state.changes[0]!.blockedBy = ["foundation"];

    const plan = new ExecutionPlanner(new MemoryFileSystem(), graph).plan(state);
    expect(plan.waves).toEqual([]);
    expect(plan.blockedChanges).toEqual([{
      name: "feature",
      blockedBy: ["foundation"],
    }]);
  });

  it("blocks a target while an upstream dependency is not ready", () => {
    const graph = makeGraph({
      nodes: [changeNode("foundation"), changeNode("feature")],
      edges: [{
        from: createGraphId("change", "feature"),
        to: createGraphId("change", "foundation"),
        kind: "depends_on",
      }],
    });
    const state = stateFor("foundation", "feature");
    state.changes[0]!.status = "checking";

    const plan = new ExecutionPlanner(new MemoryFileSystem(), graph).plan(state, "feature");
    expect(plan.waves).toEqual([]);
    expect(plan.blockedChanges.map((change) => change.name).sort()).toEqual([
      "feature",
      "foundation",
    ]);
  });

  it("continues independent work and blocks dependents of a cycle", () => {
    const graph = makeGraph({
      nodes: [changeNode("A"), changeNode("B"), changeNode("C"), changeNode("D")],
      edges: [
        { from: createGraphId("change", "A"), to: createGraphId("change", "B"), kind: "depends_on" },
        { from: createGraphId("change", "B"), to: createGraphId("change", "A"), kind: "depends_on" },
        { from: createGraphId("change", "C"), to: createGraphId("change", "A"), kind: "depends_on" },
      ],
    });
    const fs = new MemoryFileSystem({
      "/changes/D/tasks.md": "## 1.\n- [ ] 1.1 Independent",
    });
    const plan = new ExecutionPlanner(fs, graph, "/").plan(stateFor("A", "B", "C", "D"));

    expect(plan.waves.flatMap((wave) => wave.changes.map((change) => change.name))).toEqual(["D"]);
    expect(plan.blockedChanges.map((change) => change.name).sort()).toEqual(["A", "B", "C"]);
  });
});

// Shared fs instance for cycle test
const fs = new MemoryFileSystem();
