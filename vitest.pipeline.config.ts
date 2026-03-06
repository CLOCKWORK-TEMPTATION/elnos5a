import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    exclude: ["tests/e2e/**"],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    setupFiles: ["./tests/config/vitest-setup.ts"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
    coverage: {
      provider: "v8",
      include: ["src/extensions/**", "src/pipeline/**", "server/**"],
      exclude: ["**/*.d.ts", "**/*.test.ts", "node_modules/**"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./test-results/coverage",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
