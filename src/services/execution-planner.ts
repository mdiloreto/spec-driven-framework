import { join, resolve } from "node:path";
import type {
  FileSystem,
  ExecutionPlan,
  ExecutionWave,
  WaveChange,
  BlockedChange,
  TaskItem,
  IloState,
  SpecGraph,
  GraphNode,
  GraphId,
} from "../types/index";
import {
  changeSubgraph,
  collectChangeDependencies,
  detectCycles,
  groupWaves,
} from "../graph/index";

/**
 * Produces an ordered execution plan by combining spec-graph topological order
 * with per-change task parsing from tasks.md.
 *
 * Groups changes into parallel waves based on dependency depth.
 * Within each wave, changes are independent and can execute concurrently.
 */
export class ExecutionPlanner {
  constructor(
    private readonly fs: FileSystem,
    private readonly graph: SpecGraph,
    private readonly projectRoot = process.cwd(),
  ) {}

  public plan(state: IloState, target?: string): ExecutionPlan {
    const relevant = target
      ? collectChangeDependencies(this.graph, target)
      : new Set(state.changes.map((change) => change.name));
    const stateByName = new Map(state.changes.map((change) => [change.name, change]));
    const changeNodes = this.graph.nodes.filter(
      (node) => {
        if (node.type !== "change" || !relevant.has(node.slug)) return false;
        const status = stateByName.get(node.slug)?.status;
        return status !== undefined && status !== "complete";
      },
    );
    const { waves: sortedWaves, blocked } = this.topologicalWaves(changeNodes, state);
    const blockedChanges = this.resolveBlocked(blocked, state);

    const waves: ExecutionWave[] = sortedWaves.map((waveNodes, index) => ({
      waveIndex: index,
      changes: waveNodes.map((node) => this.buildWaveChange(node, state)),
    }));

    return { waves, blockedChanges };
  }

  public parseTasks(changePath: string): TaskItem[] {
    const tasksPath = join(resolve(this.projectRoot, changePath), "tasks.md");
    try {
      const content = this.fs.readFile(tasksPath);
      return TaskParser.parse(content);
    } catch {
      return [];
    }
  }

  // -- Topological sort with Graphology wave grouping --

  private topologicalWaves(
    nodes: GraphNode[],
    state: IloState,
  ): { waves: GraphNode[][]; blocked: GraphNode[] } {
    const subgraph = changeSubgraph({ ...this.graph, nodes });
    const stateBlockedIds = nodes
      .filter((node) => {
        const status = state.changes.find((change) => change.name === node.slug)?.status;
        return status !== "ready" && status !== "in-progress";
      })
      .map((node) => node.id);
    const blockedIds = this.expandBlockedIds(
      subgraph,
      new Set([...detectCycles(subgraph), ...stateBlockedIds]),
    );
    const runnableIds = new Set(
      nodes.filter((node) => !blockedIds.has(node.id)).map((node) => node.id),
    );
    const runnable = {
      ...subgraph,
      nodes: subgraph.nodes.filter((node) => runnableIds.has(node.id)),
      edges: subgraph.edges.filter(
        (edge) => runnableIds.has(edge.from) && runnableIds.has(edge.to),
      ),
    };
    return {
      waves: groupWaves(runnable),
      blocked: nodes.filter((node) => blockedIds.has(node.id)),
    };
  }

  private expandBlockedIds(graph: SpecGraph, blocked: Set<GraphId>): Set<GraphId> {
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of graph.edges) {
        const dependent = edge.kind === "depends_on"
          ? edge.from
          : edge.kind === "blocks"
            ? edge.to
            : undefined;
        const prerequisite = edge.kind === "depends_on"
          ? edge.to
          : edge.kind === "blocks"
            ? edge.from
            : undefined;
        if (dependent && prerequisite && blocked.has(prerequisite) && !blocked.has(dependent)) {
          blocked.add(dependent);
          changed = true;
        }
      }
    }
    return blocked;
  }

  private buildWaveChange(node: GraphNode, state: IloState): WaveChange {
    const tasks = this.parseTasks(node.path);
    const changeState = state.changes.find((c) => c.name === node.slug);

    const completedSet = new Set(changeState?.completedTasks ?? []);
    const markedTasks = tasks.map((t) => ({
      ...t,
      completed: t.completed || completedSet.has(t.id),
    }));

    return { name: node.slug, tasks: markedTasks };
  }

  private resolveBlocked(
    blockedNodes: GraphNode[],
    state: IloState,
  ): BlockedChange[] {
    return blockedNodes.map((node) => {
      const persisted = state.changes.find((change) => change.name === node.slug);
      const blockingEdges = this.graph.edges.filter(
        (edge) =>
          (edge.kind === "depends_on" && edge.from === node.id) ||
          (edge.kind === "blocks" && edge.to === node.id),
      );
      return {
        name: node.slug,
        blockedBy: persisted?.blockedBy.length
          ? persisted.blockedBy
          : blockingEdges.map(
          (edge) => {
            const id = edge.kind === "depends_on" ? edge.to : edge.from;
            return this.graph.nodes.find((node) => node.id === id)?.slug ?? id;
          }),
      };
    });
  }
}

/**
 * Parses tasks.md checkbox format into structured TaskItem objects.
 */
class TaskParser {
  private static readonly CHECKBOX_PATTERN =
    /^- \[([ x])\]\s+(\d+\.\d+)\s+(.+)$/;

  public static parse(content: string): TaskItem[] {
    const items: TaskItem[] = [];

    for (const line of content.split("\n")) {
      const match = TaskParser.CHECKBOX_PATTERN.exec(line);
      if (match) {
        const [, checkmark, id, description] = match;
        items.push({
          id: id!,
          description: description!.trim(),
          completed: checkmark === "x",
        });
      }
    }

    return items;
  }
}
