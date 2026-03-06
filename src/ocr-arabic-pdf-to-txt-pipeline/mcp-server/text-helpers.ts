/**
 * @description أدوات مساعدة للنصوص ومعالجة الأحرف العربية
 */

import { access, readFile } from "node:fs/promises";
import process from "node:process";
import { log } from "./ocr-logger.js";
import type { JsonRecord, NamedReplacement } from "./types.js";

export const CRITICAL_OCR_REPLACEMENTS: ReadonlyArray<NamedReplacement> = [
  { wrong: "مسـاهد", correct: "مشهد", label: "مشهد" },
  { wrong: "مساهد", correct: "مشهد", label: "مشهد" },
  { wrong: "نشـقـة", correct: "شقة", label: "شقة" },
  { wrong: "نشقة", correct: "شقة", label: "شقة" },
  { wrong: "الصـالة", correct: "الصالة", label: "الصالة" },
  { wrong: "ام ام", correct: "إم إم", label: "همزات إم إم" },
  { wrong: "ابونا", correct: "أبونا", label: "همزة أبونا" },
  { wrong: "رينا", correct: "ربنا", label: "ربنا" },
  { wrong: "الضياع", correct: "الضباع", label: "الضباع" },
  { wrong: "جنة كل واحد", correct: "جتة كل واحد", label: "جتة" },
  { wrong: "ردهوش", correct: "ردهووش", label: "ردهووش" },
  { wrong: "هتشال", correct: "هتتشال", label: "هتتشال" },
  { wrong: "تتسوش", correct: "تنسوش", label: "تنسوش" },
  { wrong: "هنتم", correct: "هنتلم", label: "هنتلم" },
  { wrong: "دوفنا", correct: "دوقنا", label: "دوقنا" },
  { wrong: "ونتم", correct: "ونتلم", label: "ونتلم" },
  { wrong: "هيرجعي", correct: "هيرجعلي", label: "هيرجعلي" },
  { wrong: "بعينها", correct: "يعينها", label: "يعينها" },
  { wrong: "لتنتظر", correct: "لتنظ ر", label: "لتنظ ر" },
  { wrong: "مالكن", correct: "مالكش", label: "مالكش" },
  { wrong: "هيدينا", correct: "وهيودينا", label: "وهيودينا" },
  { wrong: "ينكي", correct: "بنكي", label: "بنكي" },
  { wrong: "اختلفشاش", correct: "اختلفناش", label: "اختلفناش" },
  { wrong: "وسايبيني", correct: "وسايبني", label: "وسايبني" },
];

const MISTRAL_HTTP_RETRY_BASE_MS = Math.max(
  100,
  Number.parseInt(process.env.MISTRAL_HTTP_RETRY_BASE_MS ?? "500", 10) || 500
);

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isTruthy(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadEnvFile(envPath: string): Promise<void> {
  if (!(await fileExists(envPath))) {
    return;
  }

  try {
    const content = await readFile(envPath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }

      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      const value = line
        .slice(i + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }

    log("INFO", "تم تحميل متغيرات البيئة من: %s", envPath);
  } catch (error) {
    log("WARN", "تعذر تحميل ملف البيئة %s: %s", envPath, String(error));
  }
}

export function getEnvOrRaise(key: string, message?: string): string {
  const value = (process.env[key] ?? "").trim();
  if (!value) {
    throw new Error(
      message ?? `متغير ${key} غير موجود. أضف المفتاح في البيئة أو في ملف .env`
    );
  }
  return value;
}

export function ensureMistralApiKey(raw: string): string {
  const apiKey = raw.trim();
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY غير موجود.");
  }
  if (/\s/u.test(apiKey)) {
    throw new Error("MISTRAL_API_KEY غير صالح: يحتوي على مسافات.");
  }
  return apiKey;
}

export function ensureKimiApiKey(raw: string): string {
  const apiKey = raw.trim();
  if (!apiKey) {
    throw new Error("MOONSHOT_API_KEY غير موجود.");
  }
  if (/\s/u.test(apiKey)) {
    throw new Error("MOONSHOT_API_KEY غير صالح: يحتوي على مسافات.");
  }
  return apiKey;
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isRetryableRequestError(
  error: unknown,
  didTimeout?: () => boolean
): boolean {
  if (didTimeout?.()) {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return true;
    }
    const lower = error.message.toLowerCase();
    if (
      lower.includes("fetch failed") ||
      lower.includes("network") ||
      lower.includes("timed out")
    ) {
      return true;
    }
  }
  return false;
}

export function retryDelayMs(attempt: number): number {
  const base = MISTRAL_HTTP_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.round(Math.random() * 100);
  return base + jitter;
}

export function createTimeoutState(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const hasAbortSignalTimeout =
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as unknown as { timeout?: unknown }).timeout ===
      "function";

  if (hasAbortSignalTimeout) {
    const timeoutSignal = (
      AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }
    ).timeout(timeoutMs);
    return {
      signal: timeoutSignal,
      cleanup: () => undefined,
      didTimeout: () => timeoutSignal.aborted,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
    didTimeout: () => controller.signal.aborted,
  };
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function field<T>(obj: unknown, name: string, fallback: T): T {
  if (obj && typeof obj === "object" && name in (obj as JsonRecord)) {
    const value = (obj as JsonRecord)[name] as T;
    return value ?? fallback;
  }
  return fallback;
}

export function str(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toNumberInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) ? v : fallback;
}

export function toNumberFloat(
  raw: string | undefined,
  fallback: number
): number {
  if (!raw) {
    return fallback;
  }
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

const HINDI_TO_ARABIC_DIGITS: Readonly<Record<string, string>> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

const SCENE_HEADER_VARIANTS_PATTERN =
  "(?:مشهد|مشـهد|مشاهد|مشـاهد|مسـاهد|مساهد|مسـ|مسهد|مساحة|scene)";

export const SCENE_HEADER_LINE_PATTERN = new RegExp(
  `^\\s*(?:#+\\s*)?(?:[٠١٢٣٤٥٦٧٨٩0-9]+\\s+)?${SCENE_HEADER_VARIANTS_PATTERN}\\s*([٠١٢٣٤٥٦٧٨٩0-9]+)\\b\\s*(.*)$`,
  "iu"
);

export function normalizeHindiDigitsToWestern(text: string): string {
  return text.replace(
    /[٠١٢٣٤٥٦٧٨٩]/g,
    (digit) => HINDI_TO_ARABIC_DIGITS[digit] ?? digit
  );
}

export function normalizeSceneHeadersRobust(
  text: string,
  onNormalized?: (sceneHeader: string) => void
): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = line.match(SCENE_HEADER_LINE_PATTERN);
    if (!match) {
      out.push(line);
      continue;
    }

    const sceneNumber = normalizeHindiDigitsToWestern(match[1] ?? "").trim();
    if (!sceneNumber) {
      out.push(line);
      continue;
    }

    const normalizedHeader = `مشهد${sceneNumber}`;
    onNormalized?.(normalizedHeader);
    out.push(normalizedHeader);

    const tail = (match[2] ?? "").trim();
    if (tail) {
      out.push(tail);
    }
  }

  return out.join("\n");
}
