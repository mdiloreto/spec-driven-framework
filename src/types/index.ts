// -- Shared Types --

export interface FileSystem {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
  listDir(path: string): string[];
  modifiedTime?(path: string): number;
}

export type ArtifactKind = "proposal" | "design" | "specs" | "tasks";

// -- Re-exports --

export * from "./graph.js";
export * from "./ilo.js";
export * from "./openspec.js";
