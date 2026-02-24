import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // Resolve workspace packages to source so tests run without building packages first (e.g. in CI)
      "@hive-mind/config": resolve(root, "packages/config/src/index.ts"),
      "@hive-mind/shared": resolve(root, "packages/shared/src/index.ts")
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node"
  }
});
