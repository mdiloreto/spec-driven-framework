// -- Spec Graph Types --

export type EdgeKind = "depends_on" | "impacts" | "extends" | "blocks";

export interface GraphNode {
  id: string;
  type: "capability" | "change";
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
  from: string;
  to: string;
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
  id: string;
  type: "capability" | "change";
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
  from: string;
  to: string;
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
  changed: string[];
  upstreamContext: string[];
  downstreamAffected: string[];
}

export type WaveGroup = GraphNode[][];

// -- I/O Injection --

export interface FileReader {
  readFile(path: string): string;
  listDir(path: string): string[];
  exists(path: string): boolean;
}
