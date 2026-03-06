/**
 * @module types/editor-clipboard
 * @description أنماط الحافظة المخصصة — تُعرّف حمولة النسخ/اللصق الداخلية للتطبيق
 *
 * النسخ داخل التطبيق يحفظ معلومات التصنيف عبر MIME مخصص.
 * اللصق من خارج التطبيق يمر عبر خط أنابيب التصنيف التلقائي.
 */

import type { ScreenplayBlock } from "../utils/file-import/document-model";

/**
 * نوع MIME المخصص للحافظة — يُميّز محتوى أفان تيتر عن النص العادي
 *
 * @example
 * ```typescript
 * event.clipboardData?.getData(FILMLANE_CLIPBOARD_MIME)
 * ```
 */
export const FILMLANE_CLIPBOARD_MIME =
  "application/x-filmlane-blocks+json" as const;

/**
 * مصدر محتوى الحافظة
 * - `selection` — نص محدد جزئياً
 * - `document` — المستند بالكامل
 */
export type ClipboardSourceKind = "selection" | "document";

/**
 * مصدر عملية اللصق — يحدد كيف بدأ المستخدم عملية اللصق
 * - `menu` — من قائمة "تعديل"
 * - `shortcut` — من Ctrl+V
 * - `context` — من قائمة النقر الأيمن
 * - `native` — لصق أصلي من المتصفح
 */
export type ClipboardOrigin = "menu" | "shortcut" | "context" | "native";

/**
 * حمولة الحافظة الداخلية — تُخزن مع MIME المخصص عند النسخ
 *
 * @property plainText - النص العادي (fallback للتطبيقات الخارجية)
 * @property html - تمثيل HTML اختياري
 * @property blocks - كتل السيناريو المُصنّفة (الحمولة الأساسية)
 * @property sourceKind - هل المصدر تحديد جزئي أم المستند كاملاً
 * @property hash - تدقيق FNV1a للتحقق من سلامة البيانات
 * @property createdAt - طابع زمني ISO 8601 لوقت النسخ
 */
export interface EditorClipboardPayload {
  plainText: string;
  html?: string;
  blocks?: ScreenplayBlock[];
  sourceKind: ClipboardSourceKind;
  hash: string;
  createdAt: string;
}
