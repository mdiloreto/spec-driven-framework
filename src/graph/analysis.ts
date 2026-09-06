import { stronglyConnectedComponents } from "graphology-components";
import { topologicalGenerations } from "graphology-dag";
import type { GraphId, GraphNode, ImpactResult, SpecGraph, WaveGroup } from "../types/index";
import { isGraphId } from "../types/index";
import { toDomainGraph, toOrderingGraph } from "./engine";
import type { DomainGraph } from "./engine";

export class GraphCycleError extends Error {
  public override readonly name = "GraphCycleError";

  constructor(public readonly nodeIds: GraphId[]) {
    super(`Graph contains a cycle involving: ${nodeIds.join(", ")}`);
  }
}

export function detectCycles(graph: SpecGraph): GraphId[] {
  const orderingGraph = toOrderingGraph(graph);
  return stronglyConnectedComponents(orderingGraph)
    .filter(
      (component) =>
        component.length > 1 || orderingGraph.hasEdge(component[0]!, component[0]!),
    )
    .flat()
    .map(toGraphId)
    .sort();
}

export function computeImpact(
  graph: SpecGraph,
  changed: GraphId[],
): ImpactResult {
  const domainGraph = toDomainGraph(graph);
  const validChanged = changed.filter((id) => domainGraph.hasNode(id));
  const changedSet = new Set(validChanged);

  const upstreamContext = traverse(validChanged, (current) =>
    upstreamNeighbors(domainGraph, current));
  const downstreamAffected = traverse(validChanged, (current) =>
    downstreamNeighbors(domainGraph, current));

  return {
    changed: validChanged,
    upstreamContext: upstreamContext.filter((id) => !changedSet.has(id)),
    downstreamAffected: downstreamAffected.filter((id) => !changedSet.has(id)),
  };
}

export function topologicalSort(graph: SpecGraph): GraphNode[] {
  return groupWaves(graph).flat();
}

export function groupWaves(graph: SpecGraph): WaveGroup {
  const cycles = detectCycles(graph);
  if (cycles.length > 0) throw new GraphCycleError(cycles);

  const orderingGraph = toOrderingGraph(graph);
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  return topologicalGenerations(orderingGraph).map((generation) =>
    generation
      .map((id) => nodeMap.get(toGraphId(id))!)
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

export function changeSubgraph(graph: SpecGraph): SpecGraph {
  const nodes = graph.nodes.filter((node) => node.type === "change");
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
  };
}

export function collectChangeDependencies(
  graph: SpecGraph,
  targetSlug: string,
): Set<string> {
  const target = graph.nodes.find(
    (node) => node.type === "change" && node.slug === targetSlug,
  );
  if (!target) return new Set([targetSlug]);

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const selected = new Set([target.slug]);
  const queue = [target.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependencyIds = graph.edges.flatMap((edge) => {
      if (edge.kind === "depends_on" && edge.from === current) return [edge.to];
      if (edge.kind === "blocks" && edge.to === current) return [edge.from];
      return [];
    });
    for (const id of dependencyIds) {
      const node = nodeMap.get(id);
      if (!node || node.type !== "change" || selected.has(node.slug)) continue;
      selected.add(node.slug);
      queue.push(node.id);
    }
  }
  return selected;
}

function traverse(
  roots: GraphId[],
  adjacent: (id: GraphId) => GraphId[],
): GraphId[] {
  const visited = new Set<GraphId>();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacent(current)) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return [...visited];
}

function toGraphId(value: string): GraphId {
  if (!isGraphId(value)) throw new Error(`Graphology returned invalid node id: ${value}`);
  return value;
}

function upstreamNeighbors(graph: DomainGraph, current: GraphId): GraphId[] {
  const dependencies = graph.outEdges(current)
    .filter((edge) => {
      const kind = graph.getEdgeAttribute(edge, "kind");
      return kind === "depends_on" || kind === "extends";
    })
    .map((edge) => toGraphId(graph.target(edge)));
  const blockers = graph.inEdges(current)
    .filter((edge) => graph.getEdgeAttribute(edge, "kind") === "blocks")
    .map((edge) => toGraphId(graph.source(edge)));
  return [...dependencies, ...blockers];
}

function downstreamNeighbors(graph: DomainGraph, current: GraphId): GraphId[] {
  const dependents = graph.inEdges(current)
    .filter((edge) => {
      const kind = graph.getEdgeAttribute(edge, "kind");
      return kind === "depends_on" || kind === "extends" || kind === "impacts";
    })
    .map((edge) => toGraphId(graph.source(edge)));
  const blocked = graph.outEdges(current)
    .filter((edge) => graph.getEdgeAttribute(edge, "kind") === "blocks")
    .map((edge) => toGraphId(graph.target(edge)));
  return [...dependents, ...blocked];
}
