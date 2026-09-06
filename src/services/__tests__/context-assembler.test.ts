import { describe, it, expect } from "vitest";
import { ContextAssembler } from "../context-assembler";
import { MemoryFileSystem } from "./helpers";
import type { SpecGraph } from "../../types/index";
import { createGraphId } from "../../types/index";

function makeGraph(overrides: Partial<SpecGraph> = {}): SpecGraph {
  return { version: "1.0", generatedAt: "", nodes: [], edges: [], ...overrides };
}

function graphNode(
  type: "capability" | "change",
  slug: string,
  path: string,
) {
  return { id: createGraphId(type, slug), slug, type, path };
}

describe("ContextAssembler", () => {
  it("assembles a full context bundle for a task", async () => {
    const changePath = "/project/openspec/changes/add-auth";
    const fs = new MemoryFileSystem({
      [`${changePath}/proposal.md`]: "# Proposal\nAdd auth.",
      [`${changePath}/design.md`]: "# Design\nUse JWT.",
      [`${changePath}/specs/auth.md`]: "# Auth Spec\nRequirements.",
    });

    const assembler = new ContextAssembler(fs, makeGraph({
      nodes: [graphNode("change", "add-auth", changePath)],
    }));
    const bundle = await assembler.assemble(changePath, "add-auth", {
      id: "1.1", description: "Create user model", completed: false,
    });

    expect(bundle.task.id).toBe("1.1");
    expect(bundle.task.fromChange).toBe("add-auth");
    expect(bundle.proposal).toBe("# Proposal\nAdd auth.");
    expect(bundle.design).toBe("# Design\nUse JWT.");
    expect(bundle.specs).toHaveLength(1);
  });

  it("includes upstream specs from spec-graph", async () => {
    const changePath = "/project/openspec/changes/add-payments";
    const fs = new MemoryFileSystem({
      [`${changePath}/proposal.md`]: "Payments proposal.",
      [`${changePath}/design.md`]: "Payments design.",
      ["/project/openspec/specs/user-auth/spec.md"]: "# User Auth\nAuth spec content.",
    });

    const assembler = new ContextAssembler(fs, makeGraph({
      nodes: [
        graphNode("change", "add-payments", changePath),
        graphNode("capability", "user-auth", "/project/openspec/specs/user-auth"),
      ],
      edges: [{
        from: createGraphId("change", "add-payments"),
        to: createGraphId("capability", "user-auth"),
        kind: "depends_on",
      }],
    }));
    const bundle = await assembler.assemble(changePath, "add-payments", {
      id: "1.1", description: "Setup payment gateway", completed: false,
    });

    expect(bundle.upstreamContext.specs).toHaveLength(1);
    expect(bundle.upstreamContext.specs[0]!.id).toBe("user-auth");
    expect(bundle.upstreamContext.specs[0]!.content).toContain("Auth spec content");
  });

  it("handles missing artifacts gracefully", async () => {
    const fs = new MemoryFileSystem();
    const assembler = new ContextAssembler(fs, makeGraph());
    const bundle = await assembler.assemble("/nonexistent", "minimal", {
      id: "1.1", description: "Do something", completed: false,
    });

    expect(bundle.proposal).toBe("");
    expect(bundle.design).toBe("");
    expect(bundle.specs).toEqual([]);
  });

  it("truncates to fit token budget", async () => {
    const changePath = "/project/openspec/changes/big";
    const bigContent = "x".repeat(10000);
    const fs = new MemoryFileSystem({
      [`${changePath}/proposal.md`]: "Short proposal.",
      [`${changePath}/design.md`]: "Short design.",
      ["/project/openspec/specs/upstream/spec.md"]: bigContent,
    });

    const assembler = new ContextAssembler(fs, makeGraph({
      nodes: [
        graphNode("change", "big", changePath),
        graphNode("capability", "upstream", "/project/openspec/specs/upstream"),
      ],
      edges: [{
        from: createGraphId("change", "big"),
        to: createGraphId("capability", "upstream"),
        kind: "depends_on",
      }],
    }));
    const bundle = await assembler.assemble(changePath, "big", {
      id: "1.1", description: "Task", completed: false,
    }, { maxTokens: 100 });

    expect(bundle.truncated).toBe(true);
    expect(bundle.omittedSources).toContain("upstream");
    expect(bundle.proposal).toBe("Short proposal.");
  });

  it("formats bundle as markdown", async () => {
    const changePath = "/project/openspec/changes/test";
    const fs = new MemoryFileSystem({
      [`${changePath}/proposal.md`]: "# Test Proposal",
      [`${changePath}/design.md`]: "# Test Design",
    });

    const assembler = new ContextAssembler(fs, makeGraph());
    const bundle = await assembler.assemble(changePath, "test", {
      id: "2.1", description: "Implement feature", completed: false,
    });

    const markdown = assembler.formatAsMarkdown(bundle);
    expect(markdown).toContain("# Task: 2.1");
    expect(markdown).toContain("**Change:** test");
    expect(markdown).toContain("# Proposal");
    expect(markdown).toContain("# Design");
  });

  it("includes capabilities directly impacted by a change using relative paths", async () => {
    const root = "/project";
    const changePath = `${root}/openspec/changes/add-auth`;
    const fs = new MemoryFileSystem({
      [`${changePath}/proposal.md`]: "# Proposal",
      [`${root}/openspec/specs/auth/spec.md`]: "# Auth capability",
    });
    const changeId = createGraphId("change", "add-auth");
    const capabilityId = createGraphId("capability", "auth");
    const assembler = new ContextAssembler(fs, makeGraph({
      nodes: [
        graphNode("change", "add-auth", "openspec/changes/add-auth"),
        graphNode("capability", "auth", "openspec/specs/auth"),
      ],
      edges: [{ from: changeId, to: capabilityId, kind: "impacts" }],
    }), undefined, root);

    const bundle = await assembler.assemble("openspec/changes/add-auth", "add-auth", {
      id: "1.1",
      description: "Implement auth",
      completed: false,
    });
    expect(bundle.relatedSpecs).toEqual([{
      id: "auth",
      path: "openspec/specs/auth",
      content: "# Auth capability",
    }]);
    expect(bundle.proposal).toBe("# Proposal");
  });
});
