/**
 * @module extensions/hybrid-classifier
 * @description
 * مصنّف هجين خفيف: regex قوي + سياق + ذاكرة قصيرة.
 *
 * يعمل كطبقة تصنيف ثانية بعد كواشف regex الأولية، ويُحسّن
 * الحالات الرمادية (السطور الغامضة) بدون تبعيات خارجية أو AI.
 *
 * يُصدّر:
 * - {@link HybridResult} — نتيجة التصنيف (نوع + ثقة + طريقة)
 * - {@link HybridClassifier} — الفئة الرئيسية مع `classifyLine()`
 *
 * سلّم الثقة:
 * | الحالة | الثقة |
 * |--------|-------|
 * | بسملة (regex) | 99 |
 * | رأس مشهد علوي (regex) | 96 |
 * | انتقال (regex) | 95 |
 * | شخصية معروفة من الذاكرة | 92 |
 * | نمط حوار ×3 | 86 |
 * | نمط وصف ×3 | 85 |
 * | قيمة احتياطية | 80 |
 *
 * يُستهلك في {@link PasteClassifier} → `classifyLines()`.
 */
import { collectActionEvidence } from "./action";
import { isStandaloneBasmalaLine } from "./basmala";
import type {
  ClassificationContext,
  ClassificationMethod,
  ElementType,
} from "./classification-types";
import type { ContextMemorySnapshot } from "./context-memory-manager";
import { hasDirectDialogueCues, getDialogueProbability } from "./dialogue";
import type { LineContextInfo } from "./document-context-graph";
import { isCompleteSceneHeaderLine } from "./scene-header-top-line";
import { isTransitionLine } from "./transition";
import { normalizeCharacterName } from "./text-utils";

/**
 * نتيجة التصنيف الهجين — نوع العنصر مع درجة الثقة وطريقة التصنيف.
 */
export interface HybridResult {
  readonly type: ElementType;
  readonly confidence: number;
  readonly classificationMethod: ClassificationMethod;
}

/**
 * مصنف هجين خفيف: regex قوي + سياق + ذاكرة قصيرة.
 * الهدف تحسين الحالات الرمادية بدون تبعيات خارجية.
 */
export class HybridClassifier {
  /**
   * يصنّف سطراً واحداً عبر سلسلة أولويات:
   * basmala → sceneHeaderTopLine → transition → شخصية معروفة → أدلة مُثرية → احتياطي.
   *
   * @param line - السطر المطبّع
   * @param fallbackType - النوع الاحتياطي من المصنّف الأولي
   * @param context - سياق التصنيف (الأنواع السابقة)
   * @param memory - لقطة ذاكرة السياق
   * @param lineCtx - سياق السطر من DCG (اختياري)
   * @returns {@link HybridResult}
   */
  classifyLine(
    line: string,
    fallbackType: ElementType,
    context: ClassificationContext,
    memory: ContextMemorySnapshot,
    lineCtx?: LineContextInfo
  ): HybridResult {
    // ── أولوية 1: أنماط regex حاسمة ──
    if (isStandaloneBasmalaLine(line)) {
      return { type: "basmala", confidence: 99, classificationMethod: "regex" };
    }

    if (isCompleteSceneHeaderLine(line)) {
      return {
        type: "scene_header_1",
        confidence: 96,
        classificationMethod: "regex",
      };
    }

    if (isTransitionLine(line)) {
      return {
        type: "transition",
        confidence: 95,
        classificationMethod: "regex",
      };
    }

    // ── أولوية 2: شخصية معروفة من الذاكرة ──
    if (fallbackType === "character") {
      const characterName = normalizeCharacterName(line);
      const seenCount = memory.characterFrequency.get(characterName) ?? 0;
      if (seenCount >= 1) {
        return {
          type: "character",
          confidence: 92,
          classificationMethod: "context",
        };
      }
    }

    // ── أولوية 3: تصنيف مبني على أدلة (بدل التكرار الأعمى) ──
    const evidence = collectHybridEvidence(line, context, memory, lineCtx);

    // المقارنة: الفائز هو صاحب أعلى مجموع
    if (evidence.actionTotal > evidence.dialogueTotal + 1) {
      return {
        type: "action",
        confidence: Math.min(92, 78 + evidence.actionTotal),
        classificationMethod: "context",
      };
    }

    if (evidence.dialogueTotal > evidence.actionTotal + 1) {
      return {
        type: "dialogue",
        confidence: Math.min(92, 78 + evidence.dialogueTotal),
        classificationMethod: "context",
      };
    }

    // متقاربين → نثق بالـ fallbackType
    return {
      type: fallbackType,
      confidence: 80,
      classificationMethod: "context",
    };
  }
}

// ─── أدلة التصنيف الهجين ──────────────────────────────────────────

/** نتيجة تجميع أدلة التصنيف */
interface HybridEvidenceResult {
  readonly actionTotal: number;
  readonly dialogueTotal: number;
}

/** وزن متناقص لآخر N أنواع — الأحدث = أعلى */
const CONTEXT_WEIGHTS = [5, 4, 3, 2, 1] as const;

/**
 * حساب context bonus لنوع معين من الأنواع السابقة.
 * الأحدث بيساهم أكتر — وزن 5 لآخر نوع، 1 لخامس نوع.
 */
const contextBonus = (
  targetType: "action" | "dialogue",
  recentTypes: readonly string[]
): number => {
  const recent = recentTypes.slice(-CONTEXT_WEIGHTS.length);
  let bonus = 0;
  for (let i = 0; i < recent.length; i++) {
    const weight = CONTEXT_WEIGHTS[CONTEXT_WEIGHTS.length - recent.length + i];
    if (weight === undefined) continue;
    if (recent[i] === targetType) bonus += weight;
    // parenthetical يساهم لصالح dialogue
    if (targetType === "dialogue" && recent[i] === "parenthetical") {
      bonus += Math.max(1, weight - 1);
    }
  }
  return bonus;
};

/** عدد كلمات السطر */
const wordCount = (line: string): number =>
  line.split(/\s+/).filter(Boolean).length;

/**
 * تجميع أدلة التصنيف من مصادر متعددة + context bonus + dialogue flow breaker.
 *
 * الخطوات:
 * 1. جمع أدلة action (من collectActionEvidence)
 * 2. جمع أدلة dialogue (من getDialogueProbability + hasDirectDialogueCues)
 * 3. حساب context bonus لكل نوع
 * 4. dialogue flow breaker: لو فيه action verb واضح جوا dialogue flow → penalty
 * 5. DCG bonus: بداية مشهد → action أرجح
 */
const collectHybridEvidence = (
  line: string,
  _context: ClassificationContext,
  memory: ContextMemorySnapshot,
  lineCtx?: LineContextInfo
): HybridEvidenceResult => {
  // ── 1. أدلة Action ──
  const actionEv = collectActionEvidence(line);
  let actionScore = 0;
  if (actionEv.byVerb) actionScore += 3;
  if (actionEv.byStructure) actionScore += 2;
  if (actionEv.byPattern) actionScore += 2;
  if (actionEv.byCue) actionScore += 2;
  if (actionEv.byDash) actionScore += 3;
  if (actionEv.byNarrativeSyntax) actionScore += 1;
  if (actionEv.byPronounAction) actionScore += 1;
  if (actionEv.byThenAction) actionScore += 1;
  if (actionEv.byAudioNarrative) actionScore += 2;
  if (wordCount(line) >= 4 && actionScore > 0) actionScore += 1;

  // ── 2. أدلة Dialogue ──
  let dialogueScore = 0;
  if (hasDirectDialogueCues(line)) dialogueScore += 4;
  const dp = getDialogueProbability(line);
  if (dp >= 4) dialogueScore += 3;
  else if (dp >= 2) dialogueScore += 1;

  // ── 3. Context Bonus ──
  const actionCtx = contextBonus("action", memory.recentTypes);
  const dialogueCtx = contextBonus("dialogue", memory.recentTypes);

  // ── 4. Dialogue Flow Breaker ──
  // لو فيه action verb واضح (byVerb أو byStructure) جوا dialogue flow → penalty
  let dialoguePenalty = 0;
  if (
    memory.isInDialogueFlow &&
    (actionEv.byVerb || actionEv.byStructure) &&
    !hasDirectDialogueCues(line)
  ) {
    dialoguePenalty = 8;
  }

  // ── 5. DCG Bonus (محافظ — لا يقلب التصنيف بل يرجّح فقط) ──
  let dcgActionBonus = 0;
  let dcgDialogueBonus = 0;
  if (lineCtx) {
    // بداية مشهد → action أرجح (bonus خفيف)
    if (lineCtx.scenePosition < 0.1 && lineCtx.sceneLinesCount > 3) {
      dcgActionBonus += 1;
    }
    // منطقة حوار عالية الكثافة جداً + ما فيش أدلة action → dialogue أرجح
    if (lineCtx.dialogueDensity > 0.7 && actionScore === 0) {
      dcgDialogueBonus += 1;
    }
  }

  return {
    actionTotal: actionScore + actionCtx + dcgActionBonus,
    dialogueTotal:
      dialogueScore + dialogueCtx + dcgDialogueBonus - dialoguePenalty,
  };
};
