import type {
  FileSystem,
  OpenSpecClient,
  ScanResult,
  SpecGraph,
} from "../types/index.js";
import { buildGraph } from "./builder.js";
import { scanGraph } from "./scanner.js";

export interface ProjectGraphResult {
  graph: SpecGraph;
  scan: ScanResult;
}

export async function buildProjectGraph(
  projectRoot: string,
  openspec: OpenSpecClient,
  files: FileSystem,
): Promise<ProjectGraphResult> {
  const scan = await scanGraph(projectRoot, openspec, files);
  return { graph: buildGraph(scan), scan };
}
