/**
 * @module constants/formats
 * @description تعريفات تنسيقات عناصر السيناريو العشرة وخرائط الربط.
 *
 * يُصدّر:
 * - {@link ScreenplayFormat} — واجهة تصف تنسيق عنصر واحد (معرّف، تسمية، اختصار، لون، أيقونة)
 * - {@link screenplayFormats} — مصفوفة التنسيقات العشرة الكاملة
 * - {@link formatClassMap} — خريطة `معرّف → اسم صنف CSS` (مثل `'action' → 'format-action'`)
 * - {@link formatShortcutMap} — خريطة `رقم لوحة المفاتيح → معرّف التنسيق` (Ctrl+1..6)
 * - {@link classificationTypeOptions} — خيارات واجهة مُصنّف اللصق (8 أنواع)
 */
import type { EditorStyleFormatId } from "./editor-format-styles";

/** اسم مستعار لـ {@link EditorStyleFormatId} — يُستخدم في سياق التنسيقات */
export type ScreenplayFormatId = EditorStyleFormatId;

/**
 * واجهة تصف تنسيق عنصر سيناريو واحد في واجهة المستخدم.
 * @property id - معرّف التنسيق (مثل `'action'`، `'dialogue'`)
 * @property label - التسمية بالعربية المعروضة في القوائم
 * @property shortcut - اختصار لوحة المفاتيح (مثل `'Ctrl+1'`) أو سلسلة فارغة
 * @property color - أصناف Tailwind للون الخلفية (وضعي الفاتح والداكن)
 * @property icon - اسم أيقونة Lucide المقابلة
 */
export interface ScreenplayFormat {
  id: ScreenplayFormatId;
  label: string;
  shortcut: string;
  color: string;
  icon: string;
}

/** التنسيقات العشرة لعناصر السيناريو بترتيب العرض في واجهة المستخدم */
export const screenplayFormats: readonly ScreenplayFormat[] = [
  {
    id: "basmala",
    label: "بسملة",
    shortcut: "",
    color: "bg-purple-200/50 dark:bg-purple-800/50",
    icon: "book-heart",
  },
  {
    id: "scene_header_top_line",
    label: "عنوان المشهد (سطر علوي)",
    shortcut: "",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: "separator-horizontal",
  },
  {
    id: "scene_header_1",
    label: "عنوان المشهد (1)",
    shortcut: "Ctrl+1",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: "film",
  },
  {
    id: "scene_header_2",
    label: "عنوان المشهد (2)",
    shortcut: "Tab",
    color: "bg-sky-200/50 dark:bg-sky-800/50",
    icon: "map-pin",
  },
  {
    id: "scene_header_3",
    label: "عنوان المشهد (3)",
    shortcut: "Tab",
    color: "bg-cyan-200/50 dark:bg-cyan-800/50",
    icon: "camera",
  },
  {
    id: "action",
    label: "الفعل/الحدث",
    shortcut: "Ctrl+4",
    color: "bg-gray-200/50 dark:bg-gray-700/50",
    icon: "feather",
  },
  {
    id: "character",
    label: "شخصية",
    shortcut: "Ctrl+2",
    color: "bg-green-200/50 dark:bg-green-800/50",
    icon: "user-square",
  },
  {
    id: "parenthetical",
    label: "بين قوسين",
    shortcut: "Tab",
    color: "bg-yellow-200/50 dark:bg-yellow-800/50",
    icon: "parentheses",
  },
  {
    id: "dialogue",
    label: "حوار",
    shortcut: "Ctrl+3",
    color: "bg-orange-200/50 dark:bg-orange-800/50",
    icon: "message-circle",
  },
  {
    id: "transition",
    label: "انتقال",
    shortcut: "Ctrl+6",
    color: "bg-red-200/50 dark:bg-red-800/50",
    icon: "fast-forward",
  },
];

/** خريطة تربط معرّف التنسيق باسم صنف CSS المقابل (مثل `'action' → 'format-action'`) */
export const formatClassMap: Record<string, string> = screenplayFormats.reduce<
  Record<string, string>
>((acc, format) => {
  acc[format.id] = `format-${format.id}`;
  return acc;
}, {});

/** خريطة اختصارات لوحة المفاتيح: رقم المفتاح (Ctrl+N) → معرّف التنسيق */
export const formatShortcutMap: Record<string, string> = {
  "1": "scene_header_1",
  "2": "character",
  "3": "dialogue",
  "4": "action",
  "6": "transition",
};

/** خيارات أنواع التصنيف المعروضة في واجهة مُصنّف اللصق (8 أنواع بدون basmala وtop-line) */
export const classificationTypeOptions = [
  { value: "action", label: "حركة (Action)" },
  { value: "dialogue", label: "حوار (Dialogue)" },
  { value: "character", label: "شخصية (Character)" },
  { value: "scene_header_1", label: "عنوان مشهد - مستوى 1" },
  { value: "scene_header_2", label: "عنوان مشهد - مستوى 2" },
  { value: "scene_header_3", label: "عنوان مشهد - مستوى 3" },
  { value: "transition", label: "انتقال (Transition)" },
  { value: "parenthetical", label: "توصيف (Parenthetical)" },
] as const;
