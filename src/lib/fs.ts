import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import type { FileSystem } from "../types/index.js";

/**
 * Production FileSystem backed by Node.js fs.
 * Inject MemoryFileSystem in tests for isolation.
 */
export class NodeFileSystem implements FileSystem {
  public readFile(path: string): string {
    return readFileSync(path, "utf-8");
  }

  public writeFile(path: string, content: string): void {
    writeFileSync(path, content, "utf-8");
  }

  public exists(path: string): boolean {
    return existsSync(path);
  }

  public listDir(path: string): string[] {
    return readdirSync(path);
  }
}
