import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import type {
  DependencyDeclaration,
  EdgeKind,
  FileSystem,
  GraphId,
  OpenSpecClient,
  RawEdge,
  RawNode,
  ScanResult,
} from "../types/index";
import { createGraphId, EDGE_KINDS } from "../types/index";

export async function scanGraph(
  projectRoot: string,
  openspec: OpenSpecClient,
  files: FileSystem,
): Promise<ScanResult> {
  const warnings: string[] = [];
  const [specs, changes] = await Promise.all([
    openspec.listSpecs(),
    openspec.list(),
  ]);

  const capabilityNodes: RawNode[] = specs.map((spec) => ({
    id: createGraphId("capability", spec.name),
    slug: spec.name,
    type: "capability",
    path: relativePath(projectRoot, spec.path),
  }));

  const changeNodes = await Promise.all(
    changes.map(async (change): Promise<RawNode> => {
      const artifacts = {
        proposal: false,
        design: false,
        specs: false,
        tasks: false,
      };

      try {
        const status = await openspec.status(change.name);
        for (const artifact of status.artifacts) {
          if (artifact.status !== "done") continue;
          if (artifact.id === "proposal") artifacts.proposal = true;
          if (artifact.id === "design") artifacts.design = true;
          if (artifact.id === "specs") artifacts.specs = true;
          if (artifact.id === "tasks") artifacts.tasks = true;
        }
      } catch (error: unknown) {
        warnings.push(
          `Unable to read artifact status for ${change.name}: ${errorMessage(error)}`,
        );
      }

      return {
        id: createGraphId("change", change.name),
        slug: change.name,
        type: "change",
        path: relativePath(projectRoot, change.path),
        status: "active",
        artifacts,
      };
    }),
  );

  const nodes: RawNode[] = [...capabilityNodes, ...changeNodes];
  const knownIds = new Set(nodes.map((node) => node.id));
  for (const change of changeNodes) {
    const changeRoot = resolve(projectRoot, change.path);
    for (const delta of collectDeltaSpecs(files, changeRoot)) {
      const id = createGraphId("capability", delta.capability);
      if (knownIds.has(id)) continue;
      knownIds.add(id);
      nodes.push({
        id,
        slug: delta.capability,
        type: "capability",
        path: relativePath(projectRoot, delta.path),
      });
    }
  }
  const edges: RawEdge[] = [];

  for (const node of nodes) {
    const nodeRoot = resolve(projectRoot, node.path);
    const sourceFiles = node.type === "capability"
      ? [join(nodeRoot, "spec.md")]
      : collectChangeSources(files, nodeRoot);

    for (const sourcePath of sourceFiles) {
      if (!files.exists(sourcePath)) continue;
      scanSourceFile(projectRoot, files, sourcePath, node.id, edges, warnings);
    }

    if (node.type === "change") {
      edges.push(...detectDeltaSpecEdges(files, nodeRoot, node.id));
    }
  }

  return { nodes, edges, warnings };
}

export function parseDependencyDeclarations(
  content: string,
): DependencyDeclaration[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return [];

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (closingIndex === -1) {
    throw new Error("frontmatter is missing its closing delimiter");
  }

  const frontmatter = parse(lines.slice(1, closingIndex).join("\n")) as unknown;
  if (!isRecord(frontmatter) || frontmatter["depends-on"] === undefined) return [];
  const dependencies = frontmatter["depends-on"];
  if (!Array.isArray(dependencies)) {
    throw new Error("depends-on must be an array");
  }
  return dependencies.map(validateDeclaration);
}

function scanSourceFile(
  projectRoot: string,
  files: FileSystem,
  sourcePath: string,
  from: GraphId,
  edges: RawEdge[],
  warnings: string[],
): void {
  const content = files.readFile(sourcePath);

  try {
    for (const declaration of parseDependencyDeclarations(content)) {
      const targetType = declaration.capability ? "capability" : "change";
      const targetSlug = declaration.capability ?? declaration.change!;
      edges.push({
        from,
        to: createGraphId(targetType, targetSlug),
        kind: declaration.kind,
        reason: `Declared in ${relativePath(projectRoot, sourcePath)}`,
      });
    }
  } catch (error: unknown) {
    warnings.push(
      `Malformed frontmatter in ${relativePath(projectRoot, sourcePath)}: ${errorMessage(error)}`,
    );
  }

  for (const target of extractMarkdownLinks(content)) {
    const targetId = graphIdFromPath(projectRoot, sourcePath, target);
    if (!targetId) continue;
    edges.push({
      from,
      to: targetId,
      kind: "impacts",
      reason: `Linked from ${relativePath(projectRoot, sourcePath)}`,
    });
  }
}

function collectChangeSources(files: FileSystem, changeRoot: string): string[] {
  const sources = [join(changeRoot, "proposal.md"), join(changeRoot, "design.md")];
  const specsRoot = join(changeRoot, "specs");
  if (!files.exists(specsRoot)) return sources;

  for (const entry of safeListDir(files, specsRoot)) {
    const entryPath = join(specsRoot, entry);
    if (entry.endsWith(".md")) {
      sources.push(entryPath);
      continue;
    }
    for (const nested of safeListDir(files, entryPath)) {
      if (nested.endsWith(".md")) sources.push(join(entryPath, nested));
    }
  }
  return sources;
}

function detectDeltaSpecEdges(
  files: FileSystem,
  changeRoot: string,
  from: GraphId,
): RawEdge[] {
  return collectDeltaSpecs(files, changeRoot)
    .map(({ capability }) => ({
      from,
      to: createGraphId("capability", capability),
      kind: "impacts" as const,
      reason: `Delta spec for ${capability}`,
    }));
}

function collectDeltaSpecs(
  files: FileSystem,
  changeRoot: string,
): { capability: string; path: string }[] {
  const specsRoot = join(changeRoot, "specs");
  if (!files.exists(specsRoot)) return [];
  return safeListDir(files, specsRoot)
    .map((capability) => ({ capability, path: join(specsRoot, capability) }))
    .filter(({ path }) => files.exists(join(path, "spec.md")));
}

function extractMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  const markdown = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const target = match[1];
    if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#")) {
      continue;
    }
    links.push(target.replace(/^<|>$/g, ""));
  }
  return links;
}

function graphIdFromPath(
  projectRoot: string,
  sourcePath: string,
  target: string,
): GraphId | undefined {
  const absoluteTarget = resolve(dirname(sourcePath), target.split("#", 1)[0]!);
  const relativeTarget = relativePath(projectRoot, absoluteTarget);
  const match = /^openspec\/(specs|changes)\/([^/]+)/.exec(relativeTarget);
  if (!match) return undefined;
  return createGraphId(match[1] === "specs" ? "capability" : "change", match[2]!);
}

function validateDeclaration(value: unknown): DependencyDeclaration {
  if (!isRecord(value)) throw new Error("dependency entries must be objects");
  const capability = typeof value.capability === "string" ? value.capability : undefined;
  const change = typeof value.change === "string" ? value.change : undefined;
  const kind = typeof value.kind === "string" ? value.kind : undefined;
  if ((!capability && !change) || (capability && change)) {
    throw new Error("dependency must specify exactly one capability or change");
  }
  if (!kind || !(EDGE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`invalid edge kind: ${kind ?? "missing"}`);
  }
  return { capability, change, kind: kind as EdgeKind };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function relativePath(projectRoot: string, path: string): string {
  const absolute = isAbsolute(path) ? path : resolve(projectRoot, path);
  return relative(projectRoot, absolute).replaceAll("\\", "/");
}

function safeListDir(files: FileSystem, path: string): string[] {
  try {
    return files.listDir(path);
  } catch {
    return [];
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
