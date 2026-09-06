import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "types/index": "src/types/index.ts",
    "clients/index": "src/clients/index.ts",
    "services/index": "src/services/index.ts",
    "lib/index": "src/lib/index.ts",
    cli: "src/cli/main.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  target: "node20",
  shims: false,
});
