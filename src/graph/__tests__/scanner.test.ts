import { describe, expect, it } from "vitest";
import { scanGraph, parseDependencyDeclarations } from "../scanner.js";
import { createGraphId } from "../../types/index.js";
import { MemoryFileSystem, StubOpenSpecClient } from "../../services/__tests__/helpers.js";

describe("graph scanner", () => {
  it("returns an empty result for an empty OpenSpec project", async () => {
    const result = await scanGraph(
      "/project",
      new StubOpenSpecClient(),
      new MemoryFileSystem(),
    );
    expect(result).toEqual({ nodes: [], edges: [], warnings: [] });
  });

  it("discovers nodes through OpenSpec and extracts all relationship sources", async () => {
    const root = "/project";
    const files = new MemoryFileSystem({
      "/project/openspec/specs/user-auth/spec.md": "# Auth",
      "/project/openspec/changes/add-payment/proposal.md": [
        "---",
        "depends-on:",
        "  - capability: user-auth",
        "    kind: depends_on",
        "---",
        "See [auth](../../specs/user-auth/spec.md).",
      ].join("\n"),
      "/project/openspec/changes/add-payment/design.md": "# Design",
      "/project/openspec/changes/add-payment/specs/user-auth/spec.md": "# Delta",
      "/project/openspec/changes/add-payment/tasks.md": "- [ ] 1.1 Build",
    });
    const openspec = new StubOpenSpecClient();
    openspec.listSpecsResponse = [{
      name: "user-auth",
      path: "/project/openspec/specs/user-auth",
    }];
    openspec.listResponse = [{
      name: "add-payment",
      path: "/project/openspec/changes/add-payment",
    }];
    openspec.statusResponses.set("add-payment", {
      changeName: "add-payment",
      schemaName: "sdf-workflow",
      isComplete: false,
      artifacts: [
        { id: "proposal", outputPath: "proposal.md", status: "done" },
        { id: "design", outputPath: "design.md", status: "done" },
        { id: "specs", outputPath: "specs/**/*.md", status: "done" },
        { id: "tasks", outputPath: "tasks.md", status: "ready" },
      ],
    });

    const result = await scanGraph(root, openspec, files);

    expect(result.nodes).toEqual([
      {
        id: createGraphId("capability", "user-auth"),
        slug: "user-auth",
        type: "capability",
        path: "openspec/specs/user-auth",
      },
      {
        id: createGraphId("change", "add-payment"),
        slug: "add-payment",
        type: "change",
        path: "openspec/changes/add-payment",
        status: "active",
        artifacts: { proposal: true, design: true, specs: true, tasks: false },
      },
    ]);
    expect(result.edges).toHaveLength(3);
    expect(result.edges.map((edge) => edge.kind)).toEqual([
      "depends_on",
      "impacts",
      "impacts",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("warns about malformed frontmatter and continues", async () => {
    const files = new MemoryFileSystem({
      "/project/openspec/specs/broken/spec.md": "---\ndepends-on:\n  capability: auth\n---",
    });
    const openspec = new StubOpenSpecClient();
    openspec.listSpecsResponse = [{
      name: "broken",
      path: "/project/openspec/specs/broken",
    }];

    const result = await scanGraph("/project", openspec, files);

    expect(result.edges).toEqual([]);
    expect(result.warnings[0]).toContain("Malformed frontmatter");
  });

  it("parses inline declarations and ignores files without frontmatter", () => {
    expect(parseDependencyDeclarations("# No frontmatter")).toEqual([]);
    expect(parseDependencyDeclarations(
      "---\ndepends-on: [{ capability: auth, kind: extends }]\n---",
    )).toEqual([{ capability: "auth", kind: "extends" }]);
    expect(parseDependencyDeclarations(
      "---\ndepends-on:\n  - { capability: auth, kind: depends_on } # comment\n---",
    )).toEqual([{ capability: "auth", kind: "depends_on" }]);
    expect(parseDependencyDeclarations([
      "---",
      "description: |",
      "  example delimiter",
      "  ---",
      "depends-on:",
      "  - capability: auth",
      "    kind: depends_on",
      "---",
    ].join("\n"))).toEqual([{ capability: "auth", kind: "depends_on" }]);
  });

  it("creates a provisional capability node for a new delta spec", async () => {
    const files = new MemoryFileSystem({
      "/project/openspec/changes/add-search/proposal.md": "# Search",
      "/project/openspec/changes/add-search/specs/search/spec.md": "# Search spec",
    });
    const openspec = new StubOpenSpecClient();
    openspec.listResponse = [{
      name: "add-search",
      path: "/project/openspec/changes/add-search",
    }];
    openspec.statusResponses.set("add-search", {
      changeName: "add-search",
      schemaName: "sdf-workflow",
      isComplete: false,
      artifacts: [{ id: "proposal", outputPath: "proposal.md", status: "done" }],
    });

    const result = await scanGraph("/project", openspec, files);
    expect(result.nodes).toContainEqual({
      id: createGraphId("capability", "search"),
      slug: "search",
      type: "capability",
      path: "openspec/changes/add-search/specs/search",
    });
    expect(result.edges).toContainEqual(expect.objectContaining({
      from: createGraphId("change", "add-search"),
      to: createGraphId("capability", "search"),
      kind: "impacts",
    }));
  });

  it("ignores markdown links shown as code examples", async () => {
    const files = new MemoryFileSystem({
      "/project/openspec/specs/docs/spec.md": [
        "Use `[example](../missing/spec.md)` in documentation.",
        "```markdown",
        "[example](../also-missing/spec.md)",
        "```",
      ].join("\n"),
    });
    const openspec = new StubOpenSpecClient();
    openspec.listSpecsResponse = [{
      name: "docs",
      path: "/project/openspec/specs/docs",
    }];

    const result = await scanGraph("/project", openspec, files);
    expect(result.edges).toEqual([]);
  });
});
