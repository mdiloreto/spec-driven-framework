import type { GraphEdge, GraphNode, ScanResult, SpecGraph } from "../types/index.js";

export class GraphBuildError extends Error {
  public override readonly name = "GraphBuildError";
}

export function buildGraph(
  scan: ScanResult,
  generatedAt = new Date().toISOString(),
): SpecGraph {
  const nodes = validateNodes(scan.nodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const edge of scan.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new GraphBuildError(`Edge references unknown source node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new GraphBuildError(`Edge references unknown target node: ${edge.to}`);
    }

    const key = `${edge.from}\0${edge.to}\0${edge.kind}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ ...edge });
  }

  return { version: "1.0", generatedAt, nodes, edges };
}

function validateNodes(nodes: ScanResult["nodes"]): GraphNode[] {
  const ids = new Set<string>();
  const paths = new Set<string>();

  return nodes.map((node) => {
    if (ids.has(node.id)) {
      throw new GraphBuildError(`Duplicate graph node id: ${node.id}`);
    }
    if (paths.has(node.path)) {
      throw new GraphBuildError(`Duplicate graph node path: ${node.path}`);
    }
    ids.add(node.id);
    paths.add(node.path);
    return { ...node };
  });
}
