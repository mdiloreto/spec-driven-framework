import type { FileSystem, OpenSpecClient, OpenSpecChangeStatus, OpenSpecArtifactInstructions, OpenSpecChangeListItem, OpenSpecSpecListItem, OpenSpecValidationResult } from "../../types/index";

/**
 * In-memory FileSystem for testing.
 * Tracks all writes for assertions.
 */
export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, string>();
  private modifiedTimes = new Map<string, number>();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, content);
      this.modifiedTimes.set(path, 1);
    }
  }

  public readFile(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  }

  public writeFile(path: string, content: string): void {
    this.files.set(path, content);
    this.modifiedTimes.set(path, Date.now());
  }

  public exists(path: string): boolean {
    if (this.files.has(path)) return true;
    const dirPrefix = path.endsWith("/") ? path : path + "/";
    for (const key of this.files.keys()) {
      if (key.startsWith(dirPrefix)) return true;
    }
    return false;
  }

  public listDir(path: string): string[] {
    if (this.files.has(path)) throw new Error(`ENOTDIR: ${path}`);
    const dirPrefix = path.endsWith("/") ? path : path + "/";
    const entries = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(dirPrefix)) {
        const rest = key.slice(dirPrefix.length);
        const topLevel = rest.split("/")[0];
        if (topLevel) entries.add(topLevel);
      }
    }
    return [...entries];
  }

  public getWritten(path: string): string | undefined {
    return this.files.get(path);
  }

  public modifiedTime(path: string): number {
    const time = this.modifiedTimes.get(path);
    if (time === undefined) throw new Error(`ENOENT: ${path}`);
    return time;
  }

  public setModifiedTime(path: string, time: number): void {
    if (!this.files.has(path)) throw new Error(`ENOENT: ${path}`);
    this.modifiedTimes.set(path, time);
  }
}

/**
 * Stub OpenSpec client for testing.
 */
export class StubOpenSpecClient implements OpenSpecClient {
  public statusResponses = new Map<string, OpenSpecChangeStatus>();
  public listResponse: OpenSpecChangeListItem[] = [];
  public listSpecsResponse: OpenSpecSpecListItem[] = [];

  public async status(changeName: string): Promise<OpenSpecChangeStatus> {
    const response = this.statusResponses.get(changeName);
    if (!response) throw new Error(`No stub for change: ${changeName}`);
    return response;
  }

  public async instructions(_artifactId: string, _changeName: string): Promise<OpenSpecArtifactInstructions> {
    return {
      changeName: _changeName,
      artifactId: _artifactId,
      instruction: "stub instruction",
      context: "stub context",
      template: "stub template",
      outputPath: `${_artifactId}.md`,
    };
  }

  public async list(): Promise<OpenSpecChangeListItem[]> {
    return this.listResponse;
  }

  public async listSpecs(): Promise<OpenSpecSpecListItem[]> {
    return this.listSpecsResponse;
  }

  public async validate(_name: string): Promise<OpenSpecValidationResult> {
    return { valid: true, errors: [] };
  }

  public async validateAll(): Promise<OpenSpecValidationResult> {
    return { valid: true, errors: [] };
  }
}
