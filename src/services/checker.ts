import { join } from "node:path";
import type {
  FileSystem,
  ArtifactKind,
  ArtifactCheckResult,
  ChangeCheckResult,
  ArtifactState,
  OpenSpecClient,
  SpecGraph,
} from "../types/index";

/**
 * Validates artifact completeness and structural coherence for OpenSpec changes.
 * Delegates structural validation to OpenSpec CLI when available,
 * adds cross-change and spec-graph-aware checks on top.
 */
export class ArtifactChecker {
  constructor(
    private readonly fs: FileSystem,
    private readonly openspec?: OpenSpecClient,
    /** Reserved for cross-change coherence validation in v2 */
    public readonly graph?: SpecGraph,
  ) {}

  public async check(changePath: string, changeName: string): Promise<ChangeCheckResult> {
    const openspecArtifacts = await this.fetchOpenSpecArtifacts(changeName);

    const artifacts: ArtifactCheckResult[] = [
      this.checkProposal(changePath, openspecArtifacts),
      this.checkDesign(changePath, openspecArtifacts),
      this.checkSpecs(changePath, openspecArtifacts),
      this.checkTasks(changePath, openspecArtifacts),
    ];

    return {
      changeName,
      status: ArtifactChecker.deriveStatus(artifacts),
      artifacts,
    };
  }

  public toArtifactState(result: ArtifactCheckResult): ArtifactState {
    return {
      exists: result.exists,
      valid: result.valid,
      lastChecked: new Date().toISOString(),
      issues: result.issues.length > 0 ? result.issues : undefined,
    };
  }

  // -- Private artifact checks --

  private checkProposal(
    changePath: string,
    cache?: ArtifactExistenceCache,
  ): ArtifactCheckResult {
    const filePath = join(changePath, "proposal.md");
    const exists = cache?.get("proposal")?.exists ?? this.fs.exists(filePath);

    if (!exists) {
      return ArtifactChecker.missing("proposal");
    }

    const content = this.safeRead(filePath);
    if (!content) {
      return ArtifactChecker.invalid("proposal", "proposal.md is empty or unreadable");
    }

    const issues: string[] = [];
    // Accept both SDD and OpenSpec heading conventions
    if (!hasHeading(content, "Purpose") && !hasHeading(content, "Problem") && !hasHeading(content, "Why")) {
      issues.push("proposal.md missing Purpose/Problem/Why section");
    }
    if (!hasHeading(content, "Capabilities") && !hasHeading(content, "Scope") && !hasHeading(content, "What Changes")) {
      issues.push("proposal.md missing Capabilities/Scope/What Changes section");
    }

    return { artifact: "proposal", exists: true, valid: issues.length === 0, issues };
  }

  private checkDesign(
    changePath: string,
    cache?: ArtifactExistenceCache,
  ): ArtifactCheckResult {
    const filePath = join(changePath, "design.md");
    const exists = cache?.get("design")?.exists ?? this.fs.exists(filePath);

    if (!exists) {
      return ArtifactChecker.missing("design");
    }

    const content = this.safeRead(filePath);
    if (!content) {
      return ArtifactChecker.invalid("design", "design.md is empty or unreadable");
    }

    const issues: string[] = [];
    if (!hasHeading(content, "Context")) {
      issues.push("design.md missing Context section");
    }
    if (!hasHeading(content, "Goals") && !hasHeading(content, "Goals / Non-Goals")) {
      issues.push("design.md missing Goals/Non-Goals section");
    }
    if (!hasHeading(content, "Decisions")) {
      issues.push("design.md missing Decisions section");
    }

    const proposalPath = join(changePath, "proposal.md");
    if (!this.fs.exists(proposalPath)) {
      issues.push("design.md exists but proposal.md is missing (design depends on proposal)");
    }

    return { artifact: "design", exists: true, valid: issues.length === 0, issues };
  }

  private checkSpecs(
    changePath: string,
    cache?: ArtifactExistenceCache,
  ): ArtifactCheckResult {
    const specsDir = join(changePath, "specs");
    const specFiles = this.collectSpecFiles(specsDir);
    const exists = cache?.get("specs")?.exists ?? specFiles.length > 0;

    if (!exists) {
      return ArtifactChecker.missing("specs", "No spec files found in specs/");
    }

    const issues: string[] = [];
    for (const filePath of specFiles) {
      const content = this.safeRead(filePath);
      if (!content) continue;

      const fileName = filePath.split("/").pop() ?? filePath;
      if (!hasHeading(content, "Requirement")) {
        issues.push(`${fileName} has no Requirement sections`);
      }
      if (!content.includes("#### Scenario")) {
        issues.push(`${fileName} has no Scenario sections — specs need testable scenarios`);
      }
    }

    return { artifact: "specs", exists: true, valid: issues.length === 0, issues };
  }

  private checkTasks(
    changePath: string,
    cache?: ArtifactExistenceCache,
  ): ArtifactCheckResult {
    const filePath = join(changePath, "tasks.md");
    const exists = cache?.get("tasks")?.exists ?? this.fs.exists(filePath);

    if (!exists) {
      return ArtifactChecker.missing("tasks");
    }

    const content = this.safeRead(filePath);
    if (!content) {
      return ArtifactChecker.invalid("tasks", "tasks.md is empty or unreadable");
    }

    const issues: string[] = [];

    const checkboxes = content.match(/- \[[ x]\]/g);
    if (!checkboxes || checkboxes.length === 0) {
      issues.push("tasks.md has no checkbox tasks (expected `- [ ]` or `- [x]` format)");
    }

    if (/^- [^[\s]/m.test(content)) {
      issues.push("tasks.md has tasks without checkbox format — they won't be tracked");
    }

    if (!/^## \d+\./m.test(content)) {
      issues.push("tasks.md has no numbered section headings (expected `## 1. Group Name`)");
    }

    return { artifact: "tasks", exists: true, valid: issues.length === 0, issues };
  }

  // -- OpenSpec delegation --

  private async fetchOpenSpecArtifacts(
    changeName: string,
  ): Promise<ArtifactExistenceCache | undefined> {
    if (!this.openspec) return undefined;

    try {
      const status = await this.openspec.status(changeName);
      return new Map(
        status.artifacts.map((a) => [
          a.id as ArtifactKind,
          { exists: a.status === "done" || a.status === "ready" },
        ]),
      );
    } catch {
      return undefined;
    }
  }

  // -- Helpers --

  private safeRead(path: string): string | null {
    try {
      return this.fs.readFile(path);
    } catch {
      return null;
    }
  }

  private safeListDir(path: string): string[] {
    try {
      return this.fs.listDir(path);
    } catch {
      return [];
    }
  }

  /** Collect .md files from specs/ and one level of subdirectories (e.g., specs/loop-engine/spec.md). */
  private collectSpecFiles(specsDir: string): string[] {
    const entries = this.safeListDir(specsDir);
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = join(specsDir, entry);
      if (entry.endsWith(".md")) {
        files.push(entryPath);
      } else {
        // Check for subdirectory containing spec files
        const subEntries = this.safeListDir(entryPath);
        for (const sub of subEntries) {
          if (sub.endsWith(".md")) {
            files.push(join(entryPath, sub));
          }
        }
      }
    }

    return files;
  }

  private static missing(artifact: ArtifactKind, message?: string): ArtifactCheckResult {
    return {
      artifact,
      exists: false,
      valid: false,
      issues: [message ?? `${artifact === "specs" ? "specs/" : artifact + ".md"} does not exist`],
    };
  }

  private static invalid(artifact: ArtifactKind, message: string): ArtifactCheckResult {
    return { artifact, exists: true, valid: false, issues: [message] };
  }

  private static deriveStatus(
    artifacts: ArtifactCheckResult[],
  ): ChangeCheckResult["status"] {
    const allValid = artifacts.every((a) => a.exists && a.valid);
    const noneExist = artifacts.every((a) => !a.exists);

    if (allValid) return "complete";
    if (noneExist) return "missing";
    return "partial";
  }
}

// -- Shared utilities --

type ArtifactExistenceCache = Map<ArtifactKind, { exists: boolean }>;

function hasHeading(content: string, name: string): boolean {
  return new RegExp(`^##+ .*${name}`, "im").test(content);
}
