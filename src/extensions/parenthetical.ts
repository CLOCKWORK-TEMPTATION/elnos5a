/**
 * @module extensions/parenthetical
 * @description
 * عنصر الإرشاد التمثيلي (Parenthetical) — توجيهات أداء الممثل داخل الحوار.
 *
 * يُصدّر:
 * - {@link isParentheticalLine} — كاشف أسطر الإرشاد التمثيلي (أقواس عربية/لاتينية)
 * - {@link Parenthetical} — عقدة Tiptap للإرشاد التمثيلي
 *
 * سلوك Enter: الانتقال إلى {@link Dialogue} (حوار).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { PARENTHETICAL_RE } from "./arabic-patterns";
import { normalizeLine } from "./text-utils";

/**
 * يفحص ما إذا كان السطر إرشاداً تمثيلياً محاطاً بأقواس.
 *
 * @param text - النص الخام للسطر
 * @returns `true` إذا طابق {@link PARENTHETICAL_RE}
 */
export const isParentheticalLine = (text: string): boolean => {
  const normalized = normalizeLine(text);
  return PARENTHETICAL_RE.test(normalized);
};

/**
 * الإرشاد التمثيلي (Parenthetical)
 * توجيهات أداء داخل الحوار
 */
export const Parenthetical = Node.create({
  name: "parenthetical",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="parenthetical"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "parenthetical",
        class: "screenplay-parenthetical",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!editor.isActive("parenthetical")) return false;
        return editor.chain().focus().splitBlock().setDialogue().run();
      },
    };
  },
});
