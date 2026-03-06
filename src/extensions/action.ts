/**
 * @module extensions/action
 * @description
 * عنصر الوصف/الحدث (Action) — يصف ما يحدث في المشهد.
 *
 * يُصدّر:
 * - {@link ActionEvidence} — واجهة أدلة الوصف (9 أعلام منطقية)
 * - {@link collectActionEvidence} — جامع أدلة الوصف من النص
 * - {@link isActionLine} — المُصنّف النهائي للوصف (score-based، عتبة ≥ 2)
 * - {@link Action} — عقدة Tiptap للوصف
 *
 * سلوك Enter: الانتقال إلى {@link Action} آخر (استمرار الوصف).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { ClassificationContext } from "./classification-types";
import {
  PRONOUN_ACTION_RE,
  SCENE_NUMBER_EXACT_RE,
  THEN_ACTION_RE,
  TRANSITION_RE,
} from "./arabic-patterns";
import {
  hasActionVerbStructure,
  isActionCueLine,
  isActionVerbStart,
  isActionWithDash,
  looksLikeNarrativeActionSyntax,
  matchesActionStartPattern,
  normalizeLine,
} from "./text-utils";

/**
 * أدلة تصنيف سطر كوصف/حدث — 9 أعلام منطقية مستقلة.
 *
 * يُستخدم في {@link collectActionEvidence} ويُستهلك في
 * {@link isActionLine} و {@link isDialogueLine} لحساب النقاط.
 */
export interface ActionEvidence {
  byDash: boolean;
  byCue: boolean;
  byPattern: boolean;
  byVerb: boolean;
  byStructure: boolean;
  byNarrativeSyntax: boolean;
  byPronounAction: boolean;
  byThenAction: boolean;
  byAudioNarrative: boolean;
}

/**
 * نمط regex للإشارات الصوتية السردية — أفعال سمع وأسماء أصوات.
 *
 * يتطابق مع أسطر تبدأ بكلمة صوتية مثل:
 * `نسمع`، `صوت`، `أصوات`، `دوي`، `طلقات`، `انفجار`، `صراخ`، `همس`، `بكاء`، `ضحك`...
 * متبوعة بمسافة وكلمة أخرى أو نهاية السطر.
 *
 * يُستخدم في {@link collectActionEvidence} لحساب `byAudioNarrative`.
 */
const NARRATIVE_AUDIO_CUE_RE =
  /^(?:نسمع|يسمع|تسمع|يُسمع|صوت|أصوات|دوي|ضجيج|طرق(?:ات)?|طلقات|انفجار|رنين|صفير|صراخ|صرخة|همس|أنين|بكاء|ضحك)(?:\s+\S|$)/;

/**
 * يجمع أدلة تصنيف السطر كوصف/حدث من 9 مصادر مستقلة.
 *
 * كل علم يُحسب من دالة فحص منفصلة:
 * - `byDash` — يبدأ بشرطة ({@link isActionWithDash})
 * - `byCue` — يتطابق مع إشارة وصف ({@link isActionCueLine})
 * - `byPattern` — يتطابق مع نمط بداية وصف ({@link matchesActionStartPattern})
 * - `byVerb` — يبدأ بفعل وصفي ({@link isActionVerbStart})
 * - `byStructure` — بنية فعل + ضمير ({@link hasActionVerbStructure})
 * - `byNarrativeSyntax` — تركيب سردي كامل ({@link looksLikeNarrativeActionSyntax})
 * - `byPronounAction` — فعل + ضمير متصل ({@link PRONOUN_ACTION_RE})
 * - `byThenAction` — "ثم" + فعل ({@link THEN_ACTION_RE})
 * - `byAudioNarrative` — إشارة صوتية سردية ({@link NARRATIVE_AUDIO_CUE_RE})
 *
 * @param text - النص الخام
 * @returns كائن {@link ActionEvidence} بـ 9 أعلام
 *
 * @example
 * ```ts
 * collectActionEvidence('- يفتح الباب')
 * // { byDash: true, byCue: false, byPattern: false, ... }
 * ```
 */
export const collectActionEvidence = (text: string): ActionEvidence => {
  const normalized = normalizeLine(text);

  return {
    byDash: isActionWithDash(normalized),
    byCue: isActionCueLine(normalized),
    byPattern: matchesActionStartPattern(normalized),
    byVerb: isActionVerbStart(normalized),
    byStructure: hasActionVerbStructure(normalized),
    byNarrativeSyntax: looksLikeNarrativeActionSyntax(normalized),
    byPronounAction: PRONOUN_ACTION_RE.test(normalized),
    byThenAction: THEN_ACTION_RE.test(normalized),
    byAudioNarrative: NARRATIVE_AUDIO_CUE_RE.test(normalized),
  };
};

/**
 * المُصنّف النهائي للوصف/الحدث — يجمع الأدلة ويحسب النقاط.
 *
 * الاستبعادات الأولية:
 * - أسطر الانتقال ({@link TRANSITION_RE}) → `false`
 * - أسطر رقم المشهد ({@link SCENE_NUMBER_EXACT_RE}) → `false`
 * - سطر قصير (≤ 3 كلمات) منتهٍ بنقطتين (اسم شخصية محتمل) → `false`
 *
 * جدول النقاط:
 * | الدليل | النقاط |
 * |--------|--------|
 * | `byDash` (شرطة) | عودة فورية `true` |
 * | `byCue` | +2 |
 * | `byPattern` | +2 |
 * | `byVerb` | +2 |
 * | `byStructure` | +1 |
 * | `byNarrativeSyntax` | +1 |
 * | `byPronounAction` | +1 |
 * | `byThenAction` | +1 |
 * | `byAudioNarrative` | +2 |
 *
 * قواعد السياق:
 * - داخل كتلة حوار (`isInDialogueBlock`) → يتطلب ≥ 3
 * - بعد وصف سابق (`previousType === 'action'`) → يكفي ≥ 1
 * - الحالة الافتراضية → يتطلب ≥ 2
 *
 * @param text - النص الخام
 * @param context - سياق التصنيف (اختياري)
 * @returns `true` إذا صُنّف كوصف/حدث
 */
export const isActionLine = (
  text: string,
  context?: Partial<ClassificationContext>
): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;

  if (TRANSITION_RE.test(normalized)) return false;
  if (SCENE_NUMBER_EXACT_RE.test(normalized)) return false;

  // سطر قصير منتهي بنقطتين غالبًا اسم شخصية.
  if (
    /[:：]\s*$/.test(normalized) &&
    normalized.split(/\s+/).filter(Boolean).length <= 3
  ) {
    return false;
  }

  const evidence = collectActionEvidence(normalized);
  if (evidence.byDash) return true;

  let score = 0;
  if (evidence.byCue) score += 2;
  if (evidence.byPattern) score += 2;
  if (evidence.byVerb) score += 2;
  if (evidence.byStructure) score += 1;
  if (evidence.byNarrativeSyntax) score += 1;
  if (evidence.byPronounAction) score += 1;
  if (evidence.byThenAction) score += 1;
  if (evidence.byAudioNarrative) score += 2;

  if (context?.isInDialogueBlock && score < 3) return false;
  if (context?.previousType === "action" && score >= 1) return true;

  return score >= 2;
};

/**
 * الوصف / الحدث (Action)
 * يصف ما يحدث في المشهد
 */
export const Action = Node.create({
  name: "action",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="action"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "action",
        class: "screenplay-action",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!editor.isActive("action")) return false;
        return editor.chain().focus().splitBlock().setAction().run();
      },
    };
  },
});
