/**
 * types.ts — أنواع البيانات المشتركة لوكيل OCR العربي
 *
 * يحتوي على تعريفات الواجهات والأنواع المستخدمة عبر المشروع بالكامل.
 */

// ─── إعدادات الوكيل ──────────────────────────────────────────

/** إعدادات تهيئة الوكيل الرئيسية */
export interface AgentConfig {
  /** نموذج LLM المستخدم للوكيل (مثال: "gpt-4o") */
  agentModel: string;
  /** الحد الأقصى لخطوات الوكيل */
  maxSteps: number;
  /** مسار خادم MCP للـ OCR */
  mcpServerPath: string;
  /** مسار مجلد الإدخال الافتراضي */
  defaultInputDir: string;
  /** مسار مجلد الإخراج الافتراضي */
  defaultOutputDir: string;
}

// ─── نتائج التصنيف ──────────────────────────────────────────

/** نتيجة تصنيف ملف PDF */
export interface ClassificationResult {
  /** نوع الملف: نصي / ممسوح / مختلط / محمي / غير صالح */
  type: "text-based" | "scanned" | "mixed" | "protected" | "invalid";
  /** عدد الصفحات */
  pages: number;
  /** حجم الملف بالميجابايت */
  size_mb: number;
  /** اسم الملف */
  filename: string;
  /** هل يحتوي نصاً عربياً */
  has_arabic: boolean;
  /** المحرك الموصى به */
  recommended_engine: "pdfminer" | "mistral" | "vision";
  /** ملاحظات إضافية */
  notes: string[];
}

// ─── نتائج OCR ──────────────────────────────────────────────

/** نتيجة OCR لصفحة واحدة */
export interface OcrPageResult {
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

/** نتيجة OCR كاملة */
export interface OcrResult {
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

// ─── خيارات التطبيع ─────────────────────────────────────────

/** خيارات تطبيع النص العربي */
export interface NormalizationOptions {
  /** توحيد ى → ي */
  normalizeYa?: boolean;
  /** توحيد ة → ه (خطير!) */
  normalizeTaMarbuta?: boolean;
  /** توحيد الهمزات إأآ → ا */
  normalizeHamza?: boolean;
  /** توحيد الأرقام */
  normalizeDigits?: "none" | "arabic" | "western";
  /** إزالة التشكيل */
  removeDiacritics?: boolean;
  /** إصلاح الحروف الملتصقة */
  fixConnectedLetters?: boolean;
  /** تنظيف علامات الترقيم العربية */
  fixArabicPunctuation?: boolean;
  /** قواعد خاصة بالسيناريوهات */
  scriptSpecificRules?: boolean;
}

// ─── خيارات معالجة الملف ────────────────────────────────────

/** صيغ إخراج النص من مرحلة الاستخراج */
export type ExtractionOutputFormat = "txt" | "txt-raw" | "md";

/** خيارات معالجة ملف PDF واحد */
export interface ProcessFileOptions {
  /** مسار ملف PDF المُدخل */
  inputPath: string;
  /** مسار ملف الإخراج (اختياري — يُولّد تلقائياً) */
  outputPath?: string;
  /** صيغة الإخراج (txt-raw = نص خام قبل تنسيق الصفحات) */
  outputFormat?: ExtractionOutputFormat;
  /** نطاق الصفحات (مثال: "0-9" أو "all") */
  pages?: string;
  /** تفعيل تحسين LLM */
  useLlm?: boolean;
  /** نموذج LLM للتحسين */
  llmModel?: string;
  /** خيارات التطبيع */
  normalizerOptions?: NormalizationOptions;
  /** استخدام Batch OCR */
  useBatchOcr?: boolean;
}

// ─── تقرير المعالجة ─────────────────────────────────────────

/** تقرير نتائج المعالجة */
export interface ProcessingReport {
  /** حالة العملية */
  success: boolean;
  /** المحرك المستخدم */
  engine: string;
  /** عدد الصفحات المعالجة */
  pagesProcessed: number;
  /** وقت المعالجة بالثواني */
  timeSeconds: number;
  /** مسار ملف الإخراج */
  outputPath: string;
  /** حجم الملف الناتج بالكيلوبايت */
  outputSizeKb: number;
  /** أخطاء (إن وجدت) */
  errors?: string[];
  /** تحذيرات */
  warnings?: string[];
}
