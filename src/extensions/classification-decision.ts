/**
 * @module extensions/classification-decision
 * @description
 * نظام حسم الغموض السردي — يحل التعارض بين وصف/حوار/شخصية
 * عبر مقارنة النقاط (score competition) مع بوابات تعريف صارمة.
 *
 * يُصدّر:
 * - {@link ResolvedNarrativeType} — الأنواع الثلاثة القابلة للحسم
 * - {@link NarrativeDecision} — نتيجة الحسم (نوع + سبب + فجوة النقاط)
 * - {@link getContextTypeScore} — يحسب نقاط السياق من الأنواع الـ 6 الأخيرة
 * - {@link scoreActionEvidence} — يحسب نقاط أدلة الوصف
 * - {@link passesActionDefinitionGate} — بوابة تعريف الوصف
 * - {@link isDialogueHardBreaker} — كاسر حوار صلب (أدلة وصف ≥ 5)
 * - {@link passesDialogueDefinitionGate} — بوابة تعريف الحوار
 * - {@link passesCharacterDefinitionGate} — بوابة تعريف الشخصية
 * - {@link resolveNarrativeDecision} — الدالة الرئيسية لحسم الغموض
 *
 * يُستهلك في {@link PasteClassifier} → `classifyLines()` كآخر خطوة احتياطية.
 */
import {
  collectActionEvidence,
  type ActionEvidence,
  isActionLine,
} from "./action";
import { isCharacterLine } from "./character";
import type { ClassificationContext } from "./classification-types";
import type { ContextMemorySnapshot } from "./context-memory-manager";
import {
  getDialogueProbability,
  hasDirectDialogueCues,
  isDialogueLine,
} from "./dialogue";
import { normalizeCharacterName, normalizeLine } from "./text-utils";

/**
 * الأنواع الثلاثة القابلة للحسم عند غموض السطر.
 */
export type ResolvedNarrativeType = "action" | "dialogue" | "character";

/**
 * نتيجة حسم الغموض السردي.
 *
 * - `type` — النوع الفائز
 * - `reason` — سبب الاختيار (بصيغة `'score:action'` مثلاً)
 * - `scoreGap` — الفرق بين الفائز والوصيف (كلما زاد كان الحسم أقوى)
 */
export interface NarrativeDecision {
  readonly type: ResolvedNarrativeType;
  readonly reason: string;
  readonly scoreGap: number;
}

/**
 * يحسب نقاط السياق بناءً على آخر 6 أنواع سابقة.
 *
 * الأنواع الأحدث تحصل على وزن أعلى (الأخير = 6، الأقدم = 1).
 * `parenthetical` يُعامل كـ `dialogue` بوزن مخفّض.
 *
 * @param context - سياق التصنيف
 * @param candidateTypes - الأنواع المرشحة لحساب النقاط
 * @returns مجموع النقاط الموزونة
 */
export const getContextTypeScore = (
  context: ClassificationContext,
  candidateTypes: readonly ResolvedNarrativeType[]
): number => {
  const recent = context.previousTypes.slice(-6);
  let score = 0;

  for (let i = 0; i < recent.length; i++) {
    const weight = recent.length - i;
    const type = recent[i];

    if (type === "action" && candidateTypes.includes("action")) score += weight;
    if (type === "dialogue" && candidateTypes.includes("dialogue"))
      score += weight;
    if (type === "character" && candidateTypes.includes("character"))
      score += weight;
    if (type === "parenthetical" && candidateTypes.includes("dialogue"))
      score += Math.max(1, weight - 1);
  }

  return score;
};

/**
 * يحسب نقاط أدلة الوصف — جدول أوزان ثابت.
 *
 * | الدليل | النقاط |
 * |--------|--------|
 * | `byDash` | +5 |
 * | `byCue` | +3 |
 * | `byPattern` | +3 |
 * | `byVerb` | +2 |
 * | `byStructure` | +1 |
 * | `byNarrativeSyntax` | +2 |
 * | `byPronounAction` | +2 |
 * | `byThenAction` | +1 |
 * | `byAudioNarrative` | +2 |
 *
 * @param evidence - أدلة الوصف
 * @returns مجموع النقاط (0–21)
 */
export const scoreActionEvidence = (evidence: ActionEvidence): number => {
  let score = 0;
  if (evidence.byDash) score += 5;
  if (evidence.byCue) score += 3;
  if (evidence.byPattern) score += 3;
  if (evidence.byVerb) score += 2;
  if (evidence.byStructure) score += 1;
  if (evidence.byNarrativeSyntax) score += 2;
  if (evidence.byPronounAction) score += 2;
  if (evidence.byThenAction) score += 1;
  if (evidence.byAudioNarrative) score += 2;
  return score;
};

/**
 * بوابة تعريف الوصف — يحدد إذا كان السطر مؤهلاً كوصف/حدث.
 *
 * يمرّ إذا: شرطة، أو نمط/فعل/سرد، أو (سابق=وصف ونقاط ≥ 1)،
 * أو عبر {@link isActionLine} كاحتياطي.
 *
 * @param line - النص المُطبّع
 * @param context - سياق التصنيف
 * @param evidence - أدلة الوصف
 * @returns `true` إذا مؤهل كوصف
 */
export const passesActionDefinitionGate = (
  line: string,
  context: ClassificationContext,
  evidence: ActionEvidence
): boolean => {
  if (evidence.byDash) return true;
  if (evidence.byPattern || evidence.byVerb || evidence.byNarrativeSyntax)
    return true;
  if (context.previousType === "action" && scoreActionEvidence(evidence) >= 1)
    return true;

  return isActionLine(line, context);
};

/**
 * كاسر الحوار الصلب — إذا كانت أدلة الوصف قوية جداً (≥ 5)
 * ولا توجد دلائل حوار مباشر، يُستبعد السطر من الحوار.
 *
 * @param line - النص المُطبّع
 * @param _context - سياق التصنيف (غير مُستخدم حالياً)
 * @param evidence - أدلة الوصف
 * @returns `true` إذا يجب كسر الحوار
 */
export const isDialogueHardBreaker = (
  line: string,
  _context: ClassificationContext,
  evidence: ActionEvidence
): boolean => {
  if (hasDirectDialogueCues(line)) return false;
  const actionScore = scoreActionEvidence(evidence);
  return actionScore >= 5;
};

/**
 * بوابة تعريف الحوار — يحدد إذا كان السطر مؤهلاً كحوار.
 *
 * يُستبعد أولاً إذا مرّ بـ {@link isDialogueHardBreaker}.
 * ثم يمرّ إذا: {@link isDialogueLine}، أو (في تدفق حوار + نقاط ≥ 2)،
 * أو نقاط حوار ≥ 5.
 *
 * @param line - النص المُطبّع
 * @param context - سياق التصنيف
 * @param dialogueScore - نقاط احتمالية الحوار
 * @param evidence - أدلة الوصف (لفحص الكاسر)
 * @returns `true` إذا مؤهل كحوار
 */
export const passesDialogueDefinitionGate = (
  line: string,
  context: ClassificationContext,
  dialogueScore: number,
  evidence: ActionEvidence,
  memorySnapshot?: ContextMemorySnapshot
): boolean => {
  if (isDialogueHardBreaker(line, context, evidence)) return false;
  if (isDialogueLine(line, context, memorySnapshot)) return true;

  const inDialogueFlow =
    memorySnapshot?.isInDialogueFlow ??
    (context.previousType === "character" ||
      context.previousType === "dialogue" ||
      context.previousType === "parenthetical");

  // داخل dialogue flow + أي دليل حوار (score ≥ 1) → حوار
  if (inDialogueFlow && dialogueScore >= 1) return true;
  return dialogueScore >= 5;
};

/**
 * بوابة تعريف الشخصية — تفوّض لـ {@link isCharacterLine}.
 *
 * @param line - النص المُطبّع
 * @param context - سياق التصنيف
 * @returns `true` إذا مؤهل كاسم شخصية
 */
export const passesCharacterDefinitionGate = (
  line: string,
  context: ClassificationContext,
  confirmedCharacters?: ReadonlySet<string>
): boolean => {
  return isCharacterLine(line, context, confirmedCharacters);
};

/**
 * الدالة الرئيسية لحسم الغموض — تُقارن نقاط الوصف والحوار والشخصية
 * وتختار النوع ذا أعلى مجموع (أدلة + سياق).
 *
 * خطوات الحسم:
 * 1. جمع أدلة الوصف ({@link collectActionEvidence})
 * 2. حساب نقاط الحوار ({@link getDialogueProbability})
 * 3. فحص البوابات الثلاث (action/dialogue/character)
 * 4. حساب نقاط النوع = نقاط الأدلة + نقاط السياق
 * 5. الفائز = أعلى مجموع (مع `scoreGap` = الفرق عن الوصيف)
 *
 * إذا كان السطر فارغاً: يُعيد `action` كقيمة افتراضية.
 *
 * @param line - النص الخام
 * @param context - سياق التصنيف
 * @returns {@link NarrativeDecision}
 */
export const resolveNarrativeDecision = (
  line: string,
  context: ClassificationContext,
  memorySnapshot?: ContextMemorySnapshot
): NarrativeDecision => {
  const normalized = normalizeLine(line);
  if (!normalized) {
    return { type: "action", reason: "empty-default", scoreGap: 0 };
  }

  const evidence = collectActionEvidence(normalized);
  const dialogueScore = getDialogueProbability(normalized, context);

  const actionCandidate = passesActionDefinitionGate(
    normalized,
    context,
    evidence
  );
  const dialogueCandidate = passesDialogueDefinitionGate(
    normalized,
    context,
    dialogueScore,
    evidence,
    memorySnapshot
  );
  const characterCandidate = passesCharacterDefinitionGate(
    normalized,
    context,
    memorySnapshot?.confirmedCharacters
  );

  const scores = {
    action: Number.NEGATIVE_INFINITY,
    dialogue: Number.NEGATIVE_INFINITY,
    character: Number.NEGATIVE_INFINITY,
  };

  if (actionCandidate) {
    scores.action =
      scoreActionEvidence(evidence) + getContextTypeScore(context, ["action"]);
  }

  if (dialogueCandidate) {
    scores.dialogue =
      dialogueScore + getContextTypeScore(context, ["dialogue"]);
  }

  if (characterCandidate) {
    // اسم مؤكد في الـ registry ياخد نقاط أعلى
    const charName = normalizeCharacterName(normalized);
    const isConfirmed = charName
      ? memorySnapshot?.confirmedCharacters?.has(charName)
      : false;
    scores.character =
      (isConfirmed ? 12 : 8) + getContextTypeScore(context, ["character"]);
  }

  const sorted = (Object.keys(scores) as ResolvedNarrativeType[]).sort(
    (a, b) => scores[b] - scores[a]
  );
  const winner = sorted[0];
  const runnerUp = sorted[1];

  return {
    type: winner,
    reason: `score:${winner}`,
    scoreGap: scores[winner] - scores[runnerUp],
  };
};
