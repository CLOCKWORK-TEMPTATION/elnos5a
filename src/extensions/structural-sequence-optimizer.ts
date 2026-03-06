/**
 * @module extensions/structural-sequence-optimizer
 * @description
 * مُحسِّن التسلسل الهيكلي — طبقة Viterbi تعمل فوق الـ forward pass.
 *
 * الفكرة: التصنيف المحلي (سطر بسطر) يفقد الرؤية العالمية.
 * خوارزمية Viterbi بتلاقي أفضل تسلسل تصنيفات **للنص كله مرة واحدة**
 * باستخدام:
 *   - Emission Scores: P(features | type) — احتمال الخصائص الهيكلية لكل نوع
 *   - Transition Scores: P(type_i | type_{i-1}) — احتمال الانتقال بين الأنواع
 *
 * النتيجة: تسلسل عالمي مُحسَّن + كشف الاختلافات مع الـ forward pass.
 *
 * يُصدّر:
 * - {@link SequenceFeatures} — خصائص هيكلية لسطر واحد
 * - {@link ViterbiResult} — نتيجة Viterbi لسطر واحد
 * - {@link SequenceDisagreement} — اختلاف بين forward pass و Viterbi
 * - {@link optimizeSequence} — الدالة الرئيسية
 * - {@link extractSequenceFeatures} — استخراج الخصائص (مُصدّر للاختبار)
 */
import type { ClassifiedDraft, ElementType } from "./classification-types";
import {
  normalizeLine,
  normalizeCharacterName,
  startsWithBullet,
  hasSentencePunctuation,
  isActionCueLine,
  matchesActionStartPattern,
  isActionVerbStart,
  hasActionVerbStructure,
} from "./text-utils";
import { PRONOUN_ACTION_RE } from "./arabic-patterns";
import { CLASSIFICATION_VALID_SEQUENCES } from "./classification-sequence-rules";
import { logger } from "../utils/logger";

const optimizerLogger = logger.createScope("sequence-optimizer");

// ─── الأنواع ─────────────────────────────────────────────────────

/**
 * الأنواع المُشاركة في Viterbi — scene_header_1 و scene_header_2 منفصلين.
 * الترتيب مهم — بيتخزن كـ index في المصفوفات.
 */
const VITERBI_TYPES: readonly ElementType[] = [
  "basmala",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
] as const;

const TYPE_INDEX = new Map<ElementType, number>(
  VITERBI_TYPES.map((t, i) => [t, i])
);
const NUM_TYPES = VITERBI_TYPES.length;

// ─── Feature Extraction ──────────────────────────────────────────

/** خصائص هيكلية لسطر واحد — كل الخصائص بنيوية بحتة، بدون أي كلمات ثابتة */
export interface SequenceFeatures {
  readonly wordCount: number;
  readonly charCount: number;
  readonly endsWithColon: boolean;
  readonly startsWithDash: boolean;
  readonly startsWithBullet: boolean;
  readonly isParenthetical: boolean;
  readonly hasActionIndicators: boolean;
  /** ADAPTIVE: لو الترقيم موجود → signal سلبي ضد character. لو مش موجود → محايد (0) */
  readonly hasSentencePunctuation: boolean;
  /** طول السطر نسبة لمتوسط الأطوال في المستند */
  readonly relativeLength: number;
  /** عدد مرات ظهور الاسم (قبل الـ colon) في باقي المستند */
  readonly nameRepetitionCount: number;
  /** هل الاسم مبذور من inline patterns (pre-seeded)؟ */
  readonly isPreSeeded: boolean;
  /** موقع السطر في المستند (0.0 → 1.0) */
  readonly positionRatio: number;
  /** النص المُطبّع (comparison-only) */
  readonly normalized: string;
}

/**
 * استخراج الخصائص الهيكلية لكل سطر في المستند.
 *
 * @param drafts - المسودات المصنفة من الـ forward pass
 * @param preSeeded - أسماء الشخصيات المؤكدة من المسح الأولي
 * @returns مصفوفة features بنفس ترتيب الـ drafts
 */
export const extractSequenceFeatures = (
  drafts: readonly ClassifiedDraft[],
  preSeeded: ReadonlySet<string>
): SequenceFeatures[] => {
  if (drafts.length === 0) return [];

  // حساب متوسط الطول لحساب relativeLength
  const avgLength =
    drafts.reduce((sum, d) => sum + normalizeLine(d.text).length, 0) /
      drafts.length || 1;

  // حساب تكرار الأسماء (النص قبل الـ colon)
  const nameFrequency = new Map<string, number>();
  for (const draft of drafts) {
    const name = normalizeCharacterName(draft.text);
    if (name && /[:：]\s*$/.test(normalizeLine(draft.text))) {
      nameFrequency.set(name, (nameFrequency.get(name) ?? 0) + 1);
    }
  }

  return drafts.map((draft, index) => {
    const normalized = normalizeLine(draft.text);
    const words = normalized.split(/\s+/).filter(Boolean);
    const name = normalizeCharacterName(draft.text);
    const endsColon = /[:：]\s*$/.test(normalized);

    return {
      wordCount: words.length,
      charCount: normalized.length,
      endsWithColon: endsColon,
      startsWithDash: /^[-–—]/.test(normalized),
      startsWithBullet: startsWithBullet(normalized),
      isParenthetical: /^\s*[(（].*[)）]\s*$/.test(normalized),
      hasActionIndicators: detectActionSignals(normalized),
      hasSentencePunctuation: endsColon
        ? hasSentencePunctuation(normalized.replace(/[:：]\s*$/, "").trim())
        : hasSentencePunctuation(normalized),
      relativeLength: normalized.length / avgLength,
      nameRepetitionCount: endsColon ? (nameFrequency.get(name) ?? 0) : 0,
      isPreSeeded: endsColon ? preSeeded.has(name) : false,
      positionRatio: drafts.length > 1 ? index / (drafts.length - 1) : 0.5,
      normalized,
    };
  });
};

/** كشف مؤشرات وصف/حدث — هيكلية بحتة */
const detectActionSignals = (normalized: string): boolean => {
  if (!normalized) return false;
  if (/^[-–—]/.test(normalized)) return true;
  if (startsWithBullet(normalized)) return true;
  return (
    isActionCueLine(normalized) ||
    matchesActionStartPattern(normalized) ||
    isActionVerbStart(normalized) ||
    hasActionVerbStructure(normalized) ||
    PRONOUN_ACTION_RE.test(normalized)
  );
};

// ─── Transition Matrix (log scores) ──────────────────────────────

/**
 * مصفوفة الانتقال — log scores بين الأنواع.
 *
 * مبنية على قواعد بنية السيناريو:
 * - character → dialogue = متوقع جداً (+2.5)
 * - character → character = نادر جداً (-8.0)
 * - dialogue → character = شائع (+1.5)
 * - action → character = شائع (+1.5)
 * - وهكذا...
 *
 * القيم مُعايرة يدوياً بناءً على بنية السيناريو العربي.
 * DEFAULT_PENALTY = العقوبة لأي انتقال غير مذكور صراحةً.
 */
const DEFAULT_PENALTY = -10.0;

// buildTransitionMatrix: مصفوفة NUM_TYPES × NUM_TYPES
const buildTransitionMatrix = (): Float64Array => {
  const matrix = new Float64Array(NUM_TYPES * NUM_TYPES).fill(DEFAULT_PENALTY);

  const set = (from: ElementType, to: ElementType, score: number): void => {
    const fi = TYPE_INDEX.get(from)!;
    const ti = TYPE_INDEX.get(to)!;
    matrix[fi * NUM_TYPES + ti] = score;
  };

  // ─── basmala (بداية المستند عادةً)
  set("basmala", "scene_header_1", 2.0);
  set("basmala", "action", 1.0);
  set("basmala", "character", 0.5);

  // ─── scene_header_1 (رقم المشهد — بعده header_2 أو header_3)
  set("scene_header_1", "scene_header_2", 2.5);
  set("scene_header_1", "scene_header_3", 1.0);
  set("scene_header_1", "action", 0.5);
  set("scene_header_1", "scene_header_1", -4.0);

  // ─── scene_header_2 (زمن/موقع — بعده header_3 أو action أو character)
  set("scene_header_2", "scene_header_3", 2.0);
  set("scene_header_2", "action", 2.0);
  set("scene_header_2", "character", 1.5);
  set("scene_header_2", "transition", 0.0);
  set("scene_header_2", "scene_header_1", -2.0);

  // ─── scene_header_3 (تفصيل الموقع — بعده action أو character)
  set("scene_header_3", "action", 2.0);
  set("scene_header_3", "character", 1.5);

  // ─── action (الأكثر مرونة)
  set("action", "action", 1.0);
  set("action", "character", 1.5);
  set("action", "transition", 0.5);
  set("action", "scene_header_1", 0.5);
  set("action", "dialogue", -2.0);
  set("action", "parenthetical", -3.0);

  // ─── character (بعده حوار أو parenthetical — أي شيء تاني عقوبة)
  set("character", "dialogue", 2.5);
  set("character", "parenthetical", 1.5);
  set("character", "character", -8.0);
  set("character", "action", -5.0);
  set("character", "transition", -7.0);

  // ─── dialogue (بعده حوار تاني، character جديد، أو action)
  set("dialogue", "dialogue", 1.0);
  set("dialogue", "character", 1.5);
  set("dialogue", "action", 1.0);
  set("dialogue", "transition", 0.5);
  set("dialogue", "parenthetical", 0.5);
  set("dialogue", "scene_header_1", 0.0);

  // ─── parenthetical (بعده حوار حصراً)
  set("parenthetical", "dialogue", 2.5);
  set("parenthetical", "parenthetical", -4.0);
  set("parenthetical", "character", -5.0);
  set("parenthetical", "action", -4.0);

  // ─── transition (بعده مشهد جديد)
  set("transition", "scene_header_1", 2.0);
  set("transition", "action", 0.5);
  set("transition", "transition", -6.0);
  set("transition", "character", -3.0);
  set("transition", "dialogue", -6.0);

  return matrix;
};

const TRANSITION_MATRIX = buildTransitionMatrix();

// ─── Emission Scorer ─────────────────────────────────────────────

/**
 * حساب emission score لنوع معين بناءً على الخصائص الهيكلية.
 *
 * كل feature بتساهم بـ log score:
 * - موجب = بيدعم النوع ده
 * - سالب = بيعاقب النوع ده
 * - صفر = محايد (الـ feature مش مؤثرة)
 *
 * الـ hasSentencePunctuation بتشتغل بنظام ADAPTIVE:
 * - لو الترقيم موجود → عقوبة (اسم الشخصية مش جملة)
 * - لو مش موجود → 0 (محايد — الكاتب ممكن ميستخدمش ترقيم)
 */
const computeEmissionScores = (f: SequenceFeatures): Float64Array => {
  const scores = new Float64Array(NUM_TYPES).fill(0);

  // ─── basmala
  {
    const idx = TYPE_INDEX.get("basmala")!;
    // البسملة: نص قصير جداً محدد
    if (f.wordCount >= 3 && f.wordCount <= 6 && !f.endsWithColon) {
      scores[idx] += 0.5;
    } else {
      scores[idx] -= 5.0;
    }
  }

  // ─── scene_header_1 (رقم المشهد — كلمة أو كلمتين)
  {
    const idx = TYPE_INDEX.get("scene_header_1")!;
    if (f.wordCount <= 3 && !f.endsWithColon && !f.hasActionIndicators) {
      scores[idx] += 0.5;
    } else {
      scores[idx] -= 4.0;
    }
  }

  // ─── scene_header_2 (زمن/موقع — قصير بدون نقطتين)
  {
    const idx = TYPE_INDEX.get("scene_header_2")!;
    if (f.wordCount <= 5 && !f.endsWithColon) {
      scores[idx] += 0.5;
    } else {
      scores[idx] -= 3.0;
    }
    if (f.hasActionIndicators) scores[idx] -= 2.0;
  }

  // ─── scene_header_3
  {
    const idx = TYPE_INDEX.get("scene_header_3")!;
    if (f.wordCount <= 8 && !f.endsWithColon && !f.hasActionIndicators) {
      scores[idx] += 0.5;
    } else {
      scores[idx] -= 3.0;
    }
  }

  // ─── action
  {
    const idx = TYPE_INDEX.get("action")!;
    if (f.hasActionIndicators) scores[idx] += 3.0;
    if (f.startsWithDash) scores[idx] += 2.0;
    if (f.startsWithBullet) scores[idx] += 2.0;
    if (f.wordCount >= 5) scores[idx] += 1.0;
    if (f.endsWithColon && f.wordCount <= 4) scores[idx] -= 2.0;
    if (f.isParenthetical) scores[idx] -= 3.0;
  }

  // ─── character
  {
    const idx = TYPE_INDEX.get("character")!;
    // الإشارة الأقوى: ينتهي بنقطتين + قصير
    if (f.endsWithColon) scores[idx] += 3.0;
    else scores[idx] -= 6.0;

    if (f.wordCount <= 3) scores[idx] += 2.0;
    else if (f.wordCount <= 4) scores[idx] += 1.0;
    else scores[idx] -= 2.0;

    if (f.wordCount > 5) scores[idx] -= 3.0;

    // مؤشرات وصف = ضد character
    if (f.hasActionIndicators) scores[idx] -= 3.0;

    // التكرار: أسماء الشخصيات بتتكرر
    if (f.nameRepetitionCount >= 2) scores[idx] += 2.5;
    else if (f.nameRepetitionCount === 1) scores[idx] -= 1.0;

    // البذر: مؤكد من المسح الأولي
    if (f.isPreSeeded) scores[idx] += 2.5;

    // ADAPTIVE: الترقيم
    // لو الترقيم الجُملي موجود قبل الـ colon → عقوبة (اسم الشخصية مش جملة)
    // لو مش موجود → 0 (محايد — الكاتب ممكن ميستخدمش ترقيم)
    if (f.hasSentencePunctuation && f.endsWithColon) scores[idx] -= 2.5;

    // أقواس = مش character
    if (f.isParenthetical) scores[idx] -= 4.0;
  }

  // ─── dialogue
  {
    const idx = TYPE_INDEX.get("dialogue")!;
    // الحوار ممكن يكون أي طول
    if (!f.hasActionIndicators) scores[idx] += 0.5;

    // ينتهي بنقطتين + قصير = أرجح character مش dialogue
    if (f.endsWithColon && f.wordCount <= 3) scores[idx] -= 2.0;

    // حوار طويل = أرجح dialogue
    if (f.wordCount >= 4 && !f.hasActionIndicators) scores[idx] += 1.0;

    // ترقيم جُملي = دليل على جملة = dialogue أرجح
    if (f.hasSentencePunctuation) scores[idx] += 0.5;

    if (f.startsWithDash) scores[idx] -= 1.5;
    if (f.startsWithBullet) scores[idx] -= 1.5;
    if (f.isParenthetical) scores[idx] -= 2.0;
  }

  // ─── parenthetical
  {
    const idx = TYPE_INDEX.get("parenthetical")!;
    if (f.isParenthetical) scores[idx] += 5.0;
    else scores[idx] -= 5.0;
  }

  // ─── transition
  {
    const idx = TYPE_INDEX.get("transition")!;
    if (f.wordCount <= 5 && !f.endsWithColon && !f.hasActionIndicators) {
      scores[idx] += 0.0;
    } else {
      scores[idx] -= 3.0;
    }
    if (f.wordCount > 6) scores[idx] -= 3.0;
  }

  return scores;
};

// ─── Forward Pass Bias ───────────────────────────────────────────

/**
 * إضافة bias من الـ forward pass.
 *
 * الـ forward pass أصلاً عنده معلومات كتيرة (regex matches, context memory, etc).
 * بدل ما نتجاهله، بنضيفه كـ emission bias:
 * - confidence عالية → bias أقوى
 * - confidence منخفضة → bias أضعف
 *
 * ده بيخلي الـ Viterbi يحترم الـ forward pass لما يكون واثق،
 * ويعارضه لما يكون مش واثق + الـ transitions بتقول حاجة تانية.
 */
const FORWARD_BIAS_SCALE = 0.04;

const addForwardPassBias = (
  emissionScores: Float64Array,
  forwardType: ElementType,
  forwardConfidence: number
): void => {
  const typeIdx = TYPE_INDEX.get(forwardType);
  if (typeIdx === undefined) return;

  // bias متناسب مع الثقة: confidence 90 → +3.6, confidence 50 → +2.0
  const bias = forwardConfidence * FORWARD_BIAS_SCALE;
  emissionScores[typeIdx] += bias;
};

// ─── Viterbi Decoder ─────────────────────────────────────────────

/** نتيجة Viterbi لسطر واحد */
export interface ViterbiResult {
  readonly type: ElementType;
  readonly score: number;
}

/**
 * خوارزمية Viterbi — تلاقي أفضل تسلسل أنواع عالمي.
 *
 * التعقيد: O(n × k²) حيث n = عدد الأسطر، k = عدد الأنواع
 * مع n=200 و k=8: 200 × 64 = 12,800 عملية — أقل من millisecond
 *
 * @param allEmissions - مصفوفة emission scores لكل سطر
 * @returns مصفوفة ViterbiResult لكل سطر
 */
const viterbiDecode = (
  allEmissions: readonly Float64Array[]
): ViterbiResult[] => {
  const n = allEmissions.length;
  if (n === 0) return [];

  const k = NUM_TYPES;

  // prob[t][s] = أعلى log-score لأي مسار ينتهي بالنوع s في السطر t
  const prob = new Float64Array(n * k);
  // prev[t][s] = النوع السابق في أفضل مسار ينتهي بالنوع s في السطر t
  const prev = new Int32Array(n * k).fill(-1);

  // التهيئة: السطر الأول — emission بس (بدون transition)
  for (let s = 0; s < k; s++) {
    prob[s] = allEmissions[0][s];
  }

  // الملء: لكل سطر بعد الأول
  for (let t = 1; t < n; t++) {
    const tOffset = t * k;
    const prevOffset = (t - 1) * k;

    for (let s = 0; s < k; s++) {
      let bestScore = -Infinity;
      let bestPrev = 0;

      for (let r = 0; r < k; r++) {
        const score =
          prob[prevOffset + r] +
          TRANSITION_MATRIX[r * k + s] +
          allEmissions[t][s];
        if (score > bestScore) {
          bestScore = score;
          bestPrev = r;
        }
      }

      prob[tOffset + s] = bestScore;
      prev[tOffset + s] = bestPrev;
    }
  }

  // الـ Backtrack: ابدأ من أعلى score في آخر سطر
  const path = new Array<number>(n);
  let bestFinal = 0;
  let bestFinalScore = -Infinity;
  const lastOffset = (n - 1) * k;
  for (let s = 0; s < k; s++) {
    if (prob[lastOffset + s] > bestFinalScore) {
      bestFinalScore = prob[lastOffset + s];
      bestFinal = s;
    }
  }
  path[n - 1] = bestFinal;

  for (let t = n - 2; t >= 0; t--) {
    path[t] = prev[(t + 1) * k + path[t + 1]];
  }

  // تحويل لـ ViterbiResult[]
  return path.map((typeIdx, lineIdx) => ({
    type: VITERBI_TYPES[typeIdx],
    score: prob[lineIdx * k + typeIdx],
  }));
};

// ─── Disagreement Detection ──────────────────────────────────────

/** اختلاف بين forward pass و Viterbi */
export interface SequenceDisagreement {
  readonly lineIndex: number;
  readonly forwardType: ElementType;
  readonly forwardConfidence: number;
  readonly viterbiType: ElementType;
  readonly viterbiScore: number;
  /** قوة الاختلاف (0-100) — تُستخدم كـ suspicion score */
  readonly disagreementStrength: number;
}

/**
 * كشف الاختلافات بين forward pass و Viterbi.
 *
 * كل سطر اختلف فيه النوعين → SequenceDisagreement.
 * قوة الاختلاف بتعتمد على:
 * - الفرق بين الـ Viterbi score للنوعين
 * - الـ forward confidence (منخفضة = أرجح إن Viterbi أصح)
 */
const detectDisagreements = (
  drafts: readonly ClassifiedDraft[],
  viterbiResults: readonly ViterbiResult[],
  allEmissions: readonly Float64Array[]
): SequenceDisagreement[] => {
  const disagreements: SequenceDisagreement[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const forwardType = drafts[i].type;
    const viterbiType = viterbiResults[i].type;

    if (forwardType === viterbiType) continue;

    // حساب قوة الاختلاف
    const forwardTypeIdx = TYPE_INDEX.get(forwardType) ?? 0;
    const viterbiTypeIdx = TYPE_INDEX.get(viterbiType) ?? 0;
    const emissions = allEmissions[i];

    // الفرق بين emission scores للنوعين
    const emissionDiff = emissions[viterbiTypeIdx] - emissions[forwardTypeIdx];

    // ثقة الـ forward pass المنخفضة بتزود الشبهة
    const confidenceFactor = Math.max(0, (85 - drafts[i].confidence) * 0.5);

    // قوة الاختلاف: مزيج من emission diff + confidence factor
    const rawStrength = Math.max(0, emissionDiff * 8 + confidenceFactor + 40);
    const strength = Math.min(99, Math.round(rawStrength));

    disagreements.push({
      lineIndex: i,
      forwardType,
      forwardConfidence: drafts[i].confidence,
      viterbiType,
      viterbiScore: viterbiResults[i].score,
      disagreementStrength: strength,
    });
  }

  return disagreements;
};

// ─── الدالة الرئيسية ─────────────────────────────────────────────

/** نتيجة الـ Sequence Optimizer الكاملة */
export interface SequenceOptimizationResult {
  /** تسلسل Viterbi الأمثل */
  readonly viterbiSequence: readonly ViterbiResult[];
  /** الاختلافات بين forward pass و Viterbi */
  readonly disagreements: readonly SequenceDisagreement[];
  /** عدد الأسطر اللي Viterbi اقترح نوع مختلف */
  readonly totalDisagreements: number;
  /** نسبة الاختلاف (0.0 → 1.0) */
  readonly disagreementRate: number;
}

/**
 * الدالة الرئيسية — تشغّل الـ Viterbi Sequence Optimizer.
 *
 * 1. استخراج الخصائص الهيكلية لكل سطر
 * 2. حساب emission scores + forward pass bias
 * 3. تشغيل Viterbi
 * 4. كشف الاختلافات
 *
 * @param drafts - المسودات المصنفة من الـ forward pass
 * @param preSeeded - أسماء الشخصيات المؤكدة (من CMM)
 * @returns نتيجة التحسين مع الاختلافات
 */
export const optimizeSequence = (
  drafts: readonly ClassifiedDraft[],
  preSeeded: ReadonlySet<string> = new Set()
): SequenceOptimizationResult => {
  if (drafts.length === 0) {
    return {
      viterbiSequence: [],
      disagreements: [],
      totalDisagreements: 0,
      disagreementRate: 0,
    };
  }

  // الخطوة 1: استخراج الخصائص
  const features = extractSequenceFeatures(drafts, preSeeded);

  // الخطوة 2: حساب emission scores + forward bias
  const allEmissions: Float64Array[] = features.map((f, i) => {
    const emissions = computeEmissionScores(f);
    addForwardPassBias(emissions, drafts[i].type, drafts[i].confidence);
    return emissions;
  });

  // الخطوة 3: Viterbi
  const viterbiSequence = viterbiDecode(allEmissions);

  // الخطوة 4: كشف الاختلافات
  const disagreements = detectDisagreements(
    drafts,
    viterbiSequence,
    allEmissions
  );

  const result: SequenceOptimizationResult = {
    viterbiSequence,
    disagreements,
    totalDisagreements: disagreements.length,
    disagreementRate:
      drafts.length > 0 ? disagreements.length / drafts.length : 0,
  };

  if (disagreements.length > 0) {
    optimizerLogger.info("viterbi-optimization-complete", {
      totalLines: drafts.length,
      totalDisagreements: disagreements.length,
      disagreementRate: result.disagreementRate.toFixed(3),
      topDisagreements: disagreements
        .sort((a, b) => b.disagreementStrength - a.disagreementStrength)
        .slice(0, 5)
        .map((d) => ({
          line: d.lineIndex,
          forward: d.forwardType,
          viterbi: d.viterbiType,
          strength: d.disagreementStrength,
        })),
    });
  }

  return result;
};

// ─── Viterbi Feedback Loop ──────────────────────────────────────

/** حدود الأمان للـ override */
const OVERRIDE_MIN_STRENGTH = 70;
const OVERRIDE_MAX_FORWARD_CONFIDENCE = 82;
const OVERRIDE_MAX_RATIO = 0.15;

/**
 * تطبيق اقتراحات Viterbi القوية على الأسطر المصنّفة.
 *
 * شروط التطبيق لكل سطر:
 * 1. قوة الاختلاف ≥ 70
 * 2. ثقة الـ forward pass ≤ 82
 * 3. النوع الجديد يعدّي sequence validation
 * 4. إجمالي التغييرات ≤ 15% من الأسطر
 *
 * @param classified - الأسطر المصنّفة (بيتعدّل in-place)
 * @param optimizationResult - نتيجة الـ Viterbi optimizer
 * @returns عدد التصحيحات المُطبّقة
 */
export const applyViterbiOverrides = (
  classified: ClassifiedDraft[],
  optimizationResult: SequenceOptimizationResult
): number => {
  const { disagreements } = optimizationResult;
  if (disagreements.length === 0) return 0;

  const maxOverrides = Math.max(
    1,
    Math.ceil(classified.length * OVERRIDE_MAX_RATIO)
  );

  // ترتيب بأقوى اختلاف أولاً
  const sorted = [...disagreements].sort(
    (a, b) => b.disagreementStrength - a.disagreementStrength
  );

  let applied = 0;

  for (const d of sorted) {
    if (applied >= maxOverrides) break;
    if (d.disagreementStrength < OVERRIDE_MIN_STRENGTH) break;
    if (d.forwardConfidence > OVERRIDE_MAX_FORWARD_CONFIDENCE) continue;

    // لا نغيّر أنواع regex عالية الثقة
    const draft = classified[d.lineIndex];
    if (draft.classificationMethod === "regex" && draft.confidence >= 90) {
      continue;
    }

    // sequence validation: النوع الجديد لازم يتوافق مع الجيران
    const prevType = d.lineIndex > 0 ? classified[d.lineIndex - 1].type : null;
    const nextType =
      d.lineIndex + 1 < classified.length
        ? classified[d.lineIndex + 1].type
        : null;

    let seqValid = true;
    if (prevType) {
      const validFromPrev = CLASSIFICATION_VALID_SEQUENCES.get(prevType);
      if (validFromPrev && !validFromPrev.has(d.viterbiType)) {
        seqValid = false;
      }
    }
    if (nextType && seqValid) {
      const validFromNew = CLASSIFICATION_VALID_SEQUENCES.get(d.viterbiType);
      if (validFromNew && !validFromNew.has(nextType)) {
        seqValid = false;
      }
    }

    if (!seqValid) continue;

    classified[d.lineIndex] = {
      ...draft,
      type: d.viterbiType,
      confidence: Math.max(draft.confidence, 83),
      classificationMethod: "context",
    };
    applied++;
  }

  if (applied > 0) {
    optimizerLogger.info("viterbi-overrides-applied", {
      applied,
      maxAllowed: maxOverrides,
      totalDisagreements: disagreements.length,
    });
  }

  return applied;
};
