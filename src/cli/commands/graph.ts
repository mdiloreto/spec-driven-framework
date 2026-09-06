import { isAbsolute, relative, resolve } from "node:path";
import { OpenSpecCLIClient } from "../../clients/index.js";
import {
  buildProjectGraph,
  changeSubgraph,
  computeImpact,
  detectCycles,
  groupWaves,
  isManifestStale,
  readManifest,
  writeManifest,
} from "../../graph/index.js";
import { NodeFileSystem } from "../../lib/index.js";
import type { FileSystem, GraphId, GraphNode, OpenSpecClient, SpecGraph } from "../../types/index.js";
import { isGraphId } from "../../types/index.js";
import type { ParsedArgs } from "../args.js";
import { getFlags, hasFlag } from "../args.js";

export class GraphCommand {
  private readonly projectRoot: string;
  private readonly files: FileSystem;
  private readonly openspec: OpenSpecClient;

  constructor(options: {
    cwd?: string;
    files?: FileSystem;
    openspec?: OpenSpecClient;
  } = {}) {
    this.projectRoot = resolve(options.cwd ?? process.cwd());
    this.files = options.files ?? new NodeFileSystem();
    this.openspec = options.openspec ?? new OpenSpecCLIClient({ cwd: this.projectRoot });
  }

  public async execute(args: ParsedArgs): Promise<void> {
    switch (args.positional[1]) {
      case "build":
        return this.build(args);
      case "impact":
        return this.impact(args);
      case "order":
        return this.order(args);
      case "show":
        return this.show(args);
      default:
        throw new Error("Usage: sdf graph <build|impact|order|show>");
    }
  }

  private async build(args: ParsedArgs): Promise<void> {
    this.ensureOpenSpecProject();
    const { graph, scan } = await buildProjectGraph(
      this.projectRoot,
      this.openspec,
      this.files,
    );
    writeManifest(this.files, this.projectRoot, graph);

    const cycles = detectCycles(graph).map((id) => this.nodeSlug(graph, id));
    const result = {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      warnings: scan.warnings,
      cycles,
    };

    if (hasFlag(args, "json")) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Built graph: ${result.nodes} nodes, ${result.edges} edges`);
    for (const warning of scan.warnings) console.warn(`Warning: ${warning}`);
    if (cycles.length > 0) console.warn(`Warning: graph cycles detected: ${cycles.join(", ")}`);
  }

  private async impact(args: ParsedArgs): Promise<void> {
    const changedValues = getFlags(args, "changed");
    if (changedValues.length === 0) {
      throw new Error("graph impact requires at least one --changed <path>");
    }
    const graph = this.loadGraph();
    const changed = changedValues
      .map((value) => this.resolveNode(graph, value))
      .filter((node): node is GraphNode => node !== undefined)
      .map((node) => node.id);
    const missing = changedValues.length - changed.length;
    if (missing > 0) console.warn(`Warning: ${missing} changed path(s) did not match graph nodes`);

    const result = computeImpact(graph, changed);
    const output = {
      changed: result.changed.map((id) => this.nodeSlug(graph, id)),
      upstreamContext: result.upstreamContext.map((id) => this.nodeSlug(graph, id)),
      downstreamAffected: result.downstreamAffected.map((id) => this.nodeSlug(graph, id)),
    };
    console.log(JSON.stringify(output, null, 2));
  }

  private async order(args: ParsedArgs): Promise<void> {
    const graph = this.loadGraph();
    const waves = groupWaves(changeSubgraph(graph)).map((wave) =>
      wave.map((node) => node.slug));

    if (hasFlag(args, "json")) {
      console.log(JSON.stringify(waves, null, 2));
      return;
    }
    waves.forEach((wave, index) => console.log(`Wave ${index}: ${wave.join(", ")}`));
  }

  private async show(args: ParsedArgs): Promise<void> {
    const graph = this.loadGraph();
    if (hasFlag(args, "json")) {
      console.log(JSON.stringify(graph, null, 2));
      return;
    }

    const capabilities = graph.nodes.filter((node) => node.type === "capability");
    const changes = graph.nodes.filter((node) => node.type === "change");
    console.log(`Capabilities (${capabilities.length}): ${capabilities.map((node) => node.slug).join(", ")}`);
    console.log(`Changes (${changes.length}): ${changes.map((node) => node.slug).join(", ")}`);
    console.log(`Edges: ${graph.edges.length}`);
  }

  private loadGraph(): SpecGraph {
    const graph = readManifest(this.files, this.projectRoot);
    if (isManifestStale(this.files, this.projectRoot)) {
      console.warn("Graph may be stale. Run 'sdf graph build' to refresh.");
    }
    return graph;
  }

  private resolveNode(graph: SpecGraph, value: string): GraphNode | undefined {
    if (isGraphId(value)) return graph.nodes.find((node) => node.id === value);

    const normalized = (isAbsolute(value) ? relative(this.projectRoot, value) : value)
      .replaceAll("\\", "/")
      .replace(/^\.\//, "");
    return graph.nodes.find(
      (node) =>
        node.slug === normalized ||
        node.path === normalized ||
        normalized === `${node.path}/spec.md` ||
        normalized.startsWith(`${node.path}/`),
    );
  }

  private nodeSlug(graph: SpecGraph, id: GraphId): string {
    return graph.nodes.find((node) => node.id === id)?.slug ?? id;
  }

  private ensureOpenSpecProject(): void {
    if (!this.files.exists(resolve(this.projectRoot, "openspec"))) {
      throw new Error(`OpenSpec directory not found in ${this.projectRoot}`);
    }
  }
}
