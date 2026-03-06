/**
 * @module extensions/scene_header_1
 * @description
 * رأس المشهد — المستوى الأول (Scene Header 1): رقم المشهد ونوعه.
 *
 * يُصدّر:
 * - {@link extractSceneHeader1Number} — مستخرج رقم المشهد (مثال: "مشهد 1")
 * - {@link isSceneHeader1Line} — كاشف أسطر رقم المشهد
 * - {@link SceneHeader1} — عقدة Tiptap ابن (child) داخل {@link SceneHeaderTopLine}
 *
 * لا يُعرض مستقلاً — يظهر فقط داخل {@link SceneHeaderTopLine}.
 * التنقل بالمفاتيح يُدار من العقدة الأب.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { SCENE_NUMBER_EXACT_RE } from "./arabic-patterns";
import { normalizeLine } from "./text-utils";

/**
 * يستخرج رقم/عنوان المشهد من سطر scene_header_1.
 *
 * @param text - النص الخام
 * @returns النص المطابق (مثل "مشهد 5") أو `null`
 */
export const extractSceneHeader1Number = (text: string): string | null => {
  const normalized = normalizeLine(text);
  const match = normalized.match(/^((?:مشهد|scene)\s*[0-9٠-٩]+)$/i);
  return match ? match[1].trim() : null;
};

/**
 * يفحص ما إذا كان السطر رقم مشهد فقط (مطابقة {@link SCENE_NUMBER_EXACT_RE} + استخراج ناجح).
 *
 * @param text - النص الخام
 * @returns `true` إذا كان السطر رقم مشهد صالح
 */
export const isSceneHeader1Line = (text: string): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (!SCENE_NUMBER_EXACT_RE.test(normalized)) return false;
  return extractSceneHeader1Number(normalized) !== null;
};

/**
 * رأس المشهد - المستوى الأول (Scene Header 1)
 * رقم المشهد ونوعه
 * مثال: "مشهد 1"
 * يُعرض داخل scene_header_top_line فقط
 */
export const SceneHeader1 = Node.create({
  name: "scene_header_1",
  // لا يوجد group لأنه يظهر فقط داخل scene_header_top_line
  content: "inline*",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="scene_header_1"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "scene_header_1",
        class: "screenplay-scene_header_1",
      }),
      0,
    ];
  },
  // التنقل بالمفاتيح يُدار من SceneHeaderTopLine
});
