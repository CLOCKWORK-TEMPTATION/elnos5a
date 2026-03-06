#!/usr/bin/env npx tsx
/**
 * ocr-mistral.ts — استخراج النص من PDF عبر Mistral OCR 3
 *
 * الاستخدام:
 *   npx tsx ocr-mistral.ts --input "/path/to/file.pdf" --output "/path/to/result.json"
 *   npx tsx ocr-mistral.ts --input "/path/to/file.pdf" --output "/path/to/result.json" --pages "0-9"
 *
 * المتطلبات:
 *   - متغير البيئة MISTRAL_API_KEY
 *   - حزمة @mistralai/mistralai
 *
 * المخرج: ملف JSON يحتوي نتائج OCR لكل صفحة
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const CANONICAL_MISTRAL_OCR_MODEL = "mistral-ocr-latest";

// ─── أنواع البيانات ───────────────────────────────────────────

interface OcrPageResult {
  /** رقم الصفحة (يبدأ من 0) */
  index: number;
  /** النص المستخرج بصيغة Markdown */
  markdown: string;
  /** الصور المكتشفة في الصفحة */
  images: Array<{
    id: string;
    bbox: {
      top_left_x: number;
      top_left_y: number;
      bottom_right_x: number;
      bottom_right_y: number;
    };
  }>;
}

interface OcrResult {
  /** اسم الملف المصدر */
  source: string;
  /** النموذج المستخدم */
  model: string;
  /** عدد الصفحات المعالجة */
  total_pages: number;
  /** مجموع بايتات المستند */
  doc_size_bytes: number | null;
  /** نتائج كل صفحة */
  pages: OcrPageResult[];
  /** وقت المعالجة بالثواني */
  processing_time_seconds: number;
}

interface MistralOcrImageRaw {
  id?: unknown;
  top_left_x?: unknown;
  top_left_y?: unknown;
  bottom_right_x?: unknown;
  bottom_right_y?: unknown;
}

interface MistralOcrPageRaw {
  index?: unknown;
  markdown?: unknown;
  images?: unknown;
}

interface MistralOcrResponseRaw {
  model?: unknown;
  pages?: unknown;
  usage_info?: unknown;
}

interface MistralOcrRequest {
  model: string;
  document: {
    type: "document_url";
    documentUrl: string;
  };
  includeImageBase64: boolean;
  tableFormat: "markdown" | "html";
  pages?: number[];
}

// ─── تحليل المعاملات ──────────────────────────────────────────

function parseArgs(): {
  input: string;
  output: string;
  pages: number[] | null;
} {
  const args = process.argv.slice(2);
  let input = "";
  let output = "";
  let pagesStr = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) input = args[++i];
    else if (args[i] === "--output" && args[i + 1]) output = args[++i];
    else if (args[i] === "--pages" && args[i + 1]) pagesStr = args[++i];
  }

  if (!input || !output) {
    console.error(
      "الاستخدام: npx tsx ocr-mistral.ts --input <pdf> --output <json> [--pages 0-9|all]"
    );
    process.exit(1);
  }

  // تحليل نطاق الصفحات
  let pages: number[] | null = null;
  if (pagesStr && pagesStr !== "all") {
    const match = pagesStr.match(/^(\d+)-(\d+)$/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    } else {
      // أرقام مفصولة بفاصلة
      pages = pagesStr.split(",").map((s) => parseInt(s.trim(), 10));
    }
  }

  return { input, output, pages };
}

// ─── المنطق الرئيسي ──────────────────────────────────────────

function requireApiKey(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) {
    throw new Error("خطأ: متغير البيئة MISTRAL_API_KEY غير موجود");
  }
  if (/\s/u.test(value)) {
    throw new Error("خطأ: قيمة MISTRAL_API_KEY غير صالحة (تحتوي مسافات)");
  }
  return value;
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function toNumberOrNull(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeImages(images: unknown): OcrPageResult["images"] {
  if (!Array.isArray(images)) return [];
  const mapped: OcrPageResult["images"] = [];

  for (const image of images) {
    if (!image || typeof image !== "object") {
      continue;
    }
    const raw = image as MistralOcrImageRaw;
    mapped.push({
      id: typeof raw.id === "string" ? raw.id : "",
      bbox: {
        top_left_x: toInt(raw.top_left_x, 0),
        top_left_y: toInt(raw.top_left_y, 0),
        bottom_right_x: toInt(raw.bottom_right_x, 0),
        bottom_right_y: toInt(raw.bottom_right_y, 0),
      },
    });
  }

  return mapped;
}

function buildNormalizedResult(
  inputPath: string,
  response: MistralOcrResponseRaw,
  docSizeBytes: number,
  elapsedSeconds: number
): OcrResult {
  const pagesRaw = Array.isArray(response.pages) ? response.pages : [];
  const usageInfo =
    response.usage_info && typeof response.usage_info === "object"
      ? (response.usage_info as Record<string, unknown>)
      : undefined;

  const result: OcrResult = {
    source: basename(inputPath),
    model:
      typeof response.model === "string"
        ? response.model
        : "mistral-ocr-latest",
    total_pages: pagesRaw.length,
    doc_size_bytes: toNumberOrNull(usageInfo?.doc_size_bytes, docSizeBytes),
    processing_time_seconds: Math.round(elapsedSeconds * 100) / 100,
    pages: [],
  };

  for (const page of pagesRaw) {
    if (!page || typeof page !== "object") {
      continue;
    }
    const rawPage = page as MistralOcrPageRaw;
    result.pages.push({
      index: toInt(rawPage.index, 0),
      markdown: typeof rawPage.markdown === "string" ? rawPage.markdown : "",
      images: normalizeImages(rawPage.images),
    });
  }

  return result;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  const candidates = [e.statusCode, e.status, e.code];
  for (const value of candidates) {
    const asNumber = Number(value);
    if (Number.isInteger(asNumber)) {
      return asNumber;
    }
  }
  return null;
}

function resolveHardLockedModel(raw: string | undefined): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return CANONICAL_MISTRAL_OCR_MODEL;
  }
  const normalized = raw.trim();
  if (normalized !== CANONICAL_MISTRAL_OCR_MODEL) {
    throw new Error(
      `MISTRAL_OCR_MODEL must be ${CANONICAL_MISTRAL_OCR_MODEL}. القيمة الحالية: ${normalized}`
    );
  }
  return CANONICAL_MISTRAL_OCR_MODEL;
}

async function runOcr(): Promise<void> {
  const { input, output, pages } = parseArgs();

  const model = resolveHardLockedModel(process.env["MISTRAL_OCR_MODEL"]);
  const timeoutMs = Math.max(
    1_000,
    Number.parseInt(process.env["MISTRAL_OCR_TIMEOUT_MS"] ?? "600000", 10) ||
      600_000
  );

  let apiKey = "";
  try {
    apiKey = requireApiKey(process.env["MISTRAL_API_KEY"]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // استيراد ديناميكي لـ Mistral SDK
  const { Mistral } = await import("@mistralai/mistralai");
  const client = new Mistral({ apiKey });

  // قراءة PDF وتحويله لـ base64
  console.error(`قراءة الملف: ${input}`);
  const pdfBuffer = readFileSync(input);
  const base64Pdf = pdfBuffer.toString("base64");
  const docSizeBytes = pdfBuffer.byteLength;

  console.error(`حجم الملف: ${(docSizeBytes / 1024 / 1024).toFixed(2)} MB`);

  // فحص حد الحجم
  if (docSizeBytes > 50 * 1024 * 1024) {
    console.error("تحذير: الملف أكبر من 50MB — قد يرفضه Mistral API");
  }

  // بناء طلب OCR
  const ocrParams: MistralOcrRequest = {
    model,
    document: {
      type: "document_url",
      documentUrl: `data:application/pdf;base64,${base64Pdf}`,
    },
    includeImageBase64: false,
    tableFormat: "markdown",
  };

  if (pages !== null) {
    ocrParams.pages = pages;
    console.error(`معالجة صفحات محددة: ${pages.join(", ")}`);
  } else {
    console.error("معالجة كل الصفحات...");
  }

  // تنفيذ OCR
  const startTime = Date.now();

  try {
    const response = await withTimeout(
      client.ocr.process(ocrParams),
      timeoutMs,
      `انتهت مهلة استدعاء OCR بعد ${timeoutMs}ms`
    );
    const elapsed = (Date.now() - startTime) / 1000;

    const result = buildNormalizedResult(
      input,
      response as unknown as MistralOcrResponseRaw,
      docSizeBytes,
      elapsed
    );

    // كتابة النتيجة
    writeFileSync(output, JSON.stringify(result, null, 2), "utf-8");
    console.error(
      `تمت المعالجة: ${result.total_pages} صفحة في ${elapsed.toFixed(1)} ثانية`
    );
    console.error(`المخرج: ${output}`);

    // إخراج ملخص على stdout
    console.log(
      JSON.stringify({
        success: true,
        pages_processed: result.total_pages,
        model: result.model,
        time_seconds: result.processing_time_seconds,
        output_path: output,
      })
    );
  } catch (error: unknown) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`فشل OCR بعد ${elapsed.toFixed(1)} ثانية`);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`الخطأ: ${errorMessage}`);

    // محاولة تحديد نوع الخطأ
    const statusCode = getStatusCode(error);
    if (statusCode === 401) {
      console.error("→ مفتاح API غير صالح");
    } else if (statusCode === 413) {
      console.error("→ الملف أكبر من الحد المسموح");
    } else if (statusCode === 429) {
      console.error("→ تجاوز حد الطلبات — انتظر ثم أعد المحاولة");
    }

    console.log(
      JSON.stringify({
        success: false,
        error: errorMessage,
        status_code: statusCode ?? null,
      })
    );
    process.exit(1);
  }
}

runOcr();
