/**
 * @module constants/format-mappings
 * @description خرائط ربط التنسيقات واختصارات لوحة المفاتيح وقوالب المشاريع.
 *   مستخرجة من `App.tsx` لتطبيق مبدأ المسؤولية الواحدة.
 */
import {
  fromLegacyElementType,
  type ElementType,
} from "../extensions/classification-types";
import { formatShortcutMap, screenplayFormats } from "./formats";
import type { InsertActionId } from "../controllers";
import type { TypingSystemSettings } from "../types";

/**
 * ربط أرقام لوحة المفاتيح (0-7) بأنواع عناصر السيناريو
 * لاختصارات Ctrl+رقم.
 */
const mapShortcutFormatIdToElementType = (
  value: string
): ElementType | null => {
  if (value === "scene_header_1" || value === "scene_header_2") {
    return "scene_header_top_line";
  }
  return fromLegacyElementType(value);
};

export const SHORTCUT_FORMAT_BY_DIGIT: Record<string, ElementType> = {
  "0": "basmala",
  "1": "scene_header_top_line",
  "2": "scene_header_3",
  "3": "action",
  "4": "character",
  "5": "dialogue",
  "6": "parenthetical",
  "7": "transition",
};

for (const [digit, legacyFormatId] of Object.entries(formatShortcutMap)) {
  const mappedType = mapShortcutFormatIdToElementType(legacyFormatId);
  if (mappedType && !(digit in SHORTCUT_FORMAT_BY_DIGIT)) {
    SHORTCUT_FORMAT_BY_DIGIT[digit] = mappedType;
  }
}

export const FORMAT_CYCLE_ORDER: readonly ElementType[] = [
  "basmala",
  "scene_header_top_line",
  "scene_header_3",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];

/** ربط نوع العنصر بتسميته العربية — يُعرض في ذيل الصفحة كمؤشر العنصر النشط */
export const FORMAT_LABEL_BY_TYPE: Record<ElementType, string> = {
  action:
    screenplayFormats.find((format) => format.id === "action")?.label ??
    "حدث / وصف",
  dialogue:
    screenplayFormats.find((format) => format.id === "dialogue")?.label ??
    "حوار",
  character:
    screenplayFormats.find((format) => format.id === "character")?.label ??
    "شخصية",
  scene_header_1:
    screenplayFormats.find((format) => format.id === "scene_header_1")?.label ??
    "رأس المشهد (1)",
  scene_header_2:
    screenplayFormats.find((format) => format.id === "scene_header_2")?.label ??
    "رأس المشهد (2)",
  scene_header_3:
    screenplayFormats.find((format) => format.id === "scene_header_3")?.label ??
    "رأس المشهد (3)",
  scene_header_top_line:
    screenplayFormats.find((format) => format.id === "scene_header_top_line")
      ?.label ?? "سطر رأس المشهد",
  transition:
    screenplayFormats.find((format) => format.id === "transition")?.label ??
    "انتقال",
  parenthetical:
    screenplayFormats.find((format) => format.id === "parenthetical")?.label ??
    "تعليمات حوار",
  basmala:
    screenplayFormats.find((format) => format.id === "basmala")?.label ??
    "بسملة",
};

export const PROJECT_TEMPLATE_BY_NAME = {
  "فيلم الرحلة": {
    sceneHeader1: "مشهد 1",
    sceneHeader2: "ليل - خارجي",
    sceneHeader3: "محطة القطار",
    action: "البطل يجر حقيبته الثقيلة ويتطلع إلى القطار الأخير قبل المغادرة.",
  },
  "مسلسل الحارة": {
    sceneHeader1: "مشهد 1",
    sceneHeader2: "نهار - خارجي",
    sceneHeader3: "الحارة القديمة",
    action:
      "أصوات الباعة تختلط مع ضحكات الأطفال بينما تتحرك الكاميرا بين الأزقة.",
  },
  "ورشة أفان تيتر": {
    sceneHeader1: "مشهد 1",
    sceneHeader2: "نهار - داخلي",
    sceneHeader3: "قاعة التدريب",
    action:
      "المشاركون يفتحون حواسيبهم وتبدأ جلسة الكتابة الجماعية على السبورة.",
  },
} as const;

export const LIBRARY_ACTION_BY_ITEM = {
  "قوالب المشاهد": "insert-template:scene_header_1",
  الشخصيات: "insert-template:character",
  الملاحظات: "insert-template:action",
} as const satisfies Record<string, InsertActionId>;

export const TYPING_MODE_OPTIONS: ReadonlyArray<{
  value: TypingSystemSettings["typingSystemMode"];
  label: string;
  description: string;
}> = [
  {
    value: "plain",
    label: "يدوي (Plain)",
    description: "لا يتم تشغيل التصنيف التلقائي أثناء الكتابة.",
  },
  {
    value: "auto-deferred",
    label: "مؤجل (Auto Deferred)",
    description: "يشغّل إعادة المعالجة يدويًا بعد اللصق.",
  },
  {
    value: "auto-live",
    label: "حي (Auto Live)",
    description: "يشغّل إعادة المعالجة تلقائيًا بعد مهلة خمول.",
  },
];

export const PDF_OCR_ERROR_HINTS: Record<string, string> = {
  PDF_OCR_PDF_RENDERER_MISSING:
    "تعذر تشغيل استخراج PDF لأن أداة pdftoppm غير متاحة. ثبّت Poppler أو اضبط POPPLER_BIN.",
  PDF_OCR_PDF_RENDERER_UNUSABLE:
    "تعذر تشغيل استخراج PDF لأن أمر pdftoppm غير صالح في بيئة التشغيل الحالية.",
  PDF_OCR_CFG_MISSING_MISTRAL_API_KEY:
    "إعداد OCR غير مكتمل: MISTRAL_API_KEY غير مضبوط.",
  PDF_OCR_CFG_MISSING_MOONSHOT_API_KEY:
    "إعداد OCR غير مكتمل: MOONSHOT_API_KEY غير مضبوط.",
  PDF_OCR_CFG_MISSING_VISION_COMPARE_MODEL:
    "إعداد OCR غير مكتمل: PDF_VISION_COMPARE_MODEL غير مضبوط.",
  PDF_OCR_CFG_INVALID_VISION_COMPARE_MODEL:
    "إعداد OCR غير صالح: PDF_VISION_COMPARE_MODEL غير متوافق مع مسار المقارنة البصرية الحالي.",
  PDF_OCR_CFG_MISSING_VISION_JUDGE_MODEL:
    "إعداد OCR غير مكتمل: PDF_VISION_JUDGE_MODEL غير مضبوط.",
  PDF_OCR_HEALTH_TIMEOUT:
    "تعذر التحقق من جاهزية OCR بسبب انتهاء مهلة فحص الخادم الخلفي.",
  PDF_OCR_HEALTH_UNREACHABLE: "تعذر الوصول إلى الخادم الخلفي لفحص جاهزية OCR.",
};

export const formatPdfOcrIssueDescription = (
  errorCode?: string,
  fallbackMessage?: string
): string => {
  const normalizedCode =
    typeof errorCode === "string" && errorCode.trim() ? errorCode.trim() : "";

  const mapped = normalizedCode
    ? PDF_OCR_ERROR_HINTS[normalizedCode]
    : undefined;
  if (mapped) {
    return `${mapped}${normalizedCode ? `\n(${normalizedCode})` : ""}`;
  }

  if (typeof fallbackMessage === "string" && fallbackMessage.trim()) {
    return fallbackMessage.trim();
  }

  return "تعذر تشغيل مسار OCR للملف PDF بسبب إعدادات غير مكتملة في الخادم الخلفي.";
};

export const toLiveIdleMinutesLabel = (minutes: number): string =>
  `${minutes} ${minutes === 1 ? "دقيقة" : "دقائق"}`;

export const ensureDocxFilename = (name: string): string => {
  const trimmedName = name.trim();
  if (!trimmedName) return "screenplay.docx";
  const sanitizedBase = trimmedName.replace(/[<>:"/\\|?*]+/g, "_");
  if (!sanitizedBase.toLowerCase().endsWith(".docx")) {
    return `${sanitizedBase}.docx`;
  }
  return sanitizedBase;
};
