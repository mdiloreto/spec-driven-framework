// -- Spec Graph Types --

export const EDGE_KINDS = [
  "depends_on",
  "impacts",
  "extends",
  "blocks",
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];
export type GraphNodeType = "capability" | "change";
export type GraphId = string & { readonly __brand: "GraphId" };

export function createGraphId(type: GraphNodeType, slug: string): GraphId {
  if (!slug || slug.includes(":")) {
    throw new Error(`Invalid graph node slug: ${slug}`);
  }
  return `${type}:${slug}` as GraphId;
}

export function isGraphId(value: string): value is GraphId {
  return /^(capability|change):[^:]+$/.test(value);
}

export interface GraphNode {
  id: GraphId;
  slug: string;
  type: GraphNodeType;
  path: string;
  status?: "active" | "archived";
  artifacts?: {
    proposal: boolean;
    design: boolean;
    specs: boolean;
    tasks: boolean;
  };
}

export interface GraphEdge {
  from: GraphId;
  to: GraphId;
  kind: EdgeKind;
  reason?: string;
}

export interface SpecGraph {
  version: "1.0";
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// -- Scanner Types --

export interface RawNode {
  id: GraphId;
  slug: string;
  type: GraphNodeType;
  path: string;
  status?: "active" | "archived";
  artifacts?: {
    proposal: boolean;
    design: boolean;
    specs: boolean;
    tasks: boolean;
  };
}

export interface RawEdge {
  from: GraphId;
  to: GraphId;
  kind: EdgeKind;
  reason?: string;
}

export interface ScanResult {
  nodes: RawNode[];
  edges: RawEdge[];
  warnings: string[];
}

// -- Frontmatter Types --

export interface DependencyDeclaration {
  capability?: string;
  change?: string;
  kind: EdgeKind;
}

// -- Analysis Types --

export interface ImpactResult {
  changed: GraphId[];
  upstreamContext: GraphId[];
  downstreamAffected: GraphId[];
}

export type WaveGroup = GraphNode[][];

// -- I/O Injection --

export interface FileReader {
  readFile(path: string): string;
  listDir(path: string): string[];
  exists(path: string): boolean;
}
