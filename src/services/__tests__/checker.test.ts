import { describe, it, expect } from "vitest";
import { ArtifactChecker } from "../checker.js";
import { MemoryFileSystem } from "./helpers.js";

function makeChangeFiles(changePath: string, overrides: Record<string, string> = {}): Record<string, string> {
  const defaults: Record<string, string> = {
    [`${changePath}/proposal.md`]: `## Why\nSome problem.\n## What Changes\nSome scope.`,
    [`${changePath}/design.md`]: `## Context\nBackground.\n## Goals / Non-Goals\nGoals.\n## Decisions\n### Decision 1\nDo X.`,
    [`${changePath}/specs/auth.md`]: `### Requirement: User authentication\n#### Scenario: Login\n- WHEN user submits credentials\n- THEN session is created`,
    [`${changePath}/tasks.md`]: `## 1. Setup\n- [ ] 1.1 Create project\n- [ ] 1.2 Install deps`,
  };
  return { ...defaults, ...overrides };
}

describe("ArtifactChecker", () => {
  it("reports complete when all artifacts exist and are valid", async () => {
    const changePath = "/project/openspec/changes/add-auth";
    const fs = new MemoryFileSystem(makeChangeFiles(changePath));
    const checker = new ArtifactChecker(fs);

    const result = await checker.check(changePath, "add-auth");

    expect(result.status).toBe("complete");
    expect(result.artifacts.every((a) => a.exists && a.valid)).toBe(true);
  });

  it("reports missing when no artifacts exist", async () => {
    const fs = new MemoryFileSystem();
    const checker = new ArtifactChecker(fs);

    const result = await checker.check("/project/openspec/changes/empty", "empty");

    expect(result.status).toBe("missing");
    expect(result.artifacts.every((a) => !a.exists)).toBe(true);
  });

  it("reports partial when some artifacts exist", async () => {
    const changePath = "/project/openspec/changes/partial";
    const fs = new MemoryFileSystem({
      [`${changePath}/proposal.md`]: `## Why\nProblem.\n## What Changes\nScope.`,
    });
    const checker = new ArtifactChecker(fs);

    const result = await checker.check(changePath, "partial");

    expect(result.status).toBe("partial");
    expect(result.artifacts.find((a) => a.artifact === "proposal")?.exists).toBe(true);
    expect(result.artifacts.find((a) => a.artifact === "design")?.exists).toBe(false);
  });

  it("flags proposal missing Purpose/Why section", async () => {
    const changePath = "/project/openspec/changes/bad-proposal";
    const fs = new MemoryFileSystem({
      ...makeChangeFiles(changePath),
      [`${changePath}/proposal.md`]: `## Random\nNo purpose here.\n## Capabilities\nStuff.`,
    });
    const checker = new ArtifactChecker(fs);

    const result = await checker.check(changePath, "bad-proposal");
    const proposal = result.artifacts.find((a) => a.artifact === "proposal")!;

    expect(proposal.valid).toBe(false);
    expect(proposal.issues).toContain("proposal.md missing Purpose/Problem/Why section");
  });

  it("flags design missing Decisions section", async () => {
    const changePath = "/project/openspec/changes/bad-design";
    const fs = new MemoryFileSystem({
      ...makeChangeFiles(changePath),
      [`${changePath}/design.md`]: `## Context\nBg.\n## Goals\nGoals.`,
    });
    const checker = new ArtifactChecker(fs);

    const result = await checker.check(changePath, "bad-design");
    const design = result.artifacts.find((a) => a.artifact === "design")!;

    expect(design.valid).toBe(false);
    expect(design.issues).toContain("design.md missing Decisions section");
  });

  it("flags design when proposal is missing", async () => {
    const changePath = "/project/openspec/changes/orphan-design";
    const fs = new MemoryFileSystem({
      [`${changePath}/design.md`]: `## Context\nBg.\n## Goals\nGoals.\n## Decisions\nStuff.`,
      [`${changePath}/specs/test.md`]: `### Requirement: X\n#### Scenario: Y\n- WHEN\n- THEN`,
      [`${changePath}/tasks.md`]: `## 1. Setup\n- [ ] 1.1 Do thing`,
    });
    const checker = new ArtifactChecker(fs);

    const result = await checker.check(changePath, "orphan-design");
    const design = result.artifacts.find((a) => a.artifact === "design")!;

    expect(design.issues).toContain(
      "design.md exists but proposal.md is missing (design depends on proposal)",
    );
  });

  it("flags tasks without checkbox format", async () => {
    const changePath = "/project/openspec/changes/bad-tasks";
    const fs = new MemoryFileSystem({
      ...makeChangeFiles(changePath),
      [`${changePath}/tasks.md`]: `## 1. Setup\n- Install deps\n- Create files`,
    });
    const checker = new ArtifactChecker(fs);

    const result = await checker.check(changePath, "bad-tasks");
    const tasks = result.artifacts.find((a) => a.artifact === "tasks")!;

    expect(tasks.valid).toBe(false);
    expect(tasks.issues.some((i) => i.includes("no checkbox tasks"))).toBe(true);
  });

  it("flags specs without scenarios", async () => {
    const changePath = "/project/openspec/changes/bad-specs";
    const fs = new MemoryFileSystem({
      ...makeChangeFiles(changePath),
      [`${changePath}/specs/auth.md`]: `### Requirement: Auth\nJust a requirement, no scenarios.`,
    });
    const checker = new ArtifactChecker(fs);

    const result = await checker.check(changePath, "bad-specs");
    const specs = result.artifacts.find((a) => a.artifact === "specs")!;

    expect(specs.valid).toBe(false);
    expect(specs.issues.some((i) => i.includes("no Scenario sections"))).toBe(true);
  });

  it("converts check result to ArtifactState", () => {
    const fs = new MemoryFileSystem();
    const checker = new ArtifactChecker(fs);

    const state = checker.toArtifactState({
      artifact: "proposal",
      exists: true,
      valid: false,
      issues: ["missing Purpose section"],
    });

    expect(state.exists).toBe(true);
    expect(state.valid).toBe(false);
    expect(state.issues).toEqual(["missing Purpose section"]);
    expect(state.lastChecked).toBeTruthy();
  });
});
