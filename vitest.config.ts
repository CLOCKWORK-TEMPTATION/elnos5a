import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    environmentMatchGlobs: [
      ["tests/harness/**", "node"],
      ["tests/integration/server/**", "node"],
      ["tests/unit/server/**", "node"],
      ["tests/integration/pdf-ocr-agent.integration.test.ts", "node"],
    ],
    include: ["tests/**/*.test.ts"],
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
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./test-results/coverage",
      exclude: ["tests/**", "node_modules/**", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
