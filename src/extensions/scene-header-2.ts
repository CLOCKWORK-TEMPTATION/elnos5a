/**
 * @module extensions/scene_header_2
 * @description
 * رأس المشهد — المستوى الثاني (Scene Header 2): الزمان والنوع (داخلي/خارجي).
 *
 * يُصدّر:
 * - {@link isSceneHeader2Line} — كاشف أسطر الزمن+الموقع (نهار/ليل + داخلي/خارجي)
 * - {@link SceneHeader2} — عقدة Tiptap ابن (child) داخل {@link SceneHeaderTopLine}
 *
 * لا يُعرض مستقلاً — يظهر فقط داخل {@link SceneHeaderTopLine}.
 * التنقل بالمفاتيح يُدار من العقدة الأب.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import {
  SCENE_LOCATION_RE,
  SCENE_NUMBER_EXACT_RE,
  SCENE_TIME_RE,
} from "./arabic-patterns";
import { normalizeLine } from "./text-utils";

/**
 * يفحص ما إذا كان السطر يحتوي زمن المشهد + نوع الموقع.
 * يستبعد أرقام المشاهد. يتطلب مطابقة {@link SCENE_TIME_RE} و {@link SCENE_LOCATION_RE} معاً.
 *
 * @param text - النص الخام
 * @returns `true` إذا احتوى على زمن + موقع
 */
export const isSceneHeader2Line = (text: string): boolean => {
  const normalized = normalizeLine(text)
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (SCENE_NUMBER_EXACT_RE.test(normalized)) return false;

  return SCENE_TIME_RE.test(normalized) && SCENE_LOCATION_RE.test(normalized);
};

/**
 * رأس المشهد - المستوى الثاني (Scene Header 2)
 * الزمان والنوع (داخلي/خارجي)
 * مثال: "ليل - خارجي"
 * يُعرض داخل scene_header_top_line فقط
 */
export const SceneHeader2 = Node.create({
  name: "scene_header_2",
  // لا يوجد group لأنه يظهر فقط داخل scene_header_top_line
  content: "inline*",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="scene_header_2"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "scene_header_2",
        class: "screenplay-scene_header_2",
      }),
      0,
    ];
  },
  // التنقل بالمفاتيح يُدار من SceneHeaderTopLine
});
