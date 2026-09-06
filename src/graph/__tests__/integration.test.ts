import { describe, expect, it, vi } from "vitest";
import { GraphCommand } from "../../cli/commands/graph";
import { parseArgs } from "../../cli/args";
import { groupWaves } from "../analysis";
import { readManifest } from "../manifest";
import { buildProjectGraph } from "../project";
import { MemoryFileSystem, StubOpenSpecClient } from "../../services/__tests__/helpers";

function fixture() {
  const files = new MemoryFileSystem({
    "/project/openspec/specs/base/spec.md": "# Base",
    "/project/openspec/specs/auth/spec.md": "# Auth",
    "/project/openspec/specs/payments/spec.md": "# Payments",
    "/project/openspec/changes/foundation/proposal.md": "# Foundation",
    "/project/openspec/changes/add-auth/proposal.md": [
      "---",
      "depends-on:",
      "  - change: foundation",
      "    kind: depends_on",
      "---",
      "# Add auth",
    ].join("\n"),
    "/project/openspec/changes/add-auth/specs/auth/spec.md": "# Auth delta",
    "/project/openspec/changes/add-payments/proposal.md": [
      "---",
      "depends-on:",
      "  - change: add-auth",
      "    kind: depends_on",
      "---",
      "# Add payments",
    ].join("\n"),
    "/project/openspec/changes/add-payments/specs/payments/spec.md": "# Payment delta",
  });
  const openspec = new StubOpenSpecClient();
  openspec.listSpecsResponse = ["base", "auth", "payments"].map((name) => ({
    name,
    path: `/project/openspec/specs/${name}`,
  }));
  openspec.listResponse = ["foundation", "add-auth", "add-payments"].map((name) => ({
    name,
    path: `/project/openspec/changes/${name}`,
  }));
  for (const change of openspec.listResponse) {
    openspec.statusResponses.set(change.name, {
      changeName: change.name,
      schemaName: "sdf-workflow",
      isComplete: false,
      artifacts: [
        { id: "proposal", outputPath: "proposal.md", status: "done" },
        { id: "design", outputPath: "design.md", status: "ready" },
        { id: "specs", outputPath: "specs/**/*.md", status: "done" },
        { id: "tasks", outputPath: "tasks.md", status: "ready" },
      ],
    });
  }
  return { files, openspec };
}

describe("spec graph integration", () => {
  it("scans, builds, analyzes, and persists a fixture graph", async () => {
    const { files, openspec } = fixture();
    const { graph, scan } = await buildProjectGraph("/project", openspec, files);

    expect(scan.warnings).toEqual([]);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(4);
    expect(groupWaves(graph).map((wave) => wave.map((node) => node.slug))).toEqual([
      ["auth", "base", "payments", "foundation"],
      ["add-auth"],
      ["add-payments"],
    ]);

    const command = new GraphCommand({ cwd: "/project", files, openspec });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await command.execute(parseArgs(["graph", "build", "--json"]));

    expect(readManifest(files, "/project").edges).toHaveLength(4);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
      nodes: 6,
      edges: 4,
      cycles: [],
    });
    log.mockRestore();
  });

  it("runs order and impact CLI commands against a built fixture", async () => {
    const { files, openspec } = fixture();
    const command = new GraphCommand({ cwd: "/project", files, openspec });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await command.execute(parseArgs(["graph", "build", "--json"]));

    await command.execute(parseArgs(["graph", "order", "--json"]));
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual([
      ["foundation"],
      ["add-auth"],
      ["add-payments"],
    ]);

    await command.execute(parseArgs([
      "graph",
      "impact",
      "--changed",
      "openspec/specs/auth/spec.md",
      "--json",
    ]));
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({
      changed: ["auth"],
      upstreamContext: [],
      downstreamAffected: ["add-auth", "add-payments"],
    });
    log.mockRestore();
  });
});
