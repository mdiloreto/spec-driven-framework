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

  it("parses --key=value flags", () => {
    const result = parseArgs(["ilo", "run", "--change=add-auth", "--format=json"]);
    expect(getFlag(result, "change")).toBe("add-auth");
    expect(getFlag(result, "format")).toBe("json");
    expect(result.positional).toEqual(["ilo", "run"]);
  });

  it("handles --key=value with empty value", () => {
    const result = parseArgs(["--name="]);
    expect(getFlag(result, "name")).toBe("");
  });

  it("handles --key=value with value containing =", () => {
    const result = parseArgs(["--expr=a=b"]);
    expect(getFlag(result, "expr")).toBe("a=b");
  });
});
