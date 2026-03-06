/**
 * @module types/editor-engine
 * @description واجهة محرك التحرير — تُعرّف العقد بين المُنسّق (ScreenplayEditor) ومحرك Tiptap
 *
 * تفصل هذه الواجهة منطق واجهة المستخدم عن تفاصيل تنفيذ المحرر،
 * مما يسمح بتبديل محرك التحرير دون تغيير المكونات المستهلكة.
 */

import type { ClipboardOrigin } from "./editor-clipboard";
import type { ScreenplayBlock } from "../utils/file-import/document-model";

/**
 * خيارات تشغيل أمر المحرر — تُحدد الأوامر المدعومة
 *
 * @property command - الأمر المطلوب تنفيذه:
 *   - `undo` — التراجع عن آخر عملية
 *   - `redo` — إعادة آخر عملية مُتراجع عنها
 *   - `select-all` — تحديد كامل المستند
 *   - `focus-end` — نقل المؤشر إلى نهاية المستند
 */
export interface RunEditorCommandOptions {
  command: "undo" | "redo" | "select-all" | "focus-end";
}

/**
 * مُهايئ محرك التحرير — الواجهة التي يُنفّذها EditorArea ويستهلكها App.tsx
 *
 * تُغلّف جميع عمليات المحرر المطلوبة من واجهة المستخدم:
 * - إدراج واستبدال الكتل (لعمليات الاستيراد واللصق)
 * - استخراج الكتل (للتصدير والنسخ)
 * - تشغيل الأوامر (تراجع، إعادة، تحديد الكل)
 * - عمليات الحافظة (نسخ، قص، لصق)
 *
 * @property insertBlocks - إدراج كتل في موضع المؤشر الحالي
 * @property replaceBlocks - استبدال محتوى المستند بالكامل بكتل جديدة
 * @property getBlocks - استخراج جميع كتل المستند الحالية
 * @property runCommand - تنفيذ أمر محرر (undo/redo/select-all/focus-end)
 * @property hasSelection - التحقق من وجود نص محدد حالياً
 * @property copySelectionToClipboard - نسخ النص المحدد إلى الحافظة
 * @property cutSelectionToClipboard - قص النص المحدد إلى الحافظة
 * @property pasteFromClipboard - لصق محتوى الحافظة مع تحديد مصدر العملية
 */
export interface EditorEngineAdapter {
  insertBlocks: (blocks: ScreenplayBlock[]) => Promise<void>;
  replaceBlocks: (blocks: ScreenplayBlock[]) => Promise<void>;
  getBlocks: () => ScreenplayBlock[];
  runCommand: (options: RunEditorCommandOptions) => boolean;
  hasSelection: () => boolean;
  copySelectionToClipboard: () => Promise<boolean>;
  cutSelectionToClipboard: () => Promise<boolean>;
  pasteFromClipboard: (origin: ClipboardOrigin) => Promise<boolean>;
}
