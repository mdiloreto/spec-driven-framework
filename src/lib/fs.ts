import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import type { FileSystem } from "../types/index";

/**
 * Production FileSystem backed by Node.js fs.
 * Inject MemoryFileSystem in tests for isolation.
 */
export class NodeFileSystem implements FileSystem {
  public readFile(path: string): string {
    return readFileSync(path, "utf-8");
  }

  public writeFile(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
  }

  public exists(path: string): boolean {
    return existsSync(path);
  }

  public listDir(path: string): string[] {
    return readdirSync(path);
  }

  public modifiedTime(path: string): number {
    return statSync(path).mtimeMs;
  }
}
