/**
 * @module extensions/reverse-classification-pass
 * @description
 * ممر تصنيف عكسي — يقرأ السيناريو من النهاية للبداية.
 *
 * الـ forward pass بيبني سياق "اللي فات" بس. الـ reverse pass بيدي كل سطر
 * سياق "اللي جاي" — لما ندمج الاتنين، كل سطر عنده معلومات من الاتجاهين.
 *
 * المراحل:
 * 1. Reverse Classification: تصنيف عكسي داخل كل مشهد على حده
 * 2. Merge: دمج forward + reverse — الاتفاق بيرفع الثقة، الاختلاف بيصلح
 *
 * يُصدّر:
 * - {@link ReverseClassificationResult} — نتيجة الـ reverse pass
 * - {@link reverseClassificationPass} — التصنيف العكسي
 * - {@link mergeForwardReverse} — دمج النتيجتين
 *
 * يُستهلك في {@link PasteClassifier} → `classifyLines()` بعد الـ forward pass.
 */

import type { ClassifiedDraft, ElementType } from "./classification-types";
import { collectActionEvidence } from "./action";
import { hasDirectDialogueCues } from "./dialogue";
import type { DocumentContextGraph } from "./document-context-graph";
import { CLASSIFICATION_VALID_SEQUENCES } from "./classification-sequence-rules";
import {
  normalizeLine,
  isActionVerbStart,
  hasActionVerbStructure,
  isActionCueLine,
} from "./text-utils";
import { logger } from "../utils/logger";

const reverseLogger = logger.createScope("reverse-pass");

// ─── الأنواع ──────────────────────────────────────────────────────

/** نتيجة الـ reverse classification pass */
export interface ReverseClassificationResult {
  /** النوع العكسي لكل سطر (null = لا اقتراح) */
  readonly reverseTypes: readonly (ElementType | null)[];
  /** ثقة التصنيف العكسي لكل سطر */
  readonly reverseConfidences: readonly number[];
}

// ─── ثوابت ─────────────────────────────────────────────────────────

/** الحد الأقصى لنسبة التغييرات المسموحة من الـ merge */
const MAX_MERGE_CHANGE_RATIO = 0.1;

/** الحد الأدنى لثقة الـ regex عشان ما نغيرهوش */
const REGEX_CONFIDENCE_FLOOR = 90;

// ─── أدوات مساعدة ──────────────────────────────────────────────────

/** عدد كلمات السطر */
const wordCount = (text: string): number =>
  normalizeLine(text).split(/\s+/).filter(Boolean).length;

/** هل السطر يشبه character هيكلياً؟ */
const looksLikeCharacterStructurally = (line: string): boolean => {
  const normalized = normalizeLine(line);
  if (!normalized) return false;
  if (!/[:：]\s*$/.test(normalized)) return false;
  if (wordCount(normalized) > 4) return false;
  if (/^[-–—]/.test(normalized)) return false;
  return true;
};

/** هل النوع الجديد يعدّي sequence rules؟ */
const isValidSequence = (
  fromType: ElementType,
  toType: ElementType
): boolean => {
  const validNext = CLASSIFICATION_VALID_SEQUENCES.get(fromType);
  if (!validNext) return true;
  return validNext.has(toType);
};

// ─── التصنيف العكسي ───────────────────────────────────────────────

/**
 * تصنيف سطر واحد بسياق عكسي (الأنواع اللي **بعده**).
 *
 * @param line - السطر المطبّع
 * @param futureTypes - الأنواع اللي بعد السطر ده (أقربهم أولاً)
 * @param forwardDraft - نتيجة الـ forward pass لنفس السطر
 * @returns نوع + ثقة
 */
const classifyWithReverseContext = (
  line: string,
  futureTypes: ElementType[],
  forwardDraft: ClassifiedDraft
): { type: ElementType; confidence: number } => {
  const normalized = normalizeLine(line);
  if (!normalized || futureTypes.length === 0) {
    return {
      type: forwardDraft.type,
      confidence: forwardDraft.confidence * 0.9,
    };
  }

  const nextType = futureTypes[0];

  // قاعدة 1: لو اللي بعدي dialogue/parenthetical + أنا شبه character → character
  if (
    (nextType === "dialogue" || nextType === "parenthetical") &&
    looksLikeCharacterStructurally(normalized)
  ) {
    return { type: "character", confidence: 88 };
  }

  // قاعدة 2: لو اللي بعدي character أو scene_header → أنا آخر سطر في الكتلة
  if (nextType === "character" || nextType === "scene_header_top_line") {
    if (isActionVerbStart(normalized) || hasActionVerbStructure(normalized)) {
      return { type: "action", confidence: 85 };
    }
    if (
      !hasActionVerbStructure(normalized) &&
      !isActionCueLine(normalized) &&
      !/^[-–—]/.test(normalized) &&
      wordCount(normalized) <= 15
    ) {
      // سطر قصير بدون action indicators → حوار أرجح
      if (
        hasDirectDialogueCues(normalized) ||
        wordCount(normalized) <= 8
      ) {
        return { type: "dialogue", confidence: 82 };
      }
    }
  }

  // قاعدة 3: لو الـ 3 أسطر بعدي ≥ 2 action + أنا فيّ action verb → action
  const futureActionCount = futureTypes
    .slice(0, 3)
    .filter((t) => t === "action").length;
  if (futureActionCount >= 2) {
    const ev = collectActionEvidence(normalized);
    if (ev.byVerb || ev.byStructure) {
      return { type: "action", confidence: 83 };
    }
  }

  // قاعدة 4: لو الـ 3 أسطر بعدي ≥ 2 dialogue + أنا عندي dialogue cues → dialogue
  const futureDialogueCount = futureTypes
    .slice(0, 3)
    .filter((t) => t === "dialogue").length;
  if (
    futureDialogueCount >= 2 &&
    hasDirectDialogueCues(normalized)
  ) {
    return { type: "dialogue", confidence: 83 };
  }

  // default: ارجع للـ forward type بثقة أقل
  return {
    type: forwardDraft.type,
    confidence: Math.round(forwardDraft.confidence * 0.9),
  };
};

// ─── الدوال المُصدّرة ─────────────────────────────────────────────

/**
 * ممر التصنيف العكسي — يصنّف كل سطر بسياق مستقبلي.
 *
 * يشتغل داخل كل مشهد على حده (من DCG) عشان ما يخلطش سياق مشاهد مختلفة.
 *
 * @param classified - الأسطر المصنّفة (من الـ forward pass)
 * @param dcg - خريطة سياق المستند
 * @returns {@link ReverseClassificationResult}
 */
export const reverseClassificationPass = (
  classified: readonly ClassifiedDraft[],
  dcg: DocumentContextGraph
): ReverseClassificationResult => {
  const n = classified.length;
  if (n === 0) {
    return { reverseTypes: [], reverseConfidences: [] };
  }

  const reverseTypes: (ElementType | null)[] = new Array(n).fill(null);
  const reverseConfidences: number[] = new Array(n).fill(0);

  // بناء scene ranges من DCG — مع clamp على حجم classified
  // (DCG بيُبنى من raw lines اللي ممكن تكون أكبر من classified بسبب الدمج/الحذف)
  const clamp = (idx: number): number => Math.min(idx, n - 1);

  const sceneRanges: { start: number; end: number }[] = [];
  if (dcg.sceneBreaks.length === 0) {
    // مفيش scene breaks → المستند كله مشهد واحد
    sceneRanges.push({ start: 0, end: n - 1 });
  } else {
    // قبل أول scene break
    const firstBreak = clamp(dcg.sceneBreaks[0]);
    if (firstBreak > 0) {
      sceneRanges.push({ start: 0, end: firstBreak - 1 });
    }
    // المشاهد
    for (let s = 0; s < dcg.sceneBreaks.length; s++) {
      const start = clamp(dcg.sceneBreaks[s]);
      if (start >= n) break;
      const end =
        s + 1 < dcg.sceneBreaks.length
          ? clamp(dcg.sceneBreaks[s + 1] - 1)
          : n - 1;
      if (end < start) continue;
      sceneRanges.push({ start, end });
    }
  }

  // لكل مشهد — تصنيف عكسي من الآخر للأول
  for (const range of sceneRanges) {
    const reverseContext: ElementType[] = [];

    for (let i = range.end; i >= range.start; i--) {
      const draft = classified[i];
      const line = normalizeLine(draft.text);

      // أنواع regex عالية الثقة → نسخ مباشرة
      if (
        draft.classificationMethod === "regex" &&
        draft.confidence >= REGEX_CONFIDENCE_FLOOR
      ) {
        reverseTypes[i] = draft.type;
        reverseConfidences[i] = draft.confidence;
        reverseContext.push(draft.type);
        continue;
      }

      const result = classifyWithReverseContext(line, reverseContext, draft);
      reverseTypes[i] = result.type;
      reverseConfidences[i] = result.confidence;
      reverseContext.push(result.type);
    }
  }

  return { reverseTypes, reverseConfidences };
};

/**
 * دمج نتائج الـ forward pass والـ reverse pass.
 *
 * - لو متفقين → ارفع الثقة +5
 * - لو مختلفين + الـ reverse واثق + الـ forward ضعيف → طبّق الـ reverse
 * - حد أقصى 10% تغيير
 *
 * @param classified - الأسطر المصنّفة (بيتعدّل in-place)
 * @param reverse - نتيجة الـ reverse pass
 * @returns عدد التصحيحات
 */
export const mergeForwardReverse = (
  classified: ClassifiedDraft[],
  reverse: ReverseClassificationResult
): number => {
  const n = classified.length;
  if (n === 0) return 0;

  const maxChanges = Math.max(1, Math.ceil(n * MAX_MERGE_CHANGE_RATIO));
  let corrections = 0;

  for (let i = 0; i < n; i++) {
    if (corrections >= maxChanges) break;

    const fwd = classified[i];
    const rev = reverse.reverseTypes[i];
    const revConf = reverse.reverseConfidences[i];

    if (rev === null) continue;

    // لو متفقين → ارفع الثقة
    if (rev === fwd.type) {
      classified[i] = {
        ...fwd,
        confidence: Math.min(99, fwd.confidence + 5),
      };
      continue;
    }

    // لو مختلفين → هل نغيّر؟
    const shouldOverride =
      revConf >= 82 &&
      fwd.confidence <= 80 &&
      fwd.classificationMethod !== "regex";

    if (!shouldOverride) continue;

    // فحص sequence rules — لازم النوع الجديد يتوافق مع الجيران
    const prevType = i > 0 ? classified[i - 1].type : null;
    const nextType = i + 1 < n ? classified[i + 1].type : null;
    const seqValid =
      (!prevType || isValidSequence(prevType, rev)) &&
      (!nextType || isValidSequence(rev, nextType));

    if (!seqValid) continue;

    classified[i] = {
      ...fwd,
      type: rev,
      confidence: Math.max(fwd.confidence, revConf),
      classificationMethod: "context",
    };
    corrections++;
  }

  if (corrections > 0) {
    reverseLogger.info("merge-applied", {
      total: n,
      corrections,
      maxAllowed: maxChanges,
    });
  }

  return corrections;
};
