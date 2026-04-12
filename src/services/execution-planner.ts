import { join } from "node:path";
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
} from "../types/index";

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
  ) {}

  public plan(state: IloState): ExecutionPlan {
    const changeNodes = this.graph.nodes.filter((n) => n.type === "change");
    const { waves: sortedWaves, blocked } = this.topologicalWaves(changeNodes);
    const blockedChanges = this.resolveBlocked(blocked);

    const waves: ExecutionWave[] = sortedWaves.map((waveNodes, index) => ({
      waveIndex: index,
      changes: waveNodes.map((node) => this.buildWaveChange(node, state)),
    }));

    return { waves, blockedChanges };
  }

  public parseTasks(changePath: string): TaskItem[] {
    const tasksPath = join(changePath, "tasks.md");
    try {
      const content = this.fs.readFile(tasksPath);
      return TaskParser.parse(content);
    } catch {
      return [];
    }
  }

  // -- Topological sort with wave grouping (Kahn's algorithm) --

  private topologicalWaves(
    nodes: GraphNode[],
  ): { waves: GraphNode[][]; blocked: GraphNode[] } {
    const orderingEdges = this.graph.edges.filter(
      (e) => e.kind === "depends_on" || e.kind === "blocks",
    );

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    const nodeMap = new Map<string, GraphNode>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      dependents.set(node.id, []);
      nodeMap.set(node.id, node);
    }

    for (const edge of orderingEdges) {
      if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) continue;
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
      const deps = dependents.get(edge.to);
      if (deps) deps.push(edge.from);
    }

    const waves: GraphNode[][] = [];
    let currentWave = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
    const processed = new Set<string>();

    while (currentWave.length > 0) {
      waves.push(currentWave);
      const nextWave: GraphNode[] = [];

      for (const node of currentWave) {
        processed.add(node.id);
        const deps = dependents.get(node.id) ?? [];
        for (const depId of deps) {
          const newDegree = (inDegree.get(depId) ?? 1) - 1;
          inDegree.set(depId, newDegree);
          if (newDegree === 0) {
            const depNode = nodeMap.get(depId);
            if (depNode) nextWave.push(depNode);
          }
        }
      }

      currentWave = nextWave;
    }

    const blocked = nodes.filter((n) => !processed.has(n.id));
    return { waves, blocked };
  }

  private buildWaveChange(node: GraphNode, state: IloState): WaveChange {
    const tasks = this.parseTasks(node.path);
    const changeState = state.changes.find((c) => c.name === node.id);

    const completedSet = new Set(changeState?.completedTasks ?? []);
    const markedTasks = tasks.map((t) => ({
      ...t,
      completed: t.completed || completedSet.has(t.id),
    }));

    return { name: node.id, tasks: markedTasks };
  }

  private resolveBlocked(blockedNodes: GraphNode[]): BlockedChange[] {
    return blockedNodes.map((node) => {
      const blockingEdges = this.graph.edges.filter(
        (e) =>
          e.from === node.id &&
          (e.kind === "depends_on" || e.kind === "blocks"),
      );
      return {
        name: node.id,
        blockedBy: blockingEdges.map((e) => e.to),
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
