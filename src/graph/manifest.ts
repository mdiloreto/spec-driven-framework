import { join } from "node:path";
import type {
  EdgeKind,
  FileSystem,
  GraphEdge,
  GraphNode,
  SpecGraph,
} from "../types/index";
import { EDGE_KINDS, isGraphId } from "../types/index";

const MANIFEST_FILE = "spec-graph.json";

export class GraphManifestError extends Error {
  public override readonly name = "GraphManifestError";
}

export function writeManifest(
  files: FileSystem,
  projectRoot: string,
  graph: SpecGraph,
): string {
  const path = join(projectRoot, MANIFEST_FILE);
  files.writeFile(path, `${JSON.stringify(graph, null, 2)}\n`);
  return path;
}

export function readManifest(
  files: FileSystem,
  projectRoot: string,
): SpecGraph {
  const path = join(projectRoot, MANIFEST_FILE);
  if (!files.exists(path)) {
    throw new GraphManifestError(`Graph manifest does not exist: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(files.readFile(path));
  } catch (error: unknown) {
    throw new GraphManifestError(
      `Graph manifest contains invalid JSON: ${errorMessage(error)}`,
    );
  }

  return validateManifest(parsed);
}

export function isManifestStale(
  files: FileSystem,
  projectRoot: string,
): boolean {
  const manifestPath = join(projectRoot, MANIFEST_FILE);
  const openspecPath = join(projectRoot, "openspec");
  if (!files.exists(manifestPath)) return true;
  if (!files.exists(openspecPath)) return true;
  if (!files.modifiedTime) return false;

  const manifestTime = files.modifiedTime(manifestPath);
  return collectPaths(files, openspecPath).some(
    (path) => modifiedTime(files, path) > manifestTime,
  );
}

export function validateManifest(value: unknown): SpecGraph {
  if (!isRecord(value)) throw new GraphManifestError("Manifest must be an object");
  if (value.version !== "1.0") {
    throw new GraphManifestError("Manifest version must be 1.0");
  }
  if (
    typeof value.generatedAt !== "string" ||
    !isIsoTimestamp(value.generatedAt)
  ) {
    throw new GraphManifestError("Manifest generatedAt must be an ISO timestamp");
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new GraphManifestError("Manifest nodes and edges must be arrays");
  }

  const nodes = value.nodes.map(validateNode);
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      throw new GraphManifestError(`Duplicate graph node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  const edges = value.edges.map(validateEdge);
  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new GraphManifestError(
        `Edge references an unknown node: ${edge.from} -> ${edge.to}`,
      );
    }
    const key = `${edge.from}\0${edge.to}\0${edge.kind}`;
    if (edgeKeys.has(key)) {
      throw new GraphManifestError(
        `Duplicate graph edge: ${edge.from} -> ${edge.to} (${edge.kind})`,
      );
    }
    edgeKeys.add(key);
  }

  return { version: "1.0", generatedAt: value.generatedAt, nodes, edges };
}

function validateNode(value: unknown): GraphNode {
  if (!isRecord(value)) throw new GraphManifestError("Graph node must be an object");
  if (typeof value.id !== "string" || !isGraphId(value.id)) {
    throw new GraphManifestError(`Invalid graph node id: ${String(value.id)}`);
  }
  if (typeof value.slug !== "string" || !value.slug) {
    throw new GraphManifestError(`Graph node ${value.id} has an invalid slug`);
  }
  if (value.type !== "capability" && value.type !== "change") {
    throw new GraphManifestError(`Graph node ${value.id} has an invalid type`);
  }
  if (value.id !== `${value.type}:${value.slug}`) {
    throw new GraphManifestError(
      `Graph node id ${value.id} does not match its type and slug`,
    );
  }
  if (typeof value.path !== "string") {
    throw new GraphManifestError(`Graph node ${value.id} has an invalid path`);
  }

  const node: GraphNode = {
    id: value.id,
    slug: value.slug,
    type: value.type,
    path: value.path,
  };
  if (value.status === "active" || value.status === "archived") {
    node.status = value.status;
  } else if (value.status !== undefined) {
    throw new GraphManifestError(`Graph node ${value.id} has an invalid status`);
  }
  if (value.artifacts !== undefined) {
    if (!isArtifacts(value.artifacts)) {
      throw new GraphManifestError(`Graph node ${value.id} has invalid artifacts`);
    }
    node.artifacts = value.artifacts;
  }
  if (node.type === "change" && (!node.status || !node.artifacts)) {
    throw new GraphManifestError(
      `Change node ${value.id} requires status and artifacts`,
    );
  }
  return node;
}

function validateEdge(value: unknown): GraphEdge {
  if (!isRecord(value)) throw new GraphManifestError("Graph edge must be an object");
  if (typeof value.from !== "string" || !isGraphId(value.from)) {
    throw new GraphManifestError("Graph edge has an invalid source id");
  }
  if (typeof value.to !== "string" || !isGraphId(value.to)) {
    throw new GraphManifestError("Graph edge has an invalid target id");
  }
  if (typeof value.kind !== "string" || !(EDGE_KINDS as readonly string[]).includes(value.kind)) {
    throw new GraphManifestError(`Graph edge has an invalid kind: ${String(value.kind)}`);
  }
  if (value.reason !== undefined && typeof value.reason !== "string") {
    throw new GraphManifestError("Graph edge reason must be a string");
  }

  return {
    from: value.from,
    to: value.to,
    kind: value.kind as EdgeKind,
    reason: value.reason as string | undefined,
  };
}

function collectPaths(files: FileSystem, path: string): string[] {
  try {
    const entries = files.listDir(path);
    return [path, ...entries.flatMap((entry) => collectPaths(files, join(path, entry)))];
  } catch {
    return [path];
  }
}

function modifiedTime(files: FileSystem, path: string): number {
  try {
    return files.modifiedTime!(path);
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

function isArtifacts(value: unknown): value is NonNullable<GraphNode["artifacts"]> {
  if (!isRecord(value)) return false;
  return ["proposal", "design", "specs", "tasks"].every(
    (key) => typeof value[key] === "boolean",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue, offsetHourValue, offsetMinuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const offsetHour = Number(offsetHourValue ?? 0);
  const offsetMinute = Number(offsetMinuteValue ?? 0);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  return day >= 1 && day <= daysInMonth &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    offsetHour <= 23 && offsetMinute <= 59;
}
