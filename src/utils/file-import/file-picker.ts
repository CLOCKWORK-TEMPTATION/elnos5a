/**
 * @module utils/file-import/file-picker
 * @description فتح نافذة اختيار ملف عبر عنصر `<input type="file">` مخفي.
 * يُعيد Promise يحمل الملف المحدد أو `null` عند الإلغاء.
 */
import { ACCEPTED_FILE_EXTENSIONS } from "../../types/file-import";

/**
 * يفتح مربع حوار اختيار ملف ويعيد الملف المحدد.
 *
 * @param accept - أنواع الملفات المقبولة (الافتراضي: {@link ACCEPTED_FILE_EXTENSIONS})
 * @returns الملف المحدد أو `null` إذا ألغى المستخدم
 *
 * @example
 * ```ts
 * const file = await pickImportFile()
 * if (file) { /* معالجة الملف *\/ }
 * ```
 */
export const pickImportFile = (
  accept: string = ACCEPTED_FILE_EXTENSIONS
): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.name = "file-import";
    input.accept = accept;

    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };

    input.click();
  });
