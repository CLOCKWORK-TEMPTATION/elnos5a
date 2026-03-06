/**
 * @module constants/insert-menu
 * @description تعريفات عناصر قائمة الإدراج في شريط أدوات المحرر.
 *
 * يُصدّر:
 * - {@link InsertBehavior} — نوع سلوك الإدراج (`'insert-template'` أو `'photo-montage'`)
 * - {@link InsertMenuItemDefinition} — واجهة تصف عنصراً واحداً في قائمة الإدراج
 * - {@link insertMenuDefinitions} — مصفوفة العناصر العشرة القابلة للإدراج
 */
import type { EditorStyleFormatId } from "./editor-format-styles";

/**
 * سلوك الإدراج: إما إدراج قالب نصي (`'insert-template'`) أو فتح واجهة فوتو مونتاج (`'photo-montage'`).
 */
export type InsertBehavior = "insert-template" | "photo-montage";
export type { EditorStyleFormatId } from "./editor-format-styles";

/**
 * واجهة تصف عنصراً واحداً في قائمة الإدراج.
 * @property id - معرّف نوع العنصر المرتبط
 * @property label - التسمية بالعربية المعروضة في القائمة
 * @property icon - اسم أيقونة Lucide
 * @property insertBehavior - سلوك الإدراج عند النقر
 * @property defaultTemplate - القالب النصي الافتراضي، أو `null` لعناصر بدون قالب
 */
export interface InsertMenuItemDefinition {
  id: EditorStyleFormatId;
  label: string;
  icon: string;
  insertBehavior: InsertBehavior;
  defaultTemplate: string | null;
}

/** العناصر العشرة القابلة للإدراج من قائمة الإدراج في شريط الأدوات */
export const insertMenuDefinitions: readonly InsertMenuItemDefinition[] = [
  {
    id: "basmala",
    label: "بسملة",
    icon: "sparkles",
    insertBehavior: "insert-template",
    defaultTemplate: "بسم الله الرحمن الرحيم",
  },
  {
    id: "scene_header_1",
    label: "رأس المشهد (1)",
    icon: "movie",
    insertBehavior: "insert-template",
    defaultTemplate: "مشهد 1:",
  },
  {
    id: "scene_header_2",
    label: "رأس المشهد 2",
    icon: "text-caption",
    insertBehavior: "insert-template",
    defaultTemplate: "داخلي - المكان - الوقت",
  },
  {
    id: "scene_header_3",
    label: "رأس المشهد 3",
    icon: "list",
    insertBehavior: "insert-template",
    defaultTemplate: "الموقع",
  },
  {
    id: "action",
    label: "الوصف/الحركة",
    icon: "text-caption",
    insertBehavior: "insert-template",
    defaultTemplate: "وصف الحدث...",
  },
  {
    id: "character",
    label: "اسم الشخصية",
    icon: "user",
    insertBehavior: "insert-template",
    defaultTemplate: "اسم الشخصية:",
  },
  {
    id: "dialogue",
    label: "الحوار",
    icon: "message",
    insertBehavior: "insert-template",
    defaultTemplate: "الحوار هنا...",
  },
  {
    id: "parenthetical",
    label: "تعليمات الحوار",
    icon: "list",
    insertBehavior: "insert-template",
    defaultTemplate: "(تعليمات الحوار)",
  },
  {
    id: "transition",
    label: "الانتقال",
    icon: "separator",
    insertBehavior: "insert-template",
    defaultTemplate: "انتقال إلى:",
  },
  {
    id: "scene_header_top_line",
    label: "فوتو مونتاج",
    icon: "movie",
    insertBehavior: "photo-montage",
    defaultTemplate: null,
  },
];
