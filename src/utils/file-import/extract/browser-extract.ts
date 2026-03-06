/**
 * @module utils/file-import/extract/browser-extract
 * @description استخراج النصوص من الملفات داخل المتصفح بدون Backend.
 *
 * الأنواع المدعومة:
 * - `txt` / `fountain` / `fdx` — قراءة نصية مباشرة مع كشف ترميز ذكي
 *   (UTF-8 → windows-1256 → ISO-8859-1) للنصوص العربية
 * - `doc` — استخراج best-effort من النصوص المرئية (Fallback)
 * - `docx` — غير مدعوم في المتصفح، ويُعالج عبر Backend
 *
 * كل مسار يفحص وجود Filmlane Payload Marker قبل إرجاع النص الخام.
 */
import type {
  FileExtractionResult,
  ImportedFileType,
} from "../../../types/file-import";
import { extractPayloadFromText } from "../document-model";

/** يوحّد فواصل الأسطر إلى `\n` */
const normalizeNewlines = (value: string): string =>
  (value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const isAllowedLegacyDocCodePoint = (code: number): boolean => {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0x00a0 && code <= 0x00ff) return true;
  if (code >= 0x0600 && code <= 0x06ff) return true;
  if (code >= 0x0750 && code <= 0x077f) return true;
  if (code >= 0x08a0 && code <= 0x08ff) return true;
  return false;
};

const stripUnsupportedLegacyDocChars = (value: string): string => {
  let output = "";
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code !== undefined && isAllowedLegacyDocCodePoint(code)) {
      output += ch;
    } else {
      output += " ";
    }
  }
  return output;
};

/**
 * تنظيف best-effort لملفات DOC عند الاستخراج داخل المتصفح:
 * - إزالة المحارف الثنائية غير القابلة للعرض.
 * - الحفاظ على العربية/الإنجليزية وعلامات الترقيم الشائعة.
 * - ضغط الفراغات المتكررة دون الإضرار بفواصل الأسطر.
 */
const normalizeLegacyDocBestEffortText = (value: string): string =>
  stripUnsupportedLegacyDocChars(normalizeNewlines(value))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * يحاول فكّ ترميز مصفوفة بايت بترميز محدد.
 * @returns النص المفكوك أو `null` عند الفشل
 */
const decodeWithEncoding = (
  buffer: Uint8Array,
  encoding: string
): string | null => {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return null;
  }
};

/**
 * يفكّ ترميز ArrayBuffer إلى نص باستخدام تسلسل ترميزات:
 * UTF-8 → windows-1256 → ISO-8859-1.
 * مصمّم للتعامل مع النصوص العربية المشفّرة بترميزات مختلفة.
 */
const decodeTextBuffer = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  const utf8Text = decodeWithEncoding(bytes, "utf-8") ?? "";
  const hasReplacementChars =
    utf8Text.includes("\uFFFD") || utf8Text.includes("�");
  if (!hasReplacementChars) return utf8Text;

  const win1256 = decodeWithEncoding(bytes, "windows-1256");
  if (win1256 && !win1256.includes("\uFFFD")) {
    return win1256;
  }

  const latin1 = decodeWithEncoding(bytes, "iso-8859-1");
  if (latin1) return latin1;

  return utf8Text;
};

/**
 * يبني نتيجة استخراج من نوع `app-payload` عند اكتشاف
 * Filmlane Payload Marker في النص المستخرج.
 */
const toPayloadResult = (
  payload: NonNullable<ReturnType<typeof extractPayloadFromText>>,
  fileType: ImportedFileType,
  attempts: string[]
): FileExtractionResult => ({
  text: payload.blocks.map((block) => block.text).join("\n"),
  fileType,
  method: "app-payload",
  usedOcr: false,
  warnings: [],
  attempts,
  qualityScore: 1,
  normalizationApplied: ["payload-direct-restore"],
  structuredBlocks: payload.blocks,
  payloadVersion: payload.version,
});

/**
 * يتحقق ممّا إذا كان نوع الملف مدعوماً للاستخراج في المتصفح.
 * جميع الأنواع المعروفة مدعومة ما عدا DOCX، وملف DOC يعمل بوضع best-effort.
 */
export const isBrowserExtractionSupported = (
  fileType: ImportedFileType
): boolean => fileType !== "docx";

/**
 * يستخرج نص الملف داخل المتصفح حسب نوعه:
 * - `txt`/`fountain`/`fdx` → قراءة نصية مع كشف ترميز
 * - `doc` → best-effort text extraction
 *
 * يفحص وجود Filmlane Payload Marker قبل إرجاع النص الخام.
 *
 * @param file - كائن الملف
 * @param fileType - نوع الملف المُحدد
 * @returns نتيجة الاستخراج
 * @throws {Error} للأنواع غير المدعومة أو أخطاء المكتبات
 */
export const extractFileInBrowser = async (
  file: File,
  fileType: ImportedFileType
): Promise<FileExtractionResult> => {
  if (!isBrowserExtractionSupported(fileType)) {
    throw new Error("هذا النوع يحتاج مسار Backend extraction.");
  }

  if (fileType === "txt" || fileType === "fountain" || fileType === "fdx") {
    const arrayBuffer = await file.arrayBuffer();
    const text = normalizeNewlines(decodeTextBuffer(arrayBuffer));
    const payload = extractPayloadFromText(text);
    if (payload) {
      return toPayloadResult(payload, fileType, [
        "native-text",
        "payload-marker",
      ]);
    }

    return {
      text,
      fileType,
      method: "native-text",
      usedOcr: false,
      warnings: [],
      attempts: ["native-text"],
    };
  }

  if (fileType === "doc") {
    const arrayBuffer = await file.arrayBuffer();
    const text = normalizeLegacyDocBestEffortText(
      decodeTextBuffer(arrayBuffer)
    );

    if (!text) {
      throw new Error("تعذر استخراج نص قابل للقراءة من ملف DOC داخل المتصفح.");
    }

    const payload = extractPayloadFromText(text);
    if (payload) {
      return toPayloadResult(payload, fileType, [
        "doc-browser-best-effort",
        "payload-marker",
      ]);
    }

    return {
      text,
      fileType,
      method: "native-text",
      usedOcr: false,
      warnings: [
        "تم استخدام استخراج DOC داخل المتصفح بوضع best-effort. للحصول على دقة أعلى استخدم Backend.",
      ],
      attempts: ["doc-browser-best-effort"],
    };
  }

  throw new Error(`نوع الملف غير مدعوم في المتصفح: ${fileType}`);
};
