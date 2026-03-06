import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * هذا الملف يُستخدم فقط لتشغيل Vitest.
 * Next.js يتولى البناء والتطوير عبر next.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts", "src/**/*.tsx", "server/**/*.mjs"],
      exclude: ["src/main.tsx"],
    },
  },
});
