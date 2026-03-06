/**
 * @module extensions/transition
 * @description
 * عنصر الانتقال (Transition) — أوامر المونتاج بين المشاهد.
 *
 * يُصدّر:
 * - {@link isTransitionLine} — كاشف أسطر الانتقال (قطع إلى، مزج إلى، إلخ)
 * - {@link Transition} — عقدة Tiptap للانتقال
 *
 * سلوك Enter: الانتقال إلى {@link SceneHeaderTopLine} (رأس مشهد جديد).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { TRANSITION_RE } from "./arabic-patterns";
import { normalizeLine } from "./text-utils";

/**
 * يفحص ما إذا كان السطر أمر انتقال مونتاجي.
 *
 * @param text - النص الخام للسطر
 * @returns `true` إذا طابق {@link TRANSITION_RE}
 */
export const isTransitionLine = (text: string): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  return TRANSITION_RE.test(normalized);
};

/**
 * الانتقال (Transition)
 * مثال: قطع إلى، مزج إلى
 */
export const Transition = Node.create({
  name: "transition",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="transition"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "transition",
        class: "screenplay-transition",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!editor.isActive("transition")) return false;
        return editor
          .chain()
          .focus()
          .splitBlock()
          .setSceneHeaderTopLine()
          .run();
      },
    };
  },
});
