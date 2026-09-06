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
    const args = [
      "status",
      "--change",
      changeName,
      "--json",
    ];
    return parseStatus(await this.execJson(args), args);
  }

  public async instructions(
    artifactId: string,
    changeName: string,
  ): Promise<OpenSpecArtifactInstructions> {
    const args = [
      "instructions",
      artifactId,
      "--change",
      changeName,
      "--json",
    ];
    return parseInstructions(await this.execJson(args), args);
  }

  public async list(): Promise<OpenSpecChangeListItem[]> {
    const args = ["list", "--json"];
    return parseChangeList(await this.execJson(args), args).map((change) => ({
      ...change,
      path: `${this.cwd}/openspec/changes/${change.name}`,
    }));
  }

  public async listSpecs(): Promise<OpenSpecSpecListItem[]> {
    const output = await this.execOutput(["list", "--specs", "--json"]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(output) as unknown;
    } catch {
      return parseTextSpecList(output, this.cwd);
    }

    const specs = parseSpecList(parsed, ["list", "--specs", "--json"]);
      return specs.map((spec) => ({
        name: spec.name,
        path: `${this.cwd}/openspec/specs/${spec.name}`,
      }));
  }

  public async validate(name: string): Promise<OpenSpecValidationResult> {
    try {
      const args = [
        "validate",
        name,
        "--json",
      ];
      return parseValidation(await this.execJson(args), args);
    } catch {
      return { valid: false, errors: ["Validation command failed"] };
    }
  }

  public async validateAll(): Promise<OpenSpecValidationResult> {
    try {
      const args = [
        "validate",
        "--all",
        "--json",
      ];
      return parseValidation(await this.execJson(args), args);
    } catch {
      return { valid: false, errors: ["Validation command failed"] };
    }
  }

  private async execJson(args: string[]): Promise<unknown> {
    const output = await this.execOutput(args);
    try {
      return JSON.parse(output) as unknown;
    } catch (error: unknown) {
      throw invalidOutput(args, `invalid JSON: ${errorMessage(error)}`);
    }
  }

  private async execOutput(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.bin, args, {
        cwd: this.cwd,
        timeout: this.timeout,
      });
      return stdout.trim();
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

interface RawChangeItem {
  name: string;
  completedTasks?: number;
  totalTasks?: number;
  lastModified?: string;
  status?: string;
}

function parseStatus(value: unknown, args: string[]): OpenSpecChangeStatus {
  if (!isRecord(value) ||
      typeof value.changeName !== "string" ||
      typeof value.schemaName !== "string" ||
      typeof value.isComplete !== "boolean" ||
      !Array.isArray(value.artifacts)) {
    throw invalidOutput(args, "invalid status response shape");
  }
  const artifacts = value.artifacts.map<OpenSpecChangeStatus["artifacts"][number]>((artifact) => {
    const status = isRecord(artifact) ? artifact.status : undefined;
    if (!isRecord(artifact) ||
        typeof artifact.id !== "string" ||
        typeof artifact.outputPath !== "string" ||
        (status !== "ready" && status !== "blocked" && status !== "done")) {
      throw invalidOutput(args, "invalid status artifact shape");
    }
    return {
      id: artifact.id,
      outputPath: artifact.outputPath,
      status,
      missingDeps: Array.isArray(artifact.missingDeps)
        ? artifact.missingDeps.filter((item): item is string => typeof item === "string")
        : undefined,
    };
  });
  return {
    changeName: value.changeName,
    schemaName: value.schemaName,
    isComplete: value.isComplete,
    artifacts,
  };
}

function parseInstructions(
  value: unknown,
  args: string[],
): OpenSpecArtifactInstructions {
  if (!isRecord(value)) throw invalidOutput(args, "invalid instructions response shape");
  const keys = ["changeName", "artifactId", "instruction", "context", "template", "outputPath"] as const;
  if (!keys.every((key) => typeof value[key] === "string")) {
    throw invalidOutput(args, "invalid instructions response fields");
  }
  return {
    changeName: value.changeName as string,
    artifactId: value.artifactId as string,
    instruction: value.instruction as string,
    context: value.context as string,
    template: value.template as string,
    outputPath: value.outputPath as string,
  };
}

function parseChangeList(value: unknown, args: string[]): RawChangeItem[] {
  if (!isRecord(value) || !Array.isArray(value.changes)) {
    throw invalidOutput(args, "invalid change list response shape");
  }
  return value.changes.map((change) => {
    if (!isRecord(change) || typeof change.name !== "string") {
      throw invalidOutput(args, "invalid change list item");
    }
    return {
      name: change.name,
      completedTasks: optionalNumber(change.completedTasks, args),
      totalTasks: optionalNumber(change.totalTasks, args),
      lastModified: optionalString(change.lastModified, args),
      status: optionalString(change.status, args),
    };
  });
}

function parseSpecList(value: unknown, args: string[]): { name: string }[] {
  const specs = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.specs)
      ? value.specs
      : undefined;
  if (!specs) throw invalidOutput(args, "invalid spec list response shape");
  return specs.map((spec) => {
    if (!isRecord(spec) || typeof spec.name !== "string") {
      throw invalidOutput(args, "invalid spec list item");
    }
    return { name: spec.name };
  });
}

function parseTextSpecList(output: string, cwd: string): OpenSpecSpecListItem[] {
  if (!output.startsWith("Specs:")) {
    throw invalidOutput(["list", "--specs", "--json"], "unrecognized text response");
  }
  return output
    .split("\n")
    .slice(1)
    .map((line) => /^\s{2}(\S+)/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
    .map((name) => ({ name, path: `${cwd}/openspec/specs/${name}` }));
}

function parseValidation(value: unknown, args: string[]): OpenSpecValidationResult {
  if (isRecord(value) && typeof value.valid === "boolean" && Array.isArray(value.errors)) {
    return {
      valid: value.valid,
      errors: value.errors.filter((error): error is string => typeof error === "string"),
    };
  }
  if (isRecord(value) && isRecord(value.summary) && isRecord(value.summary.totals)) {
    const failed = value.summary.totals.failed;
    if (typeof failed !== "number") throw invalidOutput(args, "invalid validation totals");
    const errors = Array.isArray(value.items)
      ? value.items.flatMap((item) =>
        isRecord(item) && Array.isArray(item.issues)
          ? item.issues.map((issue) => typeof issue === "string" ? issue : JSON.stringify(issue))
          : [])
      : [];
    return { valid: failed === 0, errors };
  }
  throw invalidOutput(args, "invalid validation response shape");
}

function optionalString(value: unknown, args: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalidOutput(args, "expected optional string");
  return value;
}

function optionalNumber(value: unknown, args: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number") throw invalidOutput(args, "expected optional number");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidOutput(args: string[], message: string): OpenSpecClientError {
  return new OpenSpecClientError(
    `openspec ${args.join(" ")} returned ${message}`,
    args,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
