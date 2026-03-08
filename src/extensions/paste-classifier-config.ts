/**
 * @module extensions/paste-classifier-config
 * @description ثوابت وإعدادات مصنف اللصق التلقائي
 */

import { MODEL_ID as AGENT_MODEL_ID } from "./Arabic-Screenplay-Classifier-Agent";
import { logger } from "../utils/logger";
import type { LineType } from "../types";

/** رقم نسخة Command API — v2 */
export const COMMAND_API_VERSION = "2.0" as const;

/** نمط التصنيف: Backend review required قبل تطبيق الإدراج */
export const CLASSIFICATION_MODE = "auto-apply" as const;

export const AGENT_REVIEW_MODEL = AGENT_MODEL_ID;
export const AGENT_REVIEW_DEADLINE_MS = 90_000;
export const AGENT_REVIEW_MAX_ATTEMPTS = 4;
export const AGENT_REVIEW_MAX_RATIO = 1.0;
export const AGENT_REVIEW_MIN_TIMEOUT_MS = 1_500;
export const AGENT_REVIEW_MAX_TIMEOUT_MS = 90_000;
export const AGENT_REVIEW_RETRY_DELAY_MS = 450;
export const FALLBACK_ITEM_ID_PREFIX = "fallback-item";

export const PASTE_CLASSIFIER_ERROR_EVENT = "paste-classifier:error";

export const agentReviewLogger = logger.createScope("paste.agent-review");

export const resolveAgentReviewFailOpen = (): boolean => {
  const rawValue = (
    process.env.NEXT_PUBLIC_AGENT_REVIEW_FAIL_OPEN as string | undefined
  )
    ?.trim()
    .toLowerCase();
  if (!rawValue) return false;
  return !["0", "false", "off", "no"].includes(rawValue);
};

export const AGENT_REVIEW_FAIL_OPEN = resolveAgentReviewFailOpen();

export const OCR_ARTIFACT_SEPARATOR_RE = /^\s*={20,}\s*$/u;
export const OCR_ARTIFACT_PAGE_RE = /^\s*الصفحة\s+[0-9٠-٩]+\s*$/u;

export const isOcrArtifactLine = (line: string): boolean =>
  OCR_ARTIFACT_SEPARATOR_RE.test(line) || OCR_ARTIFACT_PAGE_RE.test(line);

export const sanitizeOcrArtifactsForClassification = (
  text: string
): { sanitizedText: string; removedLines: number } => {
  const lines = text.split(/\r?\n/u);
  if (lines.length === 0) {
    return { sanitizedText: text, removedLines: 0 };
  }

  let removedLines = 0;
  const cleaned: string[] = [];

  const hasNeighborArtifact = (index: number): boolean => {
    const previous = index > 0 ? lines[index - 1] : "";
    const next = index < lines.length - 1 ? lines[index + 1] : "";
    return isOcrArtifactLine(previous) || isOcrArtifactLine(next);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const shouldDrop =
      isOcrArtifactLine(line) ||
      (line.trim().length === 0 && hasNeighborArtifact(index));
    if (shouldDrop) {
      removedLines += 1;
      continue;
    }
    cleaned.push(line);
  }

  return {
    sanitizedText: cleaned.join("\n"),
    removedLines,
  };
};

const normalizeEndpoint = (endpoint: string): string =>
  endpoint.replace(/\/$/, "");

export const resolveAgentReviewEndpoint = (): string => {
  const explicit = (
    process.env.NEXT_PUBLIC_AGENT_REVIEW_BACKEND_URL as string | undefined
  )?.trim();
  if (explicit) return normalizeEndpoint(explicit);

  const fileImportEndpoint =
    (
      process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as string | undefined
    )?.trim() ||
    (process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:8787/api/file-extract"
      : "");
  if (!fileImportEndpoint) return "";

  const normalized = normalizeEndpoint(fileImportEndpoint);
  if (normalized.endsWith("/api/file-extract")) {
    return `${normalized.slice(0, -"/api/file-extract".length)}/api/agent/review`;
  }

  return `${normalized}/api/agent/review`;
};

export const AGENT_REVIEW_ENDPOINT = resolveAgentReviewEndpoint();

export const resolveTextExtractEndpoint = (): string => {
  const fileImportEndpoint =
    (
      process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as string | undefined
    )?.trim() ||
    (process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:8787/api/file-extract"
      : "");
  if (!fileImportEndpoint) return "";

  const normalized = normalizeEndpoint(fileImportEndpoint);
  if (normalized.endsWith("/api/file-extract")) {
    return `${normalized.slice(0, -"/api/file-extract".length)}/api/text-extract`;
  }

  return `${normalized}/api/text-extract`;
};

export const TEXT_EXTRACT_ENDPOINT = resolveTextExtractEndpoint();

export const REVIEWABLE_AGENT_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_top_line",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);

export const VALID_AGENT_DECISION_TYPES = new Set<LineType>([
  ...REVIEWABLE_AGENT_TYPES,
  "scene_header_1",
  "scene_header_2",
]);

// ─── Final Review Constants ──────────────────────────────────────
export const FINAL_REVIEW_ENDPOINT = resolveFinalReviewEndpoint();

/** عتبة ترقية agent-candidate → agent-forced عند alternative-pull */
export const FINAL_REVIEW_PROMOTION_THRESHOLD = 96;

function resolveFinalReviewEndpoint(): string {
  const explicit = (
    process.env.NEXT_PUBLIC_AGENT_REVIEW_BACKEND_URL as string | undefined
  )?.trim();
  if (explicit) {
    const normalized = explicit.replace(/\/$/, "");
    return `${normalized}/api/final-review`;
  }

  const fileImportEndpoint =
    (
      process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as string | undefined
    )?.trim() ||
    (process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:8787/api/file-extract"
      : "");
  if (!fileImportEndpoint) return "";

  const normalized = fileImportEndpoint.replace(/\/$/, "");
  if (normalized.endsWith("/api/file-extract")) {
    return `${normalized.slice(0, -"/api/file-extract".length)}/api/final-review`;
  }

  return `${normalized}/api/final-review`;
}

export { DEFAULT_FINAL_REVIEW_SCHEMA_HINTS } from "../types/final-review";
