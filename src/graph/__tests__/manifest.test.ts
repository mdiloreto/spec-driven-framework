import { describe, expect, it } from "vitest";
import {
  GraphManifestError,
  isManifestStale,
  readManifest,
  writeManifest,
} from "../manifest";
import { createGraphId } from "../../types/index";
import type { SpecGraph } from "../../types/index";
import { MemoryFileSystem } from "../../services/__tests__/helpers";

function graph(): SpecGraph {
  return {
    version: "1.0",
    generatedAt: "2026-07-23T00:00:00.000Z",
    nodes: [{
      id: createGraphId("capability", "auth"),
      slug: "auth",
      type: "capability",
      path: "openspec/specs/auth",
    }],
    edges: [],
  };
}

describe("graph manifest", () => {
  it("writes and reads the public manifest format", () => {
    const files = new MemoryFileSystem();
    writeManifest(files, "/project", graph());
    expect(readManifest(files, "/project")).toEqual(graph());
  });

  it("rejects ids that do not match node type and slug", () => {
    const value = graph();
    value.nodes[0]!.slug = "other";
    const files = new MemoryFileSystem({
      "/project/spec-graph.json": JSON.stringify(value),
    });
    expect(() => readManifest(files, "/project")).toThrowError(GraphManifestError);
  });

  it("rejects non-ISO timestamps and incomplete change nodes", () => {
    const invalidTimestamp = { ...graph(), generatedAt: "July 23, 2026" };
    const files = new MemoryFileSystem({
      "/project/spec-graph.json": JSON.stringify(invalidTimestamp),
    });
    expect(() => readManifest(files, "/project")).toThrow("ISO timestamp");

    files.writeFile(
      "/project/spec-graph.json",
      JSON.stringify({ ...graph(), generatedAt: "2026-02-30T20:00:00Z" }),
    );
    expect(() => readManifest(files, "/project")).toThrow("ISO timestamp");

    const incompleteChange = graph();
    incompleteChange.nodes = [{
      id: createGraphId("change", "auth"),
      slug: "auth",
      type: "change",
      path: "openspec/changes/auth",
    }];
    files.writeFile("/project/spec-graph.json", JSON.stringify(incompleteChange));
    expect(() => readManifest(files, "/project")).toThrow("requires status and artifacts");
  });

  it("accepts ISO timestamps without milliseconds and with offsets", () => {
    for (const generatedAt of ["2026-07-23T20:00:00Z", "2026-07-23T20:00:00+00:00"]) {
      const value = { ...graph(), generatedAt };
      const files = new MemoryFileSystem({
        "/project/spec-graph.json": JSON.stringify(value),
      });
      expect(readManifest(files, "/project").generatedAt).toBe(generatedAt);
    }
  });

  it("rejects duplicate edges", () => {
    const value = graph();
    value.nodes.push({
      id: createGraphId("capability", "payments"),
      slug: "payments",
      type: "capability",
      path: "openspec/specs/payments",
    });
    const edge = {
      from: createGraphId("capability", "payments"),
      to: createGraphId("capability", "auth"),
      kind: "depends_on" as const,
    };
    value.edges = [edge, edge];
    const files = new MemoryFileSystem({
      "/project/spec-graph.json": JSON.stringify(value),
    });
    expect(() => readManifest(files, "/project")).toThrow("Duplicate graph edge");
  });

  it("detects source files newer than the manifest", () => {
    const files = new MemoryFileSystem({
      "/project/spec-graph.json": JSON.stringify(graph()),
      "/project/openspec/specs/auth/spec.md": "# Auth",
    });
    files.setModifiedTime("/project/spec-graph.json", 10);
    files.setModifiedTime("/project/openspec/specs/auth/spec.md", 20);
    expect(isManifestStale(files, "/project")).toBe(true);
  });

  it("treats a missing OpenSpec directory as stale", () => {
    const files = new MemoryFileSystem({
      "/project/spec-graph.json": JSON.stringify(graph()),
    });
    expect(isManifestStale(files, "/project")).toBe(true);
  });
});
