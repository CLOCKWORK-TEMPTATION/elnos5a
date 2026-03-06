/**
 * @module constants/menu-definitions
 * @description تعريفات أقسام القوائم الرئيسية وأزرار شريط Dock والشريط الجانبي.
 *   مستخرجة من `App.tsx` لتطبيق مبدأ المسؤولية الواحدة.
 */
import {
  Download,
  Upload,
  Save,
  History,
  Info,
  Undo2,
  Redo2,
  Bold,
  Italic,
  AlignLeft,
  AlignRight,
  AlignCenter,
  Stethoscope,
  Lightbulb,
  MessageSquare,
  FileText,
  List,
  BookOpen,
  Settings,
  Clapperboard,
  CheckCircle,
} from "lucide-react";
import { insertMenuDefinitions, type EditorStyleFormatId } from "./insert-menu";
import type {
  AppDockButtonItem,
  AppShellMenuItem,
  AppShellMenuSection,
  AppSidebarSection,
} from "../components/app-shell";
import type { InsertActionId } from "../controllers";

/** معرّفات أوامر القوائم */
export type MenuActionId =
  | "new-file"
  | "open-file"
  | "insert-file"
  | "save-file"
  | "print-file"
  | "export-html"
  | "export-pdf"
  | "export-pdfa"
  | "export-fdx"
  | "export-fountain"
  | "export-classified"
  | "undo"
  | "redo"
  | "copy"
  | "cut"
  | "paste"
  | "select-all"
  | "bold"
  | "italic"
  | "underline"
  | "align-right"
  | "align-center"
  | "align-left"
  | "quick-cycle-format"
  | "show-draft-info"
  | "tool-auto-check"
  | "tool-reclassify"
  | "help-shortcuts"
  | "about"
  | `format:${string}`
  | InsertActionId;

export type ExportFormat =
  | "docx"
  | "html"
  | "pdf"
  | "pdfa"
  | "fdx"
  | "fountain"
  | "classified";

/** حرف رمزي لكل عنصر إدراج */
export const INSERT_ICON_GLYPH_BY_ID: Readonly<
  Record<EditorStyleFormatId, string>
> = {
  basmala: "✧",
  scene_header_1: "◫",
  scene_header_2: "▭",
  scene_header_3: "☰",
  action: "≡",
  character: "◉",
  dialogue: "◌",
  parenthetical: "☷",
  transition: "⟶",
  scene_header_top_line: "▦",
};

/** عناصر قائمة الإدراج — مبنية من تعريفات insert-menu */
export const INSERT_MENU_ITEMS: readonly AppShellMenuItem[] =
  insertMenuDefinitions.map((definition) => {
    const actionId = `${definition.insertBehavior}:${definition.id}` as const;
    return {
      label: definition.label,
      actionId,
      iconGlyph: INSERT_ICON_GLYPH_BY_ID[definition.id] ?? "•",
    };
  });

export const FORMAT_MENU_ITEMS: readonly AppShellMenuItem[] = [
  { label: "غامق", actionId: "bold", iconGlyph: "B" },
  { label: "مائل", actionId: "italic", iconGlyph: "I" },
  { label: "محاذاة لليمين", actionId: "align-right", iconGlyph: "≣" },
  { label: "توسيط", actionId: "align-center", iconGlyph: "≡" },
  { label: "محاذاة لليسار", actionId: "align-left", iconGlyph: "☰" },
];

export const TOOL_MENU_ITEMS: readonly AppShellMenuItem[] = [
  { label: "فحص تلقائي", actionId: "tool-auto-check", iconGlyph: "⌁" },
  { label: "إعادة تصنيف", actionId: "tool-reclassify", iconGlyph: "↻" },
];

export const HELP_MENU_ITEMS: readonly AppShellMenuItem[] = [
  { label: "عن المحرر", actionId: "about", iconGlyph: "?" },
  {
    label: "اختصارات لوحة المفاتيح",
    actionId: "help-shortcuts",
    iconGlyph: "⌨",
  },
];

/** أقسام القائمة الرئيسية: ملف، تعديل، إضافة، تنسيق، أدوات، مساعدة */
export const MENU_SECTIONS: readonly AppShellMenuSection[] = [
  {
    label: "ملف",
    items: [
      { label: "مستند جديد", actionId: "new-file" },
      { label: "فتح...", actionId: "open-file" },
      { label: "إدراج ملف...", actionId: "insert-file" },
      { label: "حفظ", actionId: "save-file" },
      { label: "طباعة", actionId: "print-file" },
      { label: "تصدير PDF", actionId: "export-pdf" },
      { label: "تصدير PDF/A (أرشيفي)", actionId: "export-pdfa" },
      { label: "تصدير HTML", actionId: "export-html" },
      { label: "تصدير FDX (Final Draft)", actionId: "export-fdx" },
      { label: "تصدير Fountain", actionId: "export-fountain" },
      {
        label: "موافقة واعتماد النص (تصدير TXT)",
        actionId: "export-classified",
      },
    ],
  },
  {
    label: "تعديل",
    items: [
      { label: "تراجع", actionId: "undo" },
      { label: "إعادة", actionId: "redo" },
      { label: "قص", actionId: "cut" },
      { label: "نسخ", actionId: "copy" },
      { label: "لصق", actionId: "paste" },
      { label: "تحديد الكل", actionId: "select-all" },
    ],
  },
  {
    label: "إضافة",
    items: INSERT_MENU_ITEMS,
  },
  {
    label: "تنسيق",
    items: FORMAT_MENU_ITEMS,
  },
  {
    label: "أدوات",
    items: TOOL_MENU_ITEMS,
  },
  {
    label: "مساعدة",
    items: HELP_MENU_ITEMS,
  },
];

/** أزرار شريط Dock العائم */
export const DOCK_BUTTONS: readonly AppDockButtonItem[] = [
  {
    actionId: "export-classified",
    icon: CheckCircle,
    title: "موافقة واعتماد النص (تصدير TXT)",
  },
  {
    actionId: "quick-cycle-format",
    icon: Clapperboard,
    title: "تبديل التنسيق المباشر",
  },
  { actionId: "export-pdf", icon: Download, title: "تصدير PDF" },
  { actionId: "tool-auto-check", icon: Stethoscope, title: "تحليل السيناريو" },
  {
    actionId: "tool-reclassify",
    icon: Lightbulb,
    title: "إعادة تصنيف المستند",
  },
  { actionId: "help-shortcuts", icon: MessageSquare, title: "الاختصارات" },
  { actionId: "show-draft-info", icon: History, title: "معلومات المسودة" },
  { actionId: "open-file", icon: Upload, title: "فتح ملف" },
  { actionId: "save-file", icon: Save, title: "حفظ الملف" },
  { actionId: "undo", icon: Undo2, title: "تراجع" },
  { actionId: "redo", icon: Redo2, title: "إعادة" },
  { actionId: "bold", icon: Bold, title: "غامق" },
  { actionId: "italic", icon: Italic, title: "مائل" },
  { actionId: "align-right", icon: AlignRight, title: "محاذاة لليمين" },
  { actionId: "align-center", icon: AlignCenter, title: "توسيط" },
  { actionId: "align-left", icon: AlignLeft, title: "محاذاة لليسار" },
  { actionId: "about", icon: Info, title: "عن المحرر" },
];

/** أقسام الشريط الجانبي */
export const SIDEBAR_SECTIONS: readonly AppSidebarSection[] = [
  {
    id: "docs",
    label: "المستندات الأخيرة",
    icon: FileText,
    items: [
      "سيناريو فيلم.docx",
      "مسودة الحلقة الأولى.docx",
      "مشاهد مُصنفة.docx",
    ],
  },
  {
    id: "projects",
    label: "المشاريع",
    icon: List,
    items: ["فيلم الرحلة", "مسلسل الحارة", "ورشة أفان تيتر"],
  },
  {
    id: "library",
    label: "المكتبة",
    icon: BookOpen,
    items: ["قوالب المشاهد", "الشخصيات", "الملاحظات"],
  },
  { id: "settings", label: "الإعدادات", icon: Settings, items: [] },
] as const;
