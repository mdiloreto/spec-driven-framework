import { join } from "node:path";
import type {
  FileSystem,
  ContextBundle,
  SpecContent,
  ChangeContent,
  TaskItem,
  OpenSpecClient,
  SpecGraph,
  GraphNode,
  GraphEdge,
} from "../types/index.js";

export interface ContextAssemblerOptions {
  maxTokens?: number;
  format?: "json" | "markdown";
}

/**
 * Assembles cross-change, spec-graph-aware context bundles for agent task execution.
 *
 * Delegates within-change context to OpenSpec (`openspec instructions --json`).
 * Adds what OpenSpec cannot: upstream context from the spec-graph, downstream
 * awareness, and task-level context targeting.
 */
export class ContextAssembler {
  constructor(
    private readonly fs: FileSystem,
    private readonly graph: SpecGraph,
    /** Used for within-change context delegation via `openspec instructions` */
    public readonly openspec?: OpenSpecClient,
  ) {}

  public async assemble(
    changePath: string,
    changeName: string,
    task: TaskItem,
    options: ContextAssemblerOptions = {},
  ): Promise<ContextBundle> {
    const proposal = this.readArtifact(changePath, "proposal.md");
    const design = this.readArtifact(changePath, "design.md");
    const specs = this.readSpecFiles(changePath);
    const upstreamSpecs = this.gatherUpstreamSpecs(changeName);
    const upstreamChanges = this.gatherUpstreamChanges(changeName);
    const relatedSpecs = this.gatherDownstreamSpecs(changeName);

    let bundle: ContextBundle = {
      task: { id: task.id, description: task.description, fromChange: changeName },
      proposal,
      design,
      specs,
      upstreamContext: { specs: upstreamSpecs, changes: upstreamChanges },
      relatedSpecs,
    };

    if (options.maxTokens) {
      bundle = this.truncateToFit(bundle, options.maxTokens);
    }

    return bundle;
  }

  public formatAsMarkdown(bundle: ContextBundle): string {
    const sections: string[] = [];

    sections.push(`# Task: ${bundle.task.id}\n`);
    sections.push(`**Change:** ${bundle.task.fromChange}`);
    sections.push(`**Description:** ${bundle.task.description}\n`);

    sections.push("# Proposal\n");
    sections.push(bundle.proposal || "_No proposal found._");
    sections.push("");

    sections.push("# Design\n");
    sections.push(bundle.design || "_No design found._");
    sections.push("");

    if (bundle.specs.length > 0) {
      sections.push("# Specs\n");
      for (const spec of bundle.specs) {
        sections.push(spec);
        sections.push("\n---\n");
      }
    }

    if (bundle.upstreamContext.specs.length > 0) {
      sections.push("# Upstream Specs (dependencies)\n");
      for (const spec of bundle.upstreamContext.specs) {
        sections.push(`## ${spec.id}\n`);
        sections.push(spec.content);
        sections.push("\n---\n");
      }
    }

    if (bundle.upstreamContext.changes.length > 0) {
      sections.push("# Upstream Changes (dependencies)\n");
      for (const change of bundle.upstreamContext.changes) {
        sections.push(`## ${change.name}\n`);
        if (change.proposal) sections.push(change.proposal);
        sections.push("");
      }
    }

    if (bundle.relatedSpecs.length > 0) {
      sections.push("# Related Specs (downstream — for awareness)\n");
      for (const spec of bundle.relatedSpecs) {
        sections.push(`## ${spec.id}\n`);
        sections.push(spec.content);
        sections.push("\n---\n");
      }
    }

    if (bundle.truncated) {
      sections.push("# Note\n");
      sections.push("Context was truncated to fit token budget.");
      if (bundle.omittedSources && bundle.omittedSources.length > 0) {
        sections.push(`Omitted sources: ${bundle.omittedSources.join(", ")}`);
      }
    }

    return sections.join("\n");
  }

  // -- Graph traversal --

  private gatherUpstreamSpecs(changeName: string): SpecContent[] {
    const upstreamIds = this.findUpstream(changeName);
    const capabilityNodes = upstreamIds
      .map((id) => this.findNode(id))
      .filter((n): n is GraphNode => n !== undefined && n.type === "capability");

    return capabilityNodes.map((node) => this.readSpecContent(node));
  }

  private gatherUpstreamChanges(changeName: string): ChangeContent[] {
    const upstreamIds = this.findUpstream(changeName);
    const changeNodes = upstreamIds
      .map((id) => this.findNode(id))
      .filter((n): n is GraphNode => n !== undefined && n.type === "change");

    return changeNodes.map((node) => this.readChangeContent(node));
  }

  private gatherDownstreamSpecs(changeName: string): SpecContent[] {
    const downstreamIds = this.findDownstream(changeName);
    const capabilityNodes = downstreamIds
      .map((id) => this.findNode(id))
      .filter((n): n is GraphNode => n !== undefined && n.type === "capability");

    return capabilityNodes.map((node) => this.readSpecContent(node));
  }

  private findUpstream(nodeId: string): string[] {
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Follow outgoing depends_on/blocks edges: from -> to means "from depends on to"
      const dependencyEdges = this.graph.edges.filter(
        (e) => e.from === current && isOrderingEdge(e),
      );
      for (const edge of dependencyEdges) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }

    return [...visited];
  }

  private findDownstream(nodeId: string): string[] {
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Follow reverse edges: find nodes that depend ON current
      const dependentEdges = this.graph.edges.filter((e) => e.to === current);
      for (const edge of dependentEdges) {
        if (!visited.has(edge.from)) {
          visited.add(edge.from);
          queue.push(edge.from);
        }
      }
    }

    return [...visited];
  }

  private findNode(id: string): GraphNode | undefined {
    return this.graph.nodes.find((n) => n.id === id);
  }

  // -- File reading --

  private readArtifact(changePath: string, filename: string): string {
    const filePath = join(changePath, filename);
    try {
      return this.fs.readFile(filePath);
    } catch {
      return "";
    }
  }

  private readSpecFiles(changePath: string): string[] {
    const specsDir = join(changePath, "specs");
    const filePaths = this.collectSpecFiles(specsDir);
    return filePaths.map((f) => {
      try {
        return this.fs.readFile(f);
      } catch {
        return "";
      }
    }).filter(Boolean);
  }

  /** Collect .md files from specs/ and one level of subdirectories. */
  private collectSpecFiles(specsDir: string): string[] {
    let entries: string[];
    try {
      entries = this.fs.listDir(specsDir);
    } catch {
      return [];
    }

    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = join(specsDir, entry);
      if (entry.endsWith(".md")) {
        files.push(entryPath);
      } else {
        let subEntries: string[];
        try {
          subEntries = this.fs.listDir(entryPath);
        } catch {
          continue;
        }
        for (const sub of subEntries) {
          if (sub.endsWith(".md")) {
            files.push(join(entryPath, sub));
          }
        }
      }
    }
    return files;
  }

  private readSpecContent(node: GraphNode): SpecContent {
    const specPath = join(node.path, "spec.md");
    let content = "";
    try {
      content = this.fs.readFile(specPath);
    } catch {
      // spec file may not exist at this path
    }
    return { id: node.id, path: node.path, content };
  }

  private readChangeContent(node: GraphNode): ChangeContent {
    const result: ChangeContent = { name: node.id, path: node.path };
    try {
      result.proposal = this.fs.readFile(join(node.path, "proposal.md"));
    } catch {
      // optional
    }
    try {
      result.design = this.fs.readFile(join(node.path, "design.md"));
    } catch {
      // optional
    }
    return result;
  }

  // -- Token budget truncation --

  private truncateToFit(bundle: ContextBundle, maxTokens: number): ContextBundle {
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    const coreSize =
      estimateTokens(bundle.proposal) +
      estimateTokens(bundle.design) +
      bundle.specs.reduce((sum, s) => sum + estimateTokens(s), 0) +
      estimateTokens(bundle.task.description);

    let budget = maxTokens - coreSize;
    const omitted: string[] = [];

    let result = { ...bundle };
    if (budget <= 0) {
      omitted.push(...result.relatedSpecs.map((s) => s.id));
      omitted.push(...result.upstreamContext.specs.map((s) => s.id));
      omitted.push(...result.upstreamContext.changes.map((c) => c.name));
      return {
        ...result,
        relatedSpecs: [],
        upstreamContext: { specs: [], changes: [] },
        truncated: true,
        omittedSources: omitted,
      };
    }

    const keptRelated: SpecContent[] = [];
    for (const spec of result.relatedSpecs) {
      const size = estimateTokens(spec.content);
      if (budget >= size) {
        budget -= size;
        keptRelated.push(spec);
      } else {
        omitted.push(spec.id);
      }
    }

    const keptUpstreamSpecs: SpecContent[] = [];
    for (const spec of result.upstreamContext.specs) {
      const size = estimateTokens(spec.content);
      if (budget >= size) {
        budget -= size;
        keptUpstreamSpecs.push(spec);
      } else {
        omitted.push(spec.id);
      }
    }

    const keptUpstreamChanges: ChangeContent[] = [];
    for (const change of result.upstreamContext.changes) {
      const size =
        estimateTokens(change.proposal ?? "") +
        estimateTokens(change.design ?? "");
      if (budget >= size) {
        budget -= size;
        keptUpstreamChanges.push(change);
      } else {
        omitted.push(change.name);
      }
    }

    return {
      ...result,
      relatedSpecs: keptRelated,
      upstreamContext: { specs: keptUpstreamSpecs, changes: keptUpstreamChanges },
      truncated: omitted.length > 0,
      omittedSources: omitted.length > 0 ? omitted : undefined,
    };
  }
}

function isOrderingEdge(edge: GraphEdge): boolean {
  return edge.kind === "depends_on" || edge.kind === "blocks";
}
