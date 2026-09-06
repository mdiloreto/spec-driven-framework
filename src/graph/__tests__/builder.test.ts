import { describe, expect, it } from "vitest";
import { buildGraph, GraphBuildError } from "../builder";
import { createGraphId } from "../../types/index";
import type { ScanResult } from "../../types/index";

function scan(): ScanResult {
  return {
    nodes: [
      {
        id: createGraphId("change", "payment"),
        slug: "payment",
        type: "change",
        path: "openspec/changes/payment",
      },
      {
        id: createGraphId("capability", "auth"),
        slug: "auth",
        type: "capability",
        path: "openspec/specs/auth",
      },
    ],
    edges: [{
      from: createGraphId("change", "payment"),
      to: createGraphId("capability", "auth"),
      kind: "depends_on",
    }],
    warnings: [],
  };
}

describe("graph builder", () => {
  it("builds a versioned graph and deduplicates equivalent edges", () => {
    const input = scan();
    input.edges.push({ ...input.edges[0]!, reason: "duplicate source" });

    const graph = buildGraph(input, "2026-07-23T00:00:00.000Z");

    expect(graph.version).toBe("1.0");
    expect(graph.generatedAt).toBe("2026-07-23T00:00:00.000Z");
    expect(graph.edges).toHaveLength(1);
  });

  it("rejects duplicate node ids", () => {
    const input = scan();
    input.nodes.push({ ...input.nodes[0]!, path: "other" });
    expect(() => buildGraph(input)).toThrowError(GraphBuildError);
  });

  it("rejects edges to unknown nodes", () => {
    const input = scan();
    input.edges[0]!.to = createGraphId("capability", "missing");
    expect(() => buildGraph(input)).toThrow("unknown target node");
  });

  it("supports an empty graph", () => {
    const graph = buildGraph({ nodes: [], edges: [], warnings: [] });
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("supports a single-node graph", () => {
    const input = scan();
    input.nodes = [input.nodes[0]!];
    input.edges = [];
    expect(buildGraph(input).nodes).toEqual([input.nodes[0]]);
  });
});
