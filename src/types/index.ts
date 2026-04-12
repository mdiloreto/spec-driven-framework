// -- Shared Types --

export interface FileSystem {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
  listDir(path: string): string[];
}

export type ArtifactKind = "proposal" | "design" | "specs" | "tasks";

// -- Re-exports --

export * from "./graph";
export * from "./ilo";
export * from "./openspec";
