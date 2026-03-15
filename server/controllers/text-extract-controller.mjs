/**
 * @description متحكم استخراج النصوص الموحّد — نقطة الدخول المشتركة لجميع مسارات الاستقبال
 * يُعيد `UnifiedReceptionResponse` متطابقة بغض النظر عن المصدر (paste | doc | docx)
 *
 * FR-016: مهلة 30 ثانية
 * FR-017: تسجيل تفصيلي لمرحلة الاستخراج
 */

import { randomUUID } from "node:crypto";
import { sendJson, readRawBody } from "../utils/http-helpers.mjs";
import { normalizeIncomingText } from "../services/text-normalizer.mjs";
import * as karankBridge from "../karank-bridge.mjs";
import {
  recordStageStart,
  recordStageComplete,
  recordStageFailure,
} from "../utils/pipeline-telemetry.mjs";

const MAX_TEXT_LENGTH = 200_000;
const REQUEST_TIMEOUT_MS = 30_000;
const VALID_SOURCE_TYPES = new Set(["paste", "doc", "docx"]);

/**
 * تشغيل عملية مع مهلة زمنية
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

class TimeoutError extends Error {
  constructor(ms) {
    super(`استغرقت معالجة الخادم وقتاً أطول من المسموح (${ms / 1_000} ثانية).`);
    this.name = "TimeoutError";
    this.code = "TIMEOUT";
  }
}

/**
 * بناء عناصر الاستجابة الموحدة من ناتج المحرك
 * @param {string} normalizedText - النص المُطبَّع
 * @param {Array} schemaElements - عناصر المحرك
 * @returns {Array} عناصر UnifiedReceptionResponse
 */
const buildResponseElements = (normalizedText, schemaElements) => {
  if (schemaElements && schemaElements.length > 0) {
    return schemaElements.map((el, index) => ({
      id: `elem-${index}`,
      originalText: el.value || el.text || "",
      normalizedText: (el.value || el.text || "").trim(),
      suggestedType: el.element || undefined,
      metadata:
        el.confidence != null ? { confidence: el.confidence } : undefined,
    }));
  }

  // إذا لم تتوفر عناصر محرك، يُبنى من أسطر النص
  const lines = normalizedText.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line, index) => ({
    id: `elem-${index}`,
    originalText: line,
    normalizedText: line.trim(),
  }));
};

export const handleTextExtract = async (req, res) => {
  const importOpId = randomUUID();
  const startTime = performance.now();

  try {
    const rawBody = await readRawBody(req);
    const bodyText = rawBody.toString("utf8");

    let parsedBody;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      sendJson(res, 400, {
        error: { code: "INVALID_JSON", message: "Invalid JSON body." },
      });
      return;
    }

    // استخراج وتحقق الحقول
    const content = parsedBody?.content ?? parsedBody?.text;
    if (typeof content !== "string") {
      sendJson(res, 400, {
        error: {
          code: "MISSING_CONTENT",
          message: "الحقل content (أو text) مطلوب ويجب أن يكون نصاً.",
        },
      });
      return;
    }

    const sourceType = VALID_SOURCE_TYPES.has(parsedBody.sourceType)
      ? parsedBody.sourceType
      : "paste";

    const text = normalizeIncomingText(content, MAX_TEXT_LENGTH);
    if (!text.trim()) {
      sendJson(res, 400, {
        error: {
          code: "EMPTY_TEXT",
          message: "النص فارغ بعد التطبيع.",
        },
      });
      return;
    }

    // --- بدء مرحلة الاستخراج (Telemetry) ---
    recordStageStart(importOpId, "extraction", sourceType);

    const timeoutMs = parsedBody.options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

    const engineResult = await withTimeout(
      karankBridge.parseText(text),
      Math.min(timeoutMs, REQUEST_TIMEOUT_MS)
    );

    const schemaText =
      engineResult.schemaText || engineResult.schema_text || "";
    const schemaElements =
      engineResult.schemaElements || engineResult.schema_elements || [];

    const processingTimeMs = Math.round(performance.now() - startTime);

    recordStageComplete(importOpId, "extraction", sourceType);

    // --- بناء الاستجابة الموحدة ---
    /** @type {import('../../src/types/unified-reception').UnifiedReceptionResponse} */
    const response = {
      rawText: schemaText || text,
      elements: buildResponseElements(schemaText || text, schemaElements),
      extractionMeta: {
        sourceType,
        processingTimeMs,
        success: true,
      },
    };

    sendJson(res, 200, response);
  } catch (error) {
    const sourceType = "paste"; // fallback

    if (error instanceof TimeoutError) {
      recordStageFailure(importOpId, "extraction", sourceType, error);
      sendJson(res, 504, {
        error: {
          code: "TIMEOUT",
          message: error.message,
        },
      });
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unknown server error";
    recordStageFailure(importOpId, "extraction", sourceType, error);
    console.error("[text-extract] Error:", message);

    sendJson(res, 500, {
      error: {
        code: "EXTRACTION_FAILED",
        message: `تعذر الاتصال بمحرك التحليل. ${message}`,
      },
    });
  }
};
