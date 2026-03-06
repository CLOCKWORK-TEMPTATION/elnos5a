import { defineConfig, devices } from "@playwright/test";

const configuredBaseUrl =
  process.env.E2E_TARGET_URL?.trim() ||
  process.env.APP_BASE_URL?.trim() ||
  "http://localhost:3000";

const shouldUseExternalTarget =
  Boolean(process.env.E2E_TARGET_URL?.trim()) ||
  Boolean(process.env.APP_BASE_URL?.trim());

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/*.e2e.test.ts", "**/*.e2e.spec.ts"],
  fullyParallel: false,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["html", { outputFolder: "./test-results/playwright-report" }],
    ["list"],
  ],
  outputDir: "./test-results/playwright-artifacts",
  use: {
    baseURL: configuredBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: shouldUseExternalTarget
    ? undefined
    : {
        command: "pnpm run dev:app",
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
