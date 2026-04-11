import { describe, it, expect } from "vitest";
import { parseArgs, getFlag, hasFlag } from "../args.js";

describe("parseArgs", () => {
  it("parses positional arguments", () => {
    const result = parseArgs(["ilo", "run"]);
    expect(result.positional).toEqual(["ilo", "run"]);
  });

  it("parses --key value flags", () => {
    const result = parseArgs(["ilo", "run", "--change", "add-auth"]);
    expect(getFlag(result, "change")).toBe("add-auth");
    expect(result.positional).toEqual(["ilo", "run"]);
  });

  it("parses boolean flags", () => {
    const result = parseArgs(["ilo", "run", "--dry-run", "--json"]);
    expect(hasFlag(result, "dry-run")).toBe(true);
    expect(hasFlag(result, "json")).toBe(true);
    expect(hasFlag(result, "verbose")).toBe(false);
  });

  it("handles mixed positional and flags", () => {
    const result = parseArgs(["ilo", "check", "--change", "test", "--json"]);
    expect(result.positional).toEqual(["ilo", "check"]);
    expect(getFlag(result, "change")).toBe("test");
    expect(hasFlag(result, "json")).toBe(true);
  });

  it("returns undefined for missing key flags", () => {
    const result = parseArgs(["ilo", "run"]);
    expect(getFlag(result, "change")).toBeUndefined();
  });
});
