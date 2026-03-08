/**
 * @module extensions/retroactive-corrector
 * @description
 * ممر تصحيح رجعي — يعيد فحص التصنيفات السابقة بناءً على أنماط هيكلية.
 *
 * يعمل بعد الممر الأمامي (forward pass) وقبل نظام الشبهات.
 * لا يستخدم قوائم كلمات ثابتة — كل القواعد مبنية على بنية النص فقط.
 *
 * الأنماط الخمسة:
 * 1. action ينتهي بـ `:` + أسطر لاحقة بدون مؤشرات وصف قوية → character + dialogue
 * 2. character متتالية → الثانية dialogue (أو action إذا فيها مؤشرات)
 * 3. dialogue معزول بدون character سابق → فحص الأسطر السابقة لشخصية مخفية
 * 4. كتلة action طويلة (5+) مع سطر ينتهي بـ `:` → character + dialogue
 * 5. character غير مؤكد (مرة واحدة + مش مبذور) + تجمّع → dialogue
 *
 * يُصدّر:
 * - {@link retroactiveCorrectionPass} — الدالة الرئيسية
 */
import type { ClassifiedDraft, ElementType } from "./classification-types";
import type { ContextMemoryManager } from "./context-memory-manager";
import { isCandidateCharacterName } from "./character";
import {
  normalizeLine,
  normalizeCharacterName,
  isActionCueLine,
  matchesActionStartPattern,
  isActionVerbStart,
  hasActionVerbStructure,
  looksLikeNarrativeActionSyntax,
  hasDirectDialogueMarkers,
  startsWithBullet,
  hasSentencePunctuation,
} from "./text-utils";
import { PRONOUN_ACTION_RE } from "./arabic-patterns";
import { logger } from "../utils/logger";
import { pipelineRecorder } from "./pipeline-recorder";

const correctorLogger = logger.createScope("retroactive-corrector");

// ─── أدوات هيكلية داخلية ──────────────────────────────────────────

/** عدد الكلمات في النص */
const wordCount = (text: string): number =>
  normalizeLine(text).split(/\s+/).filter(Boolean).length;

/** هل ينتهي بنقطتين (: أو ：)؟ */
const endsWithColon = (text: string): boolean =>
  /[:：]\s*$/.test(normalizeLine(text));

/**
 * مؤشرات وصف قوية جداً (dash/bullet/cue فقط).
 * يُستخدم في Pattern 1 للسطر الأول بعد character — لأن الحوار ممكن يحتوي أفعال.
 */
const hasVeryStrongActionSignal = (text: string): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (/^[-–—]/.test(normalized)) return true;
  if (startsWithBullet(normalized)) return true;
  return isActionCueLine(normalized);
};

/**
 * هل السطر فيه مؤشرات وصف/حدث قوية؟
 * يستخدم نفس المنطق الهيكلي بدون قوائم كلمات ثابتة.
 */
const hasStrongActionSignal = (text: string): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (hasVeryStrongActionSignal(text)) return true;

  return (
    matchesActionStartPattern(normalized) ||
    isActionVerbStart(normalized) ||
    hasActionVerbStructure(normalized) ||
    PRONOUN_ACTION_RE.test(normalized)
  );
};

/**
 * هل السطر يشبه اسم شخصية هيكلياً؟
 * قواعد بنيوية فقط — بدون أي قوائم كلمات أو حروف محددة.
 * - ينتهي بنقطتين
 * - عدد كلمات ≤ 4
 * - بدون مؤشرات وصف
 * - بدون علامات ترقيم جُملية (اسم الشخصية مش جملة)
 */
const looksLikeCharacterStructurally = (text: string): boolean => {
  if (!endsWithColon(text)) return false;
  if (wordCount(text) > 4) return false;
  if (hasStrongActionSignal(text)) return false;
  // اسم الشخصية لا يحتوي علامات ترقيم جُملية (نقطة، علامة استفهام، تعجب)
  const beforeColon = normalizeLine(text)
    .replace(/[:：]\s*$/, "")
    .trim();
  if (hasSentencePunctuation(beforeColon)) return false;
  return true;
};

// ─── مساعد لإنشاء ClassifiedDraft مُصحّح ────────────────────────

const correctedDraft = (
  original: ClassifiedDraft,
  newType: ElementType,
  confidenceBoost: number = 0
): ClassifiedDraft => ({
  ...original,
  type: newType,
  confidence: Math.min(99, original.confidence + confidenceBoost),
  classificationMethod: "context",
});

// ─── النمط 1: action ينتهي بـ : + أسطر لاحقة بدون مؤشرات وصف قوية ─

const applyPattern1_ActionEndingWithColon = (
  classified: ClassifiedDraft[],
  preSeeded?: ReadonlySet<string>
): number => {
  let corrections = 0;

  for (let i = 0; i < classified.length - 1; i++) {
    const current = classified[i];

    // الشرط: مصنّف action + ينتهي بنقطتين + قصير (≤ 4 كلمات)
    if (current.type !== "action") continue;
    if (!endsWithColon(current.text)) continue;
    if (wordCount(current.text) > 4) continue;

    // Guard: الاسم لازم يعدّي isCandidateCharacterName
    const candidateName = normalizeCharacterName(current.text);
    if (!candidateName || !isCandidateCharacterName(candidateName)) continue;

    // Guard: single-token لازم يكون مؤكد في الـ pre-seeded registry
    const nameTokens = candidateName.split(/\s+/).filter(Boolean);
    if (nameTokens.length === 1 && preSeeded && !preSeeded.has(candidateName))
      continue;

    // الشرط: السطر اللي بعده action بدون مؤشرات وصف الأقوى فقط
    // (الحوار ممكن يحتوي أفعال مضارعة — لازم نستخدم hasVeryStrongActionSignal للسطر الأول)
    const next = classified[i + 1];
    if (!next) continue;
    if (next.type !== "action" || hasVeryStrongActionSignal(next.text))
      continue;

    // تصحيح: الحالي → character، اللي بعده → dialogue
    classified[i] = correctedDraft(current, "character", 4);
    classified[i + 1] = correctedDraft(next, "dialogue", 4);
    corrections += 2;

    // استمرار: كل الأسطر اللاحقة اللي مصنّفة action بدون مؤشرات وصف → dialogue
    for (let j = i + 2; j < classified.length; j++) {
      const subsequent = classified[j];
      if (subsequent.type !== "action") break;
      if (hasStrongActionSignal(subsequent.text)) break;
      // لو السطر ده هو كمان ينتهي بنقطتين وقصير → character جديد (كتلة حوار جديدة)
      if (looksLikeCharacterStructurally(subsequent.text)) break;
      classified[j] = correctedDraft(subsequent, "dialogue", 2);
      corrections += 1;
    }
  }

  return corrections;
};

// ─── النمط 2: character متتالية → الثانية dialogue ──────────────

const applyPattern2_ConsecutiveCharacters = (
  classified: ClassifiedDraft[]
): number => {
  let corrections = 0;

  for (let i = 0; i < classified.length - 1; i++) {
    if (classified[i].type !== "character") continue;
    if (classified[i + 1].type !== "character") continue;

    const secondText = classified[i + 1].text;

    // لو الثاني فيه مؤشرات وصف → action
    if (hasStrongActionSignal(secondText)) {
      classified[i + 1] = correctedDraft(classified[i + 1], "action", 2);
    } else {
      // غير كده → dialogue
      classified[i + 1] = correctedDraft(classified[i + 1], "dialogue", 2);
    }
    corrections += 1;
  }

  return corrections;
};

// ─── النمط 3: dialogue معزول بدون character سابق ────────────────

const applyPattern3_IsolatedDialogue = (
  classified: ClassifiedDraft[]
): number => {
  let corrections = 0;
  const DIALOGUE_FLOW_TYPES = new Set<ElementType>([
    "character",
    "dialogue",
    "parenthetical",
  ]);

  for (let i = 0; i < classified.length; i++) {
    if (classified[i].type !== "dialogue") continue;

    // تحقق: هل في سطر character/dialogue/parenthetical قبله مباشرة؟
    if (i > 0 && DIALOGUE_FLOW_TYPES.has(classified[i - 1].type)) continue;

    // dialogue معزول — نبحث في الأسطر السابقة عن character مخفي
    // فحص السطر السابق مباشرة
    if (i > 0 && classified[i - 1].type === "action") {
      if (looksLikeCharacterStructurally(classified[i - 1].text)) {
        classified[i - 1] = correctedDraft(classified[i - 1], "character", 4);
        corrections += 1;
        continue;
      }
    }

    // فحص السطرين السابقين
    if (i > 1 && classified[i - 2].type === "action") {
      if (looksLikeCharacterStructurally(classified[i - 2].text)) {
        classified[i - 2] = correctedDraft(classified[i - 2], "character", 4);
        // السطر بينهم (i-1) لو action بدون مؤشرات وصف → dialogue
        if (
          classified[i - 1].type === "action" &&
          !hasStrongActionSignal(classified[i - 1].text)
        ) {
          classified[i - 1] = correctedDraft(classified[i - 1], "dialogue", 2);
          corrections += 1;
        }
        corrections += 1;
        continue;
      }
    }
  }

  return corrections;
};

// ─── النمط 4: كتلة action طويلة (5+) مع سطر ينتهي بـ : ─────────

const applyPattern4_LongActionBlockWithColon = (
  classified: ClassifiedDraft[],
  preSeeded?: ReadonlySet<string>
): number => {
  let corrections = 0;
  const MIN_BLOCK_LENGTH = 5;

  let blockStart = -1;

  for (let i = 0; i <= classified.length; i++) {
    const isAction = i < classified.length && classified[i].type === "action";

    if (isAction && blockStart === -1) {
      blockStart = i;
      continue;
    }

    if (!isAction && blockStart !== -1) {
      const blockEnd = i;
      const blockLength = blockEnd - blockStart;

      if (blockLength >= MIN_BLOCK_LENGTH) {
        // ابحث عن أسطر تنتهي بنقطتين داخل الكتلة
        for (let j = blockStart; j < blockEnd; j++) {
          if (!looksLikeCharacterStructurally(classified[j].text)) continue;

          // Guard: الاسم لازم يعدّي isCandidateCharacterName + single-token guard
          const p4Name = normalizeCharacterName(classified[j].text);
          if (!p4Name || !isCandidateCharacterName(p4Name)) continue;
          const p4Tokens = p4Name.split(/\s+/).filter(Boolean);
          if (p4Tokens.length === 1 && preSeeded && !preSeeded.has(p4Name))
            continue;

          // السطر ده → character
          classified[j] = correctedDraft(classified[j], "character", 6);
          corrections += 1;

          // الأسطر اللاحقة → dialogue حتى نلاقي action حقيقي أو character جديد
          for (let k = j + 1; k < blockEnd; k++) {
            if (hasStrongActionSignal(classified[k].text)) break;
            if (looksLikeCharacterStructurally(classified[k].text)) break;
            classified[k] = correctedDraft(classified[k], "dialogue", 4);
            corrections += 1;
          }
        }
      }

      blockStart = -1;
      // لو السطر الحالي هو بداية كتلة جديدة
      if (isAction) blockStart = i;
    }
  }

  return corrections;
};

// ─── النمط 5: تأكيد character بالتكرار + السياق + التجمّع ─────────

/**
 * النمط 5 — كشف الشخصيات الزائفة بالأنماط (بدون أي كلمات/حروف محددة).
 *
 * في السيناريو الصحيح، أسماء الشخصيات بتتكرر.
 * الاسم اللي بيظهر مرة واحدة بس + مش مبذور (seeded) + محاط بأسماء مشابهة → غالباً cascade error.
 *
 * إشارات التأكيد:
 *   (a) التكرار: الاسم بيظهر أكثر من مرة في النص
 *   (b) البذر: الاسم اتلقط من inline patterns قبل التصنيف
 *   (c) تدفق السياق: character متبوع بـ dialogue/parenthetical
 *   (d) العزل: مفيش أسماء غير مؤكدة تانية قريبة (مش cascade)
 *
 * لو اسم الشخصية عنده 0 إشارات تأكيد → dialogue
 */
const applyPattern5_UnconfirmedCharacterCluster = (
  classified: ClassifiedDraft[],
  preSeeded: ReadonlySet<string>
): number => {
  let corrections = 0;

  // الخطوة 1: حساب تكرار كل اسم character في المصفوفة المصنفة
  const nameFrequency = new Map<string, number>();
  for (const draft of classified) {
    if (draft.type !== "character") continue;
    const name = normalizeCharacterName(draft.text);
    if (!name) continue;
    nameFrequency.set(name, (nameFrequency.get(name) ?? 0) + 1);
  }

  // الخطوة 2: تحديد مواقع الأسماء غير المؤكدة (مرة واحدة + مش مبذورة)
  const unconfirmedIndexes = new Set<number>();
  for (let i = 0; i < classified.length; i++) {
    if (classified[i].type !== "character") continue;
    const name = normalizeCharacterName(classified[i].text);
    if (!name) continue;
    // إشارة (a): التكرار
    if ((nameFrequency.get(name) ?? 0) >= 2) continue;
    // إشارة (b): البذر
    if (preSeeded.has(name)) continue;
    unconfirmedIndexes.add(i);
  }

  if (unconfirmedIndexes.size === 0) return 0;

  // الخطوة 3: لكل اسم غير مؤكد، احسب إشارات التأكيد المتبقية
  const CLUSTER_WINDOW = 5;
  const DIALOGUE_FLOW = new Set<ElementType>(["dialogue", "parenthetical"]);

  for (const idx of unconfirmedIndexes) {
    let confirmationSignals = 0;

    // إشارة (c): تدفق السياق — هل متبوع بحوار؟
    const nextType =
      idx + 1 < classified.length ? classified[idx + 1].type : null;
    if (nextType && DIALOGUE_FLOW.has(nextType)) {
      confirmationSignals += 1;
    }

    // إشارة (d): العزل — هل فيه أسماء غير مؤكدة تانية قريبة؟ (لو اه → cascade)
    let nearbyUnconfirmed = 0;
    for (
      let j = Math.max(0, idx - CLUSTER_WINDOW);
      j < Math.min(classified.length, idx + CLUSTER_WINDOW + 1);
      j++
    ) {
      if (j === idx) continue;
      if (unconfirmedIndexes.has(j)) nearbyUnconfirmed++;
    }
    // لو مفيش أسماء غير مؤكدة قريبة → معزول (أقل احتمال cascade)
    if (nearbyUnconfirmed === 0) {
      confirmationSignals += 1;
    }

    // لو 0 إشارات تأكيد (مش متبوع بحوار + فيه أسماء غير مؤكدة قريبة) → شخصية زائفة
    if (confirmationSignals === 0) {
      classified[idx] = correctedDraft(classified[idx], "dialogue", 4);
      corrections += 1;
    }
  }

  return corrections;
};

// ─── النمط 6: Action Verb في Dialogue Flow ──────────────────────

/**
 * سطر مصنّف dialogue + فيه action verb واضح + بدون dialogue cues → action.
 * يحمي من الاستمرار الأعمى لكتلة الحوار.
 */
const applyPattern6_ActionVerbInDialogueFlow = (
  classified: ClassifiedDraft[]
): number => {
  let corrections = 0;

  for (let i = 0; i < classified.length; i++) {
    if (classified[i].type !== "dialogue") continue;

    const text = normalizeLine(classified[i].text);
    if (!text) continue;

    // شرط: بنية سردية وصفية واضحة (فعل + روابط سردية أو ≥5 كلمات)
    if (!looksLikeNarrativeActionSyntax(text)) continue;

    // حماية: لو فيه علامات حوار عامية → مش action
    if (hasDirectDialogueMarkers(text)) continue;

    // شرط: بعد سطر dialogue أو character (في dialogue flow)
    if (i === 0) continue;
    const prev = classified[i - 1];
    if (
      prev.type !== "dialogue" &&
      prev.type !== "character" &&
      prev.type !== "parenthetical"
    )
      continue;

    classified[i] = correctedDraft(classified[i], "action", 4);
    corrections++;
  }

  return corrections;
};

// ─── النمط 7: Orphaned Parenthetical ────────────────────────────

/**
 * parenthetical بدون character/dialogue قبله أو بعده → action.
 */
const applyPattern7_OrphanedParenthetical = (
  classified: ClassifiedDraft[]
): number => {
  let corrections = 0;
  const DIALOGUE_FLOW = new Set<ElementType>([
    "character",
    "dialogue",
    "parenthetical",
  ]);

  for (let i = 0; i < classified.length; i++) {
    if (classified[i].type !== "parenthetical") continue;

    const prevOk = i > 0 && DIALOGUE_FLOW.has(classified[i - 1].type);
    const nextOk =
      i + 1 < classified.length && DIALOGUE_FLOW.has(classified[i + 1].type);

    if (!prevOk && !nextOk) {
      classified[i] = correctedDraft(classified[i], "action", 3);
      corrections++;
    }
  }

  return corrections;
};

// ─── النمط 8: Transition → Action Correction ────────────────────

/**
 * سطر مصنّف transition + أطول من 6 كلمات → غالباً action.
 * الانتقالات في السيناريو العربي قصيرة (قطع إلى، مزج إلى، إلخ).
 */
const applyPattern8_LongTransition = (
  classified: ClassifiedDraft[]
): number => {
  let corrections = 0;

  for (let i = 0; i < classified.length; i++) {
    if (classified[i].type !== "transition") continue;
    if (wordCount(classified[i].text) <= 6) continue;
    // transition حقيقي regex بثقة عالية → ما نلمسوش
    if (
      classified[i].classificationMethod === "regex" &&
      classified[i].confidence >= 90
    )
      continue;

    classified[i] = correctedDraft(classified[i], "action", 3);
    corrections++;
  }

  return corrections;
};

// ─── النمط 9: Dialogue بعد Transition/Scene Header ──────────────

/**
 * dialogue مباشرة بعد transition أو scene_header → action.
 * بعد scene header الطبيعي: action أو character — مش dialogue.
 */
const applyPattern9_DialogueAfterSceneBreak = (
  classified: ClassifiedDraft[]
): number => {
  let corrections = 0;
  const BREAK_TYPES = new Set<ElementType>([
    "transition",
    "scene_header_1",
    "scene_header_2",
    "scene_header_3",
  ]);

  for (let i = 1; i < classified.length; i++) {
    if (classified[i].type !== "dialogue") continue;
    if (!BREAK_TYPES.has(classified[i - 1].type)) continue;
    // regex عالي الثقة → ما نلمسوش
    if (
      classified[i].classificationMethod === "regex" &&
      classified[i].confidence >= 90
    )
      continue;

    classified[i] = correctedDraft(classified[i], "action", 3);
    corrections++;
  }

  return corrections;
};

// ─── الدالة الرئيسية ──────────────────────────────────────────────

/**
 * ممر التصحيح الرجعي — يعيد فحص التصنيفات بعد الممر الأمامي.
 *
 * يُطبّق 9 أنماط بالترتيب:
 * 1. action ينتهي بـ `:` → character + dialogue
 * 2. character + character → character + dialogue
 * 3. dialogue معزول → بحث عن character مخفي
 * 4. كتلة action طويلة مع `:` → character + dialogue
 * 5. character غير مؤكد (تكرار + سياق + تجمّع) → dialogue
 * 6. action verb واضح في dialogue flow → action
 * 7. parenthetical يتيم → action
 * 8. transition طويل (> 6 كلمات) → action
 * 9. dialogue بعد transition/scene header → action
 *
 * @param classified - مصفوفة المسودات المصنفة (تُعدّل في المكان)
 * @param memoryManager - مدير ذاكرة السياق (اختياري — لتحديث السجلات + أسماء مبذورة)
 * @returns عدد التصحيحات الكلية
 */
export const retroactiveCorrectionPass = (
  classified: ClassifiedDraft[],
  memoryManager?: ContextMemoryManager,
  enableNewPatterns = false
): number => {
  pipelineRecorder.trackFile("retroactive-corrector.ts");
  if (classified.length < 2) return 0;

  const before = classified.map((d) => d.type).join(",");

  // الأسماء المبذورة من CMM — يحتاجها Pattern 1 + Pattern 5
  const preSeeded = memoryManager
    ? memoryManager.getPreSeededCharacters()
    : new Set<string>();

  const c1 = applyPattern1_ActionEndingWithColon(classified, preSeeded);
  const c2 = applyPattern2_ConsecutiveCharacters(classified);
  const c3 = applyPattern3_IsolatedDialogue(classified);
  const c4 = applyPattern4_LongActionBlockWithColon(classified, preSeeded);
  const c5 = applyPattern5_UnconfirmedCharacterCluster(classified, preSeeded);
  const c6 = enableNewPatterns
    ? applyPattern6_ActionVerbInDialogueFlow(classified)
    : 0;
  const c7 = enableNewPatterns
    ? applyPattern7_OrphanedParenthetical(classified)
    : 0;
  const c8 = enableNewPatterns ? applyPattern8_LongTransition(classified) : 0;
  const c9 = enableNewPatterns
    ? applyPattern9_DialogueAfterSceneBreak(classified)
    : 0;

  const totalCorrections = c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8 + c9;

  if (totalCorrections > 0) {
    const after = classified.map((d) => d.type).join(",");
    correctorLogger.info("retroactive-pass-complete", {
      totalCorrections,
      pattern1: c1,
      pattern2: c2,
      pattern3: c3,
      pattern4: c4,
      pattern5: c5,
      pattern6: c6,
      pattern7: c7,
      pattern8: c8,
      pattern9: c9,
      before,
      after,
    });

    // تحديث ذاكرة السياق إذا كانت متوفرة
    if (memoryManager) {
      memoryManager.rebuildFromCorrectedDrafts(classified);
    }
  }

  return totalCorrections;
};
