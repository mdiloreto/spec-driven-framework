import { describe, expect, it } from "vitest";
import {
  computeImpact,
  collectChangeDependencies,
  detectCycles,
  GraphCycleError,
  groupWaves,
  topologicalSort,
} from "../analysis.js";
import { createGraphId } from "../../types/index.js";
import type { GraphEdge, GraphNode, SpecGraph } from "../../types/index.js";

function node(slug: string): GraphNode {
  return {
    id: createGraphId("change", slug),
    slug,
    type: "change",
    path: `openspec/changes/${slug}`,
  };
}

function edge(from: string, to: string): GraphEdge {
  return {
    from: createGraphId("change", from),
    to: createGraphId("change", to),
    kind: "depends_on",
  };
}

function graph(nodes: string[], edges: GraphEdge[]): SpecGraph {
  return {
    version: "1.0",
    generatedAt: "2026-07-23T00:00:00.000Z",
    nodes: nodes.map(node),
    edges,
  };
}

describe("graph analysis with Graphology", () => {
  it("groups a diamond dependency graph into deterministic waves", () => {
    const value = graph(
      ["D", "C", "B", "A"],
      [edge("B", "A"), edge("C", "A"), edge("D", "B"), edge("D", "C")],
    );

    expect(groupWaves(value).map((wave) => wave.map((item) => item.slug))).toEqual([
      ["A"],
      ["B", "C"],
      ["D"],
    ]);
    expect(topologicalSort(value).map((item) => item.slug)).toEqual(["A", "B", "C", "D"]);
  });

  it("reports only nodes that are actually in a cycle", () => {
    const value = graph(
      ["A", "B", "C"],
      [edge("A", "B"), edge("B", "A"), edge("C", "A")],
    );

    expect(detectCycles(value)).toEqual([
      createGraphId("change", "A"),
      createGraphId("change", "B"),
    ]);
    expect(() => groupWaves(value)).toThrowError(GraphCycleError);
  });

  it("detects transitive cycles", () => {
    const value = graph(
      ["A", "B", "C"],
      [edge("A", "B"), edge("B", "C"), edge("C", "A")],
    );
    expect(detectCycles(value)).toEqual([
      createGraphId("change", "A"),
      createGraphId("change", "B"),
      createGraphId("change", "C"),
    ]);
  });

  it("ignores informational edges for cycle detection", () => {
    const value = graph(["A", "B"], [
      edge("A", "B"),
      { ...edge("B", "A"), kind: "impacts" },
    ]);
    expect(detectCycles(value)).toEqual([]);
  });

  it("orders blocks edges from blocker to blocked", () => {
    const value = graph(["A", "B"], [{ ...edge("A", "B"), kind: "blocks" }]);
    expect(groupWaves(value).map((wave) => wave.map((item) => item.slug))).toEqual([
      ["A"],
      ["B"],
    ]);
    expect(computeImpact(value, [createGraphId("change", "B")]).upstreamContext).toEqual([
      createGraphId("change", "A"),
    ]);
    expect(computeImpact(value, [createGraphId("change", "A")]).downstreamAffected).toEqual([
      createGraphId("change", "B"),
    ]);
  });

  it("computes transitive upstream and downstream impact", () => {
    const value = graph(["A", "B", "C"], [edge("B", "A"), edge("C", "B")]);

    expect(computeImpact(value, [createGraphId("change", "C")]).upstreamContext).toEqual([
      createGraphId("change", "B"),
      createGraphId("change", "A"),
    ]);
    expect(computeImpact(value, [createGraphId("change", "A")]).downstreamAffected).toEqual([
      createGraphId("change", "B"),
      createGraphId("change", "C"),
    ]);
  });

  it("deduplicates impact from multiple changed nodes", () => {
    const value = graph(
      ["A", "B", "C", "D"],
      [edge("C", "A"), edge("C", "B"), edge("D", "C")],
    );
    const result = computeImpact(value, [
      createGraphId("change", "A"),
      createGraphId("change", "B"),
    ]);
    expect(result.downstreamAffected).toEqual([
      createGraphId("change", "C"),
      createGraphId("change", "D"),
    ]);
  });

  it("collects transitive change dependencies for targeted runs", () => {
    const value = graph(
      ["foundation", "auth", "feature", "other"],
      [edge("auth", "foundation"), edge("feature", "auth")],
    );
    expect([...collectChangeDependencies(value, "feature")]).toEqual([
      "feature",
      "auth",
      "foundation",
    ]);
  });
});
