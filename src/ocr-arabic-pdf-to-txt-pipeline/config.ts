/**
 * config.ts — تحميل وإدارة إعدادات الوكيل
 *
 * يقرأ متغيرات البيئة من .env ويُعدّ الإعدادات الافتراضية.
 */

import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentConfig } from "./types";

// ─── تحميل متغيرات البيئة ───────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// بحث عن .env في جذر المشروع ثم المجلد الأب
dotenvConfig({ path: resolve(__dirname, "../../.env"), quiet: true });
dotenvConfig({ path: resolve(__dirname, "../../../.env"), quiet: true });

// ─── التحقق من المتطلبات ────────────────────────────────────

/** التحقق من وجود مفاتيح API المطلوبة */
export function validateEnvironment(): { valid: boolean; missing: string[] } {
  const required = ["OPENAI_API_KEY"];
  const recommended = ["MISTRAL_API_KEY"];
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  for (const key of recommended) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  if (warnings.length > 0) {
    console.error(`⚠ مفاتيح موصى بها غير موجودة: ${warnings.join(", ")}`);
  }

  return { valid: missing.length === 0, missing };
}

// ─── بناء الإعدادات ─────────────────────────────────────────

/** بناء إعدادات الوكيل من متغيرات البيئة مع القيم الافتراضية */
export function buildAgentConfig(): AgentConfig {
  const projectRoot = resolve(__dirname, "../..");

  return {
    agentModel: process.env["AGENT_MODEL"] ?? "gpt-4o",
    maxSteps: parseInt(process.env["AGENT_MAX_STEPS"] ?? "10", 10),
    // خادم MCP — داخل البايبلاين في mcp-server/index.ts
    mcpServerPath:
      process.env["MCP_SERVER_PATH"] ??
      resolve(__dirname, "mcp-server", "index.ts"),
    defaultInputDir: process.env["DEFAULT_INPUT_DIR"] ?? resolve(projectRoot),
    defaultOutputDir: process.env["DEFAULT_OUTPUT_DIR"] ?? resolve(projectRoot),
  };
}
