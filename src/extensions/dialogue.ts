/**
 * @module extensions/dialogue
 * @description
 * عنصر الحوار (Dialogue) — كلام الشخصية في السيناريو.
 *
 * يُصدّر:
 * - {@link hasDirectDialogueCues} — كاشف دلائل الحوار المباشر (علامات تنصيص، نداء، أنماط محادثة)
 * - {@link isDialogueContinuationLine} — كاشف أسطر استمرار الحوار (مسافة بادئة)
 * - {@link getDialogueProbability} — حاسب احتمالية الحوار بالنقاط (score-based)
 * - {@link isDialogueLine} — المُصنّف النهائي للحوار (يجمع الأدلة مع سياق السطر السابق)
 * - {@link Dialogue} — عقدة Tiptap للحوار
 *
 * سلوك Enter: الانتقال إلى {@link Action} (وصف).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type {
  ClassificationContext,
  ElementType,
} from "./classification-types";
import type { ContextMemorySnapshot } from "./context-memory-manager";
import {
  CONVERSATIONAL_MARKERS_RE,
  CONVERSATIONAL_STARTS,
  QUOTE_MARKS_RE,
  VOCATIVE_RE,
  VOCATIVE_TITLES_RE,
} from "./arabic-patterns";
import { collectActionEvidence } from "./action";
import { hasDirectDialogueMarkers, normalizeLine } from "./text-utils";

/**
 * يفحص وجود دلائل حوار مباشر في النص:
 * علامات حوار، أنماط محادثة، نداء، علامات تنصيص، أو كلمات بداية محادثة.
 *
 * @param text - النص الخام
 * @returns `true` إذا وُجدت أي دلالة حوار مباشر
 */
export const hasDirectDialogueCues = (text: string): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;

  if (hasDirectDialogueMarkers(normalized)) return true;
  if (CONVERSATIONAL_MARKERS_RE.test(normalized)) return true;
  if (VOCATIVE_RE.test(normalized)) return true;
  if (VOCATIVE_TITLES_RE.test(normalized)) return true;
  if (QUOTE_MARKS_RE.test(normalized)) return true;

  const firstWord = normalized.split(/\s+/)[0] ?? "";
  if (CONVERSATIONAL_STARTS.includes(firstWord)) return true;

  return false;
};

/**
 * يكتشف أسطر استمرار الحوار (wrapped continuation).
 *
 * السطر يُعد استمراراً إذا:
 * 1. السطر السابق كان `dialogue` أو `parenthetical`
 * 2. السطر الحالي يبدأ بـ tab أو مسافتين بادئتين على الأقل
 *
 * @param rawLine - السطر الخام (قبل التطبيع)
 * @param previousType - نوع العنصر السابق
 * @returns `true` إذا كان السطر استمراراً لحوار سابق
 *
 * @example
 * ```ts
 * isDialogueContinuationLine('\tوكمان بيقول كده', 'dialogue') // true
 * isDialogueContinuationLine('كلام عادي', 'action')           // false
 * ```
 */
export const isDialogueContinuationLine = (
  rawLine: string,
  previousType: ElementType | null
): boolean => {
  if (!rawLine) return false;
  if (previousType !== "dialogue" && previousType !== "parenthetical")
    return false;

  return /^[\t]/.test(rawLine) || /^[ ]{2,}\S+/.test(rawLine);
};

/**
 * يحسب احتمالية أن يكون السطر حواراً عبر نظام نقاط تراكمي.
 *
 * جدول النقاط:
 * | الدليل | النقاط |
 * |--------|--------|
 * | دلائل حوار مباشر ({@link hasDirectDialogueCues}) | +4 |
 * | علامات استفهام/تعجب | +2 |
 * | علامات حذف (…) | +1 |
 * | طول مناسب (2–20 كلمة) | +1 |
 * | سياق بعد character/dialogue/parenthetical | +2 |
 * | دليل وصف بشرطة ({@link ActionEvidence.byDash}) | −4 |
 * | دليل وصف بنمط أو فعل | −2 |
 * | دليل سرد أو صوتي | −2 |
 *
 * @param text - النص الخام
 * @param context - سياق التصنيف (اختياري)
 * @returns مجموع النقاط — كلما زادت دلّت على حوار
 *
 * @example
 * ```ts
 * getDialogueProbability('يا أبو أحمد!') // ≥ 6
 * getDialogueProbability('- يفتح الباب') // ≤ 0
 * ```
 */
export const getDialogueProbability = (
  text: string,
  context?: Partial<ClassificationContext>
): number => {
  const normalized = normalizeLine(text);
  if (!normalized) return 0;

  let score = 0;

  if (hasDirectDialogueCues(normalized)) score += 4;
  if (/[؟?!]/.test(normalized)) score += 2;
  if (/(?:\.\.\.|…)/.test(normalized)) score += 1;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 2 && wordCount <= 20) score += 1;

  if (
    context?.previousType === "character" ||
    context?.previousType === "dialogue" ||
    context?.previousType === "parenthetical"
  ) {
    score += 2;
  }

  const actionEvidence = collectActionEvidence(normalized);
  if (actionEvidence.byDash) score -= 4;
  if (actionEvidence.byPattern || actionEvidence.byVerb) score -= 2;
  if (actionEvidence.byNarrativeSyntax || actionEvidence.byAudioNarrative)
    score -= 2;

  return score;
};

/**
 * المُصنّف النهائي للحوار — يجمع أدلة الوصف والحوار مع سياق السطر السابق.
 *
 * ترتيب الأولوية:
 * 1. إذا وُجدت أدلة وصف قوية (dash/pattern/verb/narrative/pronoun/then/audio) → `false`
 * 2. إذا وُجدت دلائل حوار مباشر → `true`
 * 3. إذا كان السابق `character` أو `parenthetical` → `true` (موضع حوار طبيعي)
 * 4. إذا كانت احتمالية الحوار {@link getDialogueProbability} ≥ 5 → `true`
 *
 * @param text - النص الخام
 * @param context - سياق التصنيف (اختياري)
 * @returns `true` إذا صُنّف كحوار
 *
 * @example
 * ```ts
 * isDialogueLine('والله العظيم ما هسكت!', { previousType: 'character' }) // true
 * isDialogueLine('- يضرب الباب بعنف')                                   // false
 * ```
 */
export const isDialogueLine = (
  text: string,
  context?: Partial<ClassificationContext>,
  memorySnapshot?: ContextMemorySnapshot
): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;

  const actionEvidence = collectActionEvidence(normalized);

  // داخل dialogue flow → byVerb أو byStructure لوحدهم مش كافيين يكسروا الحوار
  // لازم دليل أقوى (dash/pattern/narrative/audio)
  const inDialogueFlow = memorySnapshot?.isInDialogueFlow ?? false;
  const hasStrongAction =
    actionEvidence.byDash ||
    actionEvidence.byPattern ||
    (actionEvidence.byVerb && !inDialogueFlow) ||
    (actionEvidence.byStructure && !inDialogueFlow) ||
    actionEvidence.byNarrativeSyntax ||
    actionEvidence.byPronounAction ||
    actionEvidence.byThenAction ||
    actionEvidence.byAudioNarrative;

  if (hasStrongAction) return false;
  if (hasDirectDialogueCues(normalized)) return true;

  if (
    context?.previousType === "character" ||
    context?.previousType === "parenthetical"
  ) {
    return true;
  }

  return getDialogueProbability(normalized, context) >= 5;
};

/**
 * الحوار (Dialogue)
 * كلام الشخصية
 */
export const Dialogue = Node.create({
  name: "dialogue",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="dialogue"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "dialogue",
        class: "screenplay-dialogue",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      // الانتقال إلى الوصف عند الضغط على Enter
      Enter: ({ editor }) => {
        if (!editor.isActive("dialogue")) return false;
        return editor.chain().focus().splitBlock().setAction().run();
      },
    };
  },
});
