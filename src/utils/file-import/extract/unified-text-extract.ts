/**
 * @module utils/file-import/extract/unified-text-extract
 * @description يُرسل النص المُستخرج من ملف DOC/DOCX إلى نقطة `/api/text-extract`
 * للحصول على `UnifiedReceptionResponse`.
 *
 * يُستخدم في مسار استيراد DOC بعد نجاح استخراج النص عبر Backend.
 * يُنفّذ FR-005 (إرسال النص دائماً للخدمة المشتركة) و FR-006 (فشل صريح).
 */
import type {
  ReceptionSourceType,
  UnifiedReceptionResponse,
} from "../../../types/unified-reception";
import type { SchemaElement } from "../../../types/file-import";

/**
 * نقطة نهاية `/api/text-extract` المُحلّلة من متغيرات البيئة.
 * يُعاد بناؤها من `NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL` بنفس منطق
 * `paste-classifier-config.ts`.
 */
const resolveTextExtractEndpoint = (): string => {
  const normalizeEndpoint = (endpoint: string): string =>
    endpoint.replace(/\/$/, "");

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

const TEXT_EXTRACT_ENDPOINT = resolveTextExtractEndpoint();

const DEFAULT_TIMEOUT_MS = 30_000;

export interface UnifiedTextExtractResult {
  /** النص الخام المُعاد بناؤه */
  rawText: string;
  /** عناصر المحرك المحوّلة لصيغة SchemaElement */
  schemaElements: SchemaElement[];
  /** مدة المعالجة بالمللي ثانية */
  processingTimeMs: number;
}

/**
 * يُرسل النص المُستخرج إلى `/api/text-extract` ويُعيد عناصر المحرك
 * محوّلة لصيغة `SchemaElement` المتوافقة مع خط أنابيب التصنيف.
 *
 * FR-006: يرمي خطأ صريح عند فشل الاتصال أو الاستجابة — لا يوجد
 * سلوك احتياطي صامت.
 *
 * @param text - النص المُستخرج من الملف
 * @param sourceType - نوع المصدر (`doc` أو `docx`)
 * @param timeoutMs - مهلة الطلب بالمللي ثانية
 * @throws {Error} عند فشل الاتصال أو استجابة غير صالحة
 */
export const fetchUnifiedTextExtract = async (
  text: string,
  sourceType: ReceptionSourceType,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<UnifiedTextExtractResult> => {
  if (!TEXT_EXTRACT_ENDPOINT) {
    throw new Error(
      "تعذر إرسال النص للخدمة المشتركة: نقطة /api/text-extract غير مُضبطة."
    );
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(TEXT_EXTRACT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, sourceType }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `فشل الخدمة المشتركة: HTTP ${String(response.status)} — ${errorBody || response.statusText}`
      );
    }

    const body = (await response.json()) as UnifiedReceptionResponse;

    if (!Array.isArray(body.elements) || body.elements.length === 0) {
      throw new Error("استجابة الخدمة المشتركة لا تحتوي على عناصر صالحة.");
    }

    const schemaElements: SchemaElement[] = body.elements.map((el) => ({
      element: el.suggestedType ?? "",
      value: el.normalizedText,
    }));

    return {
      rawText: body.rawText,
      schemaElements,
      processingTimeMs: body.extractionMeta?.processingTimeMs ?? 0,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "انتهت مهلة الاتصال بالخدمة المشتركة (/api/text-extract).",
        { cause: error }
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};
