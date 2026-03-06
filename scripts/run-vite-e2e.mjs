import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const backendBaseUrl =
  process.env.E2E_BACKEND_BASE_URL || "http://127.0.0.1:18987";
const backendExtractUrl = `${backendBaseUrl}/api/file-extract`;
const backendReviewUrl = `${backendBaseUrl}/api/agent/review`;
const viteEntry = resolve(process.cwd(), "node_modules/vite/bin/vite.js");
const e2eHost = process.env.E2E_HOST || "127.0.0.1";
const e2ePort = process.env.E2E_PORT || "5174";

const child = spawn(
  process.execPath,
  [viteEntry, "--host", e2eHost, "--port", e2ePort],
  {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      VITE_FILE_IMPORT_BACKEND_URL: backendExtractUrl,
      VITE_AGENT_REVIEW_BACKEND_URL: backendReviewUrl,
    },
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
