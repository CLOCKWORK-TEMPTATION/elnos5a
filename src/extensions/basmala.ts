/**
 * @module extensions/basmala
 * @description
 * عنصر البسملة (Basmala) — "بسم الله الرحمن الرحيم".
 *
 * يُصدّر:
 * - {@link isBasmalaLine} — كاشف واسع (signature) لوجود كلمات البسملة في السطر
 * - {@link isStandaloneBasmalaLine} — كاشف صارم: السطر كله بسملة مستقلة بدون prefix حواري
 * - {@link Basmala} — عقدة Tiptap للبسملة
 *
 * سلوك Enter: الانتقال إلى {@link SceneHeaderTopLine} (رأس مشهد).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import {
  BASMALA_ALLAH_RE,
  BASMALA_BASM_RE,
  BASMALA_RAHIM_RE,
  BASMALA_RAHMAN_RE,
} from "./arabic-patterns";
import { normalizeLine } from "./text-utils";

/**
 * يفحص ما إذا كان السطر بسملة — يتطلب وجود "بسم" + "الله" + ("الرحمن" أو "الرحيم").
 * يُنظّف الأقواس والمحارف غير المرئية قبل الفحص.
 *
 * @param text - النص الخام للسطر
 * @returns `true` إذا طابق نمط البسملة
 */
export const isBasmalaLine = (text: string): boolean => {
  const cleaned = (text ?? "")
    .replace(/[{}()\x5B\x5D﴾﴿]/g, "")
    .replace(/[\u200f\u200e\ufeff]/g, "")
    .trim();

  const normalized = normalizeLine(cleaned);
  if (!normalized) return false;

  return (
    BASMALA_BASM_RE.test(normalized) &&
    BASMALA_ALLAH_RE.test(normalized) &&
    (BASMALA_RAHMAN_RE.test(normalized) || BASMALA_RAHIM_RE.test(normalized))
  );
};

/**
 * الحرف الموحد للبسملة في Unicode (﷽)
 */
const BASMALA_SINGLE_CHAR = "\uFDFD";

/**
 * Regex صارم: السطر كله بسملة مستقلة — بدون prefix حواري أو اسم شخصية.
 * يقبل: "بسم الله الرحمن الرحيم" (مع/بدون تشكيل ومسافات متغيرة)
 * يرفض: "بوسي : بسم الله الرحمن الرحيم" أو "قال: بسم الله"
 */
const STANDALONE_BASMALA_RE =
  /^\s*(?:﷽|بسم[\u064B-\u0652]*\s+الله[\u064B-\u0652]*\s+الرحمن[\u064B-\u0652]*\s+الرحيم[\u064B-\u0652]*)\s*$/;

/**
 * كاشف صارم: السطر كله بسملة مستقلة بدون أي prefix.
 * يرفض أي سطر فيه delimiter حواري (`:`) قبل "بسم"، أو كلمات زائدة.
 *
 * @param text - النص الخام للسطر
 * @returns `true` فقط إذا كان السطر بسملة مستقلة بالكامل
 */
export const isStandaloneBasmalaLine = (text: string): boolean => {
  const cleaned = (text ?? "")
    .replace(/[{}()\x5B\x5D﴾﴿]/g, "")
    .replace(/[\u200f\u200e\ufeff]/g, "")
    .trim();

  if (!cleaned) return false;

  if (cleaned === BASMALA_SINGLE_CHAR) return true;

  const colonIndex = cleaned.indexOf(":");
  const colonFullWidth = cleaned.indexOf("：");
  if (colonIndex !== -1 || colonFullWidth !== -1) return false;

  const normalized = normalizeLine(cleaned);
  if (!normalized) return false;

  const withoutDiacritics = normalized.replace(/[\u064B-\u0652\u0670]/g, "");

  return STANDALONE_BASMALA_RE.test(withoutDiacritics);
};

/**
 * البسملة (Basmala)
 * "بسم الله الرحمن الرحيم"
 */
export const Basmala = Node.create({
  name: "basmala",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="basmala"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "basmala",
        class: "screenplay-basmala",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      // بعد البسملة ينتقل إلى رأس المشهد
      Enter: ({ editor }) => {
        if (!editor.isActive("basmala")) return false;
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
