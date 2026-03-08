/**
 * @module extensions/self-reflection-pass
 * @description
 * طبقة مراجعة ذاتية دورية أثناء الـ forward pass.
 *
 * كل 6-10 أسطر (أو عند scene break)، النظام يوقف ويراجع الـ chunk الأخير
 * بالسياق المتراكم الجديد. الفرق عن الـ retroactive corrector:
 * الـ self-reflection بتحصل **أثناء** التصنيف — فـ التصحيحات بتأثر على الأسطر اللي بعدها.
 *
 * يُصدّر:
 * - {@link SELF_REFLECTION_CHUNK_SIZE} — حجم الـ chunk الافتراضي
 * - {@link shouldReflect} — هل حان وقت المراجعة؟
 * - {@link reflectOnChunk} — مراجعة chunk من الأسطر المصنّفة
 *
 * يُستهلك في {@link PasteClassifier} → `classifyLines()` داخل الـ forward loop.
 */

import type { ClassifiedDraft, ElementType } from "./classification-types";
import { collectActionEvidence } from "./action";
import { hasDirectDialogueCues } from "./dialogue";
import type { DocumentContextGraph } from "./document-context-graph";
import { CLASSIFICATION_VALID_SEQUENCES } from "./classification-sequence-rules";
import type { ContextMemoryManager } from "./context-memory-manager";
import {
  normalizeLine,
  normalizeCharacterName,
  isActionVerbStart,
  hasActionVerbStructure,
  isActionCueLine,
  startsWithBullet,
} from "./text-utils";
import { logger } from "../utils/logger";
import { pipelineRecorder } from "./pipeline-recorder";

const reflectionLogger = logger.createScope("self-reflection");

// ─── ثوابت ─────────────────────────────────────────────────────────

/** حجم الـ chunk الافتراضي — كل 8 أسطر نراجع */
export const SELF_REFLECTION_CHUNK_SIZE = 8;

/** أقل عدد أسطر في chunk يستحق مراجعة */
const MIN_CHUNK_FOR_REFLECTION = 3;

// ─── أدوات مساعدة ──────────────────────────────────────────────────

/** عدد كلمات السطر */
const wordCount = (text: string): number =>
  normalizeLine(text).split(/\s+/).filter(Boolean).length;

/** هل السطر فيه مؤشرات action قوية جداً (dash/bullet/cue)؟ */
const hasVeryStrongActionSignal = (text: string): boolean => {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (/^[-–—]/.test(normalized)) return true;
  if (startsWithBullet(normalized)) return true;
  return isActionCueLine(normalized);
};

/** هل هناك character قريب (خلال lookback أسطر للخلف)؟ */
const lookBackForCharacter = (
  classified: readonly ClassifiedDraft[],
  fromIndex: number,
  lookback: number
): boolean => {
  const start = Math.max(0, fromIndex - lookback);
  for (let i = fromIndex - 1; i >= start; i--) {
    if (classified[i].type === "character") return true;
  }
  return false;
};

/** هل النوع الجديد يعدّي sequence rules بالنسبة للنوع السابق؟ */
const isValidSequenceTransition = (
  prevType: ElementType | null,
  newType: ElementType
): boolean => {
  if (!prevType) return true;
  const validNext = CLASSIFICATION_VALID_SEQUENCES.get(prevType);
  if (!validNext) return true;
  return validNext.has(newType);
};

/** فحص سريع: هل السطر عنده evidence لنوع معين؟ */
const quickEvidenceCheck = (
  line: string,
  candidateType: ElementType
): number => {
  const normalized = normalizeLine(line);
  if (!normalized) return 0;

  if (candidateType === "action") {
    const ev = collectActionEvidence(normalized);
    let score = 0;
    if (ev.byVerb) score += 2;
    if (ev.byStructure) score += 1;
    if (ev.byPattern) score += 1;
    if (ev.byDash) score += 2;
    return score;
  }

  if (candidateType === "dialogue") {
    let score = 0;
    if (hasDirectDialogueCues(normalized)) score += 3;
    if (/[؟?!]/.test(normalized)) score += 1;
    return score;
  }

  return 0;
};

// ─── إنشاء draft مُصحّح ───────────────────────────────────────────

const correctedDraft = (
  original: ClassifiedDraft,
  newType: ElementType,
  confidenceBoost: number
): ClassifiedDraft => ({
  ...original,
  type: newType,
  confidence: Math.min(95, original.confidence + confidenceBoost),
  classificationMethod: "context",
});

// ─── الدوال المُصدّرة ─────────────────────────────────────────────

/**
 * هل حان وقت المراجعة الذاتية؟
 *
 * @param classifiedInChunk - عدد الأسطر المصنّفة في الـ chunk الحالي
 * @param lastClassifiedType - آخر نوع تم تصنيفه
 * @param chunkSize - حجم الـ chunk (افتراضي 8)
 * @returns `true` إذا لازم نراجع
 */
export const shouldReflect = (
  classifiedInChunk: number,
  lastClassifiedType: ElementType,
  chunkSize: number = SELF_REFLECTION_CHUNK_SIZE
): boolean => {
  // مراجعة عند حد الـ chunk
  if (classifiedInChunk >= chunkSize) return true;
  // مراجعة إجبارية عند scene break (لو عدّينا الحد الأدنى)
  if (
    lastClassifiedType === "scene_header_top_line" &&
    classifiedInChunk >= MIN_CHUNK_FOR_REFLECTION
  ) {
    return true;
  }
  return false;
};

/**
 * مراجعة ذاتية على chunk من الأسطر المصنّفة.
 *
 * 4 فحوصات:
 * 1. Dialogue بدون Speaker + فيه action verb → action
 * 2. Action بعد Character مباشرة بدون strong signal → dialogue
 * 3. Character غير مؤكد بدون حوار بعده → action
 * 4. Confidence Drop: سطر ضعيف محاط بجيران متفقين → نوع الجيران
 *
 * @param classified - المصفوفة الكاملة (بيتعدّل in-place)
 * @param chunkStart - بداية الـ chunk (inclusive)
 * @param chunkEnd - نهاية الـ chunk (exclusive)
 * @param memoryManager - مدير الذاكرة (لتحديث بعد التصحيح)
 * @param _dcg - خريطة سياق المستند (محجوز للاستخدام المستقبلي)
 * @returns عدد التصحيحات
 */
export const reflectOnChunk = (
  classified: ClassifiedDraft[],
  chunkStart: number,
  chunkEnd: number,
  memoryManager: ContextMemoryManager,
  _dcg?: DocumentContextGraph
): number => {
  pipelineRecorder.trackFile("self-reflection-pass.ts");
  if (chunkEnd - chunkStart < MIN_CHUNK_FOR_REFLECTION) return 0;

  let corrections = 0;

  for (let i = chunkStart; i < chunkEnd; i++) {
    const draft = classified[i];
    const line = normalizeLine(draft.text);
    if (!line) continue;

    // ── فحص 1: Dialogue بدون Speaker + فيه action verb ──
    if (draft.type === "dialogue") {
      const hasNearbyCharacter = lookBackForCharacter(classified, i, 5);
      if (
        !hasNearbyCharacter &&
        (isActionVerbStart(line) || hasActionVerbStructure(line)) &&
        !hasDirectDialogueCues(line) &&
        wordCount(line) >= 3
      ) {
        classified[i] = correctedDraft(draft, "action", 5);
        corrections++;
        continue;
      }
    }

    // ── فحص 2: Action بعد Character مباشرة بدون strong signal ──
    if (draft.type === "action" && i > 0) {
      const prev = classified[i - 1];
      if (prev.type === "character" && !hasVeryStrongActionSignal(line)) {
        classified[i] = correctedDraft(draft, "dialogue", 4);
        corrections++;
        continue;
      }
    }

    // ── فحص 3: Character غير مؤكد بدون حوار بعده ──
    if (draft.type === "character" && i + 1 < chunkEnd) {
      const next = classified[i + 1];
      const name = normalizeCharacterName(line);
      const isConfirmed = name
        ? memoryManager.isConfirmedCharacter(name)
        : false;
      if (
        !isConfirmed &&
        next.type !== "dialogue" &&
        next.type !== "parenthetical"
      ) {
        if (hasActionVerbStructure(line) || wordCount(line) >= 5) {
          classified[i] = correctedDraft(draft, "action", 3);
          corrections++;
          continue;
        }
      }
    }

    // ── فحص 4: Confidence Drop Pattern ──
    if (draft.confidence < 78 && i > 0 && i + 1 < chunkEnd) {
      const prev = classified[i - 1];
      const next = classified[i + 1];
      if (
        prev.type === next.type &&
        prev.confidence >= 85 &&
        next.confidence >= 85 &&
        prev.type !== draft.type
      ) {
        const seqValid = isValidSequenceTransition(
          i > 1 ? classified[i - 2].type : null,
          prev.type
        );
        if (seqValid) {
          const evidence = quickEvidenceCheck(line, prev.type);
          if (evidence > 0) {
            classified[i] = correctedDraft(draft, prev.type, 3);
            corrections++;
          }
        }
      }
    }
  }

  if (corrections > 0) {
    memoryManager.rebuildFromCorrectedDrafts(classified);
    reflectionLogger.info("chunk-reflected", {
      chunkStart,
      chunkEnd,
      corrections,
    });
  }

  return corrections;
};
