import http from "node:http";
import express from "express";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import { corsMiddleware } from "./middlewares/cors.mjs";
import {
  registerRoutes,
  FILE_IMPORT_PREFLIGHT_WARNINGS,
} from "./routes/index.mjs";
import { wait } from "./utils/http-helpers.mjs";
import { destroy as destroyKarankBridge } from "./karank-bridge.mjs";

loadEnv();

const HOST = process.env.FILE_IMPORT_HOST || "127.0.0.1";
const PORT = Number(process.env.FILE_IMPORT_PORT || 8787);

const probeExistingBackendHealth = async () => {
  const healthUrl = `http://${HOST}:${PORT}/health`;
  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      return { ok: false, reason: `status:${response.status}` };
    }

    const payload = await response.json().catch(() => null);
    const isSameService =
      payload?.ok === true && payload?.service === "file-import-backend";

    return isSameService
      ? { ok: true, reason: "matched-health-signature" }
      : { ok: false, reason: "health-signature-mismatch" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "health-probe-failed",
    };
  }
};

const probeExistingBackendWithRetries = async () => {
  const attempts = 4;
  for (let index = 0; index < attempts; index += 1) {
    const result = await probeExistingBackendHealth();
    if (result.ok) {
      return result;
    }
    if (index < attempts - 1) {
      await wait(300);
    }
  }
  return { ok: false, reason: "health-check-exhausted" };
};

const app = express();

app.use(corsMiddleware);

registerRoutes(app);

const server = http.createServer(app);

server.on("error", (error) => {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code !== "EADDRINUSE") {
    console.error("[file-import-backend] failed to start server:", error);
    process.exit(1);
    return;
  }

  void (async () => {
    const probe = await probeExistingBackendWithRetries();
    if (!probe.ok) {
      console.error(
        `[file-import-backend] port ${PORT} is already in use and health check did not match this backend (${probe.reason}).`
      );
      process.exit(1);
      return;
    }

    console.warn(
      `[file-import-backend] detected running backend on http://${HOST}:${PORT}; reusing existing process.`
    );
    process.exit(0);
  })();
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`file-import backend running on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`extract endpoint: http://${HOST}:${PORT}/api/file-extract`);
  // eslint-disable-next-line no-console
  console.log(`text-extract:     http://${HOST}:${PORT}/api/text-extract`);
  // eslint-disable-next-line no-console
  console.log(
    `ai-context:       http://${HOST}:${PORT}/api/ai/context-enhance`
  );
  // eslint-disable-next-line no-console
  console.log(`health:           http://${HOST}:${PORT}/health`);
  if (FILE_IMPORT_PREFLIGHT_WARNINGS.length > 0) {
    console.warn("[antiword preflight] warnings:");
    for (const warning of FILE_IMPORT_PREFLIGHT_WARNINGS) {
      console.warn(`- ${warning}`);
    }
  }
});

const gracefulShutdown = async () => {
  console.warn("[file-import-backend] shutting down...");
  await destroyKarankBridge();
  server.close();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
