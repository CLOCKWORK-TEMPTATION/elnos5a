/**
 * @module types/file-import
 * @description أنماط استيراد الملفات — تُعرّف الأنواع المدعومة وطرق الاستخراج ونتائج العملية
 *
 * يدعم التطبيق 6 صيغ ملفات من واجهة الفتح: pdf, doc, docx, txt, fountain, fdx
 * ويستخدم عدة طرق استخراج مختلفة حسب نوع الملف وبيئة التشغيل.
 *
 * @see utils/file-import/ — خط أنابيب الاستيراد الكامل
 */

import type { ScreenplayBlock } from "../utils/file-import/document-model";

/**
 * وضع الاستيراد — يُحدد كيفية تعامل المحرر مع المحتوى المستورد
 * - `replace` — استبدال المستند الحالي بالكامل
 * - `insert` — إدراج المحتوى عند موضع المؤشر
 */
export type FileImportMode = "replace" | "insert";

/**
 * نوع الملف المستورد — الصيغ المدعومة داخل طبقة الاستخراج
 * - `pdf` — Portable Document Format (.pdf)
 * - `doc` — Microsoft Word القديم (.doc)
 * - `docx` — Microsoft Word الحديث (.docx)
 * - `txt` — نص عادي (.txt)
 * - `fountain` — صيغة سيناريو Fountain (.fountain)
 * - `fdx` — Final Draft XML (.fdx)
 */
export type ImportedFileType =
  | "pdf"
  | "doc"
  | "docx"
  | "txt"
  | "fountain"
  | "fdx";

/**
 * طريقة الاستخراج — الأسلوب المُستخدم لاستخراج النص من الملف
 * - `native-text` — قراءة مباشرة كنص عادي (txt, fountain)
 * - `mammoth` — استخراج نص DOCX عبر Mammoth
 * - `doc-converter-flow` — تحويل doc عبر خدمة خارجية
 * - `ocr-mistral` — التعرف البصري على الحروف عبر Mistral
 * - `backend-api` — استخراج عبر واجهة برمجية خلفية
 * - `app-payload` — حمولة تطبيق أفان تيتر المُشفّرة (Base64 + FNV1a)
 */
export type ExtractionMethod =
  | "native-text"
  | "mammoth"
  | "doc-converter-flow"
  | "ocr-mistral"
  | "backend-api"
  | "app-payload"
  | "karank-engine-bridge";

/**
 * نتيجة استخراج الملف — المُخرج النهائي لعملية الاستخراج
 *
 * @property text - النص المُستخرج من الملف
 * @property fileType - نوع الملف الأصلي
 * @property method - طريقة الاستخراج المُستخدمة
 * @property usedOcr - هل استُخدم التعرف البصري على الحروف (OCR)
 * @property warnings - تحذيرات أثناء الاستخراج (مثل فقدان تنسيق)
 * @property attempts - سجل المحاولات (الطرق المُجرّبة بالترتيب)
 * @property qualityScore - درجة جودة الاستخراج (0-100، اختياري)
 * @property normalizationApplied - قواعد التطبيع المُطبّقة (اختياري)
 * @property structuredBlocks - كتل سيناريو مُهيكلة مسبقاً (لحمولات التطبيق، اختياري)
 * @property payloadVersion - إصدار الحمولة (لحمولات التطبيق، اختياري)
 */
export interface SchemaElement {
  element: string;
  value: string;
}

export interface FileExtractionResult {
  text: string;
  rawExtractedText?: string;
  pipelineFootprint?: {
    checkedDirectories: string[];
    checkedFiles: string[];
  };
  fileType: ImportedFileType;
  method: ExtractionMethod;
  usedOcr: boolean;
  warnings: string[];
  attempts: string[];
  qualityScore?: number;
  normalizationApplied?: string[];
  structuredBlocks?: ScreenplayBlock[];
  payloadVersion?: number;
  schemaText?: string;
  schemaElements?: SchemaElement[];
}

/**
 * طلب استخراج ملف — يُرسل لنقطة النهاية الخلفية
 *
 * @property filename - اسم الملف الأصلي
 * @property extension - نوع الملف (الامتداد)
 * @property fileBase64 - محتوى الملف مُشفّر بـ Base64
 */
export interface FileExtractionRequest {
  filename: string;
  extension: ImportedFileType;
  fileBase64: string;
}

/**
 * استجابة استخراج الملف — الرد من نقطة النهاية الخلفية
 *
 * @property success - هل نجحت عملية الاستخراج
 * @property data - نتيجة الاستخراج (في حالة النجاح)
 * @property error - رسالة الخطأ (في حالة الفشل)
 */
export interface FileExtractionResponse {
  success: boolean;
  data?: FileExtractionResult;
  error?: string;
  errorCode?: string;
}

/**
 * الامتدادات المقبولة — سلسلة نصية لعنصر `<input accept="...">`
 *
 * @example
 * ```html
 * <input type="file" accept={ACCEPTED_FILE_EXTENSIONS} />
 * ```
 */
export const ACCEPTED_FILE_EXTENSIONS =
  ".pdf,.doc,.docx,.txt,.fountain,.fdx" as const;

/**
 * استخراج نوع الملف من اسمه — يُعيد `null` إذا كان الامتداد غير مدعوم
 *
 * @param filename - اسم الملف الكامل (مثل "script.doc")
 * @returns نوع الملف المُطابق أو `null`
 *
 * @example
 * ```typescript
 * getFileType('my-script.doc')  // 'doc'
 * getFileType('image.png')      // null
 * ```
 */
export function getFileType(filename: string): ImportedFileType | null {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "doc":
      return "doc";
    case "docx":
      return "docx";
    case "txt":
      return "txt";
    case "fountain":
      return "fountain";
    case "fdx":
      return "fdx";
    default:
      return null;
  }
}
