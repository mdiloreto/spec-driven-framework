import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  OpenSpecClient,
  OpenSpecChangeStatus,
  OpenSpecArtifactInstructions,
  OpenSpecChangeListItem,
  OpenSpecSpecListItem,
  OpenSpecValidationResult,
} from "../types/index.js";

const execFileAsync = promisify(execFile);

/**
 * Wraps the OpenSpec CLI as a subprocess, parsing JSON output.
 * Follows the delegation principle: never reimplement what OpenSpec provides.
 */
export class OpenSpecCLIClient implements OpenSpecClient {
  private readonly cwd: string;
  private readonly bin: string;
  private readonly timeout: number;

  constructor(options: { cwd: string; bin?: string; timeout?: number }) {
    this.cwd = options.cwd;
    this.bin = options.bin ?? "openspec";
    this.timeout = options.timeout ?? 30_000;
  }

  public async status(changeName: string): Promise<OpenSpecChangeStatus> {
    return this.exec<OpenSpecChangeStatus>([
      "status",
      "--change",
      changeName,
      "--json",
    ]);
  }

  public async instructions(
    artifactId: string,
    changeName: string,
  ): Promise<OpenSpecArtifactInstructions> {
    return this.exec<OpenSpecArtifactInstructions>([
      "instructions",
      artifactId,
      "--change",
      changeName,
      "--json",
    ]);
  }

  public async list(): Promise<OpenSpecChangeListItem[]> {
    interface RawChangeItem {
      name: string;
      completedTasks?: number;
      totalTasks?: number;
      lastModified?: string;
      status?: string;
    }
    const result = await this.exec<{ changes: RawChangeItem[] }>(["list", "--json"]);
    return result.changes.map((c) => ({
      ...c,
      path: `${this.cwd}/openspec/changes/${c.name}`,
    }));
  }

  public async listSpecs(): Promise<OpenSpecSpecListItem[]> {
    return this.exec<OpenSpecSpecListItem[]>(["list", "--specs", "--json"]);
  }

  public async validate(name: string): Promise<OpenSpecValidationResult> {
    try {
      return await this.exec<OpenSpecValidationResult>([
        "validate",
        name,
        "--json",
      ]);
    } catch {
      return { valid: false, errors: ["Validation command failed"] };
    }
  }

  public async validateAll(): Promise<OpenSpecValidationResult> {
    try {
      return await this.exec<OpenSpecValidationResult>([
        "validate",
        "--all",
        "--json",
      ]);
    } catch {
      return { valid: false, errors: ["Validation command failed"] };
    }
  }

  private async exec<T>(args: string[]): Promise<T> {
    try {
      const { stdout } = await execFileAsync(this.bin, args, {
        cwd: this.cwd,
        timeout: this.timeout,
      });
      return JSON.parse(stdout) as T;
    } catch (err: unknown) {
      if (isExecError(err)) {
        const message = err.stderr?.trim() || err.message;
        throw new OpenSpecClientError(
          `openspec ${args.join(" ")} failed: ${message}`,
          args,
          err.code ?? undefined,
        );
      }
      throw err;
    }
  }
}

export class OpenSpecClientError extends Error {
  override readonly name = "OpenSpecClientError";

  constructor(
    message: string,
    public readonly args: string[],
    public readonly exitCode?: number,
  ) {
    super(message);
  }
}

interface ExecError {
  message: string;
  stderr?: string;
  code?: number;
}

function isExecError(err: unknown): err is ExecError {
  return err instanceof Error && "stderr" in err;
}
