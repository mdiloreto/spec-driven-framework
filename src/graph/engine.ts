import { DirectedGraph, MultiDirectedGraph } from "graphology";
import type { GraphEdge, GraphNode, SpecGraph } from "../types/index.js";

export type OrderingGraph = DirectedGraph<GraphNode, Record<string, never>>;
export type DomainGraph = MultiDirectedGraph<GraphNode, GraphEdge>;

export function toOrderingGraph(graph: SpecGraph): OrderingGraph {
  const result = new DirectedGraph<GraphNode, Record<string, never>>({
    allowSelfLoops: true,
  });

  for (const node of [...graph.nodes].sort(compareNodes)) {
    result.addNode(node.id, node);
  }

  for (const edge of graph.edges.filter(isOrderingEdge).sort(compareEdges)) {
    // depends_on points dependent -> prerequisite; blocks points
    // prerequisite -> dependent. Graphology always expects the latter.
    const prerequisite = edge.kind === "depends_on" ? edge.to : edge.from;
    const dependent = edge.kind === "depends_on" ? edge.from : edge.to;
    result.mergeDirectedEdge(prerequisite, dependent, {});
  }

  return result;
}

export function toDomainGraph(graph: SpecGraph): DomainGraph {
  const result = new MultiDirectedGraph<GraphNode, GraphEdge>({
    allowSelfLoops: true,
  });

  for (const node of [...graph.nodes].sort(compareNodes)) {
    result.addNode(node.id, node);
  }

  for (const edge of [...graph.edges].sort(compareEdges)) {
    result.addDirectedEdgeWithKey(edgeKey(edge), edge.from, edge.to, edge);
  }

  return result;
}

function isOrderingEdge(edge: GraphEdge): boolean {
  return edge.kind === "depends_on" || edge.kind === "blocks";
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.from}\0${edge.to}\0${edge.kind}`;
}

function compareNodes(a: GraphNode, b: GraphNode): number {
  return a.id.localeCompare(b.id);
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return edgeKey(a).localeCompare(edgeKey(b));
}
