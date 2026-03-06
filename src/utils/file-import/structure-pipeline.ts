/**
 * @module utils/file-import/structure-pipeline
 * @description خط أنابيب تحويل النص الخام إلى كتل سيناريو مُصنَّفة.
 *
 * يستخدم آلة حالة ({@link ClassificationState}) مع مُصنّف قائم على القواعد
 * ({@link classifyLineLabelOnly}) يمرّ بسلسلة أولويات:
 *
 * 1. بسملة → 2. ترويسات مشاهد متوقعة → 3. top-line → 4. header-1
 * → 5. header-2 → 6. header-3 → 7. انتقال → 8. إشارة متحدث
 * → 9. متحدث مُدمج → 10. حوار → 11. فعل (action) كبديل افتراضي
 *
 * يتضمن حارس إسقاط ({@link buildProjectionGuardReport}) لمنع
 * الكتابة التدميرية عند انهيار حاد في عدد الكتل.
 */
import type { ScreenplayBlock } from "./document-model";
import {
  DEFAULT_STRUCTURE_PIPELINE_POLICY,
  type ProjectionGuardReport,
  type StructurePipelinePolicy,
  type StructurePipelineResult,
} from "../../types/structure-pipeline";
import {
  DATE_PATTERNS,
  MIXED_NUMBER_RE,
  SCENE_HEADER3_KNOWN_PLACES_RE,
  SCENE_HEADER3_MULTI_LOCATION_EXACT_RE,
  SCENE_HEADER3_MULTI_LOCATION_RE,
  SCENE_HEADER3_PREFIX_RE,
  SCENE_HEADER3_RANGE_RE,
  SCENE_LOCATION_RE,
  SCENE_NUMBER_EXACT_RE,
  SCENE_TIME_RE,
  TIME_PATTERNS,
  convertHindiToArabic,
} from "../../extensions/arabic-patterns";
import {
  hasActionVerbStructure,
  hasSentencePunctuation,
  isActionVerbStart,
  matchesActionStartPattern,
  normalizeLine,
} from "../../extensions/text-utils";

type BlockFormatId = ScreenplayBlock["formatId"];

/**
 * حالة آلة التصنيف المُتبادَلة بين استدعاءات {@link classifyLineLabelOnly}.
 * @property expectedSceneHeader - ترويسة المشهد المتوقعة في السطر التالي
 * @property expectingDialogueAfterCue - هل السطر التالي يُتوقع أن يكون حواراً بعد إشارة متحدث
 * @property previousFormat - تنسيق السطر السابق (لتحديد استمرار الحوار)
 */
type ClassificationState = {
  expectedSceneHeader: "scene_header_2" | "scene_header_3" | null;
  expectingDialogueAfterCue: boolean;
  previousFormat: BlockFormatId | null;
};

const INLINE_SPEAKER_RE = /^([^:：]{1,30})\s*[:：]\s*(.+)$/u;
const SPEAKER_CUE_RE = /^([^:：]{1,30})\s*[:：]\s*$/u;
const TRANSITION_LINE_RE =
  /^(?:قطع(?:\s+إلى)?|انتقال(?:\s+إلى)?|cut\s+to)\s*[:：]?$/iu;

const normalizeInlineSpaces = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizeLineForStructure = (line: string): string =>
  normalizeInlineSpaces(
    convertHindiToArabic((line ?? "").replace(/\u00A0/g, " "))
  );

const stripTrailingColon = (line: string): string =>
  line.replace(/[:：]\s*$/u, "").trim();

const SCENE_NUMERIC_LOCATION_RE =
  /(?:شارع|طريق|مبنى|غرفة|شقة|مكتب|دور|بوابة|باب)\s*[0-9٠-٩]+/iu;

const hasTemporalSceneSignal = (line: string): boolean =>
  DATE_PATTERNS.test(line) || TIME_PATTERNS.test(line);

const hasSceneNumericSignal = (line: string): boolean =>
  SCENE_NUMERIC_LOCATION_RE.test(line) ||
  /\b(?:مشهد|scene)\s*[0-9٠-٩]+\b/iu.test(line);

const hasUsefulNumericToken = (line: string): boolean =>
  MIXED_NUMBER_RE.test(line) && line.split(/\s+/).filter(Boolean).length <= 12;

const isLikelySpeakerName = (value: string): boolean => {
  const name = normalizeInlineSpaces(value);
  if (!name || name.length > 28) return false;
  if (name.split(" ").length > 4) return false;
  if (!/^[\p{L}\p{N}\s]+$/u.test(name)) return false;
  if (/^(?:مشهد|scene|قطع|انتقال|داخلي|خارجي)$/iu.test(name)) return false;
  return true;
};

const isTransitionLine = (line: string): boolean =>
  TRANSITION_LINE_RE.test(normalizeLine(line));

const isSceneHeader1Only = (line: string): boolean => {
  const normalized = normalizeLine(stripTrailingColon(line));
  if (!SCENE_NUMBER_EXACT_RE.test(normalized)) return false;
  const numberPrefixMatch = normalized.match(/^(?:مشهد|scene)\s*[0-9٠-٩]+/iu);
  if (!numberPrefixMatch) return false;
  const remainder = normalized.slice(numberPrefixMatch[0].length).trim();
  return remainder.length === 0;
};

const isSceneHeader2Only = (line: string): boolean => {
  const normalized = normalizeLine(stripTrailingColon(line))
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (SCENE_NUMBER_EXACT_RE.test(normalized)) return false;
  return SCENE_TIME_RE.test(normalized) && SCENE_LOCATION_RE.test(normalized);
};

/**
 * يُقسّم سطر رأس مشهد مُركَّب (يحتوي رقم + زمن/مكان) إلى كتلتَي تصنيف مستقلتين.
 *
 * يُستدعى من {@link buildStructuredBlocksFromText} قبل المُصنّف حتى يبقى
 * ناتج التصنيف 8 أنواع فقط (بدون scene_header_top_line).
 *
 * @param line - السطر المُطبَّع
 * @returns كائن بالنصين أو null إذا لم يكن السطر مُركَّباً
 */
const splitCombinedSceneHeader = (
  line: string
): { header1: string; header2: string } | null => {
  const normalized = normalizeLine(stripTrailingColon(line));
  if (!SCENE_NUMBER_EXACT_RE.test(normalized)) return null;

  const numberPrefixMatch = normalized.match(/^(?:مشهد|scene)\s*[0-9٠-٩]+/iu);
  if (!numberPrefixMatch) return null;

  const remainder = normalized.slice(numberPrefixMatch[0].length).trim();
  if (!remainder) return null;

  const hasTime = SCENE_TIME_RE.test(remainder);
  const hasLocation = SCENE_LOCATION_RE.test(remainder);
  if (!hasTime || !hasLocation) return null;

  return { header1: numberPrefixMatch[0].trim(), header2: remainder };
};

const isSceneHeader3Standalone = (line: string): boolean => {
  const normalized = normalizeLine(stripTrailingColon(line));
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (!normalized) return false;
  if (wordCount > 14) return false;
  if (hasSentencePunctuation(normalized)) return false;
  if (isTransitionLine(normalized)) return false;
  if (SCENE_NUMBER_EXACT_RE.test(normalized)) return false;
  if (isSceneHeader2Only(normalized)) return false;
  if (isActionVerbStart(normalized)) return false;
  if (matchesActionStartPattern(normalized)) return false;
  if (hasActionVerbStructure(normalized)) return false;

  if (SCENE_HEADER3_PREFIX_RE.test(normalized)) return true;
  if (SCENE_HEADER3_RANGE_RE.test(normalized)) return true;
  if (SCENE_HEADER3_MULTI_LOCATION_EXACT_RE.test(normalized)) return true;
  if (SCENE_HEADER3_MULTI_LOCATION_RE.test(normalized)) return true;
  if (SCENE_HEADER3_KNOWN_PLACES_RE.test(normalized)) return true;
  if (hasTemporalSceneSignal(normalized)) return true;
  if (hasSceneNumericSignal(normalized)) return true;
  if (hasUsefulNumericToken(normalized) && SCENE_LOCATION_RE.test(normalized))
    return true;

  return false;
};

const resolvePolicy = (
  policy?: Partial<StructurePipelinePolicy>
): StructurePipelinePolicy => ({
  mergePolicy:
    policy?.mergePolicy ?? DEFAULT_STRUCTURE_PIPELINE_POLICY.mergePolicy,
  classifierRole:
    policy?.classifierRole ?? DEFAULT_STRUCTURE_PIPELINE_POLICY.classifierRole,
});

/**
 * يُصنّف سطراً واحداً إلى نوع عنصر سيناريو عبر سلسلة أولويات ثابتة.
 *
 * يُعدّل {@link ClassificationState} كأثر جانبي لتتبع التوقعات
 * بين الأسطر (مثل توقع ترويسة مشهد بعد رقم المشهد).
 *
 * @param line - السطر المُطبَّع
 * @param state - حالة آلة التصنيف (مُعدَّلة بالمرجع)
 * @returns معرّف تنسيق الكتلة ({@link BlockFormatId})
 */
const classifyLineLabelOnly = (
  line: string,
  state: ClassificationState
): BlockFormatId => {
  if (/^بسم\b/u.test(line) || /^بسم الله/u.test(line)) {
    state.expectedSceneHeader = null;
    state.expectingDialogueAfterCue = false;
    return "basmala";
  }

  if (state.expectedSceneHeader === "scene_header_2") {
    if (isSceneHeader2Only(line)) {
      state.expectedSceneHeader = "scene_header_3";
      state.expectingDialogueAfterCue = false;
      return "scene_header_2";
    }
    if (hasTemporalSceneSignal(line) || hasSceneNumericSignal(line)) {
      state.expectedSceneHeader = null;
      state.expectingDialogueAfterCue = false;
      return "scene_header_3";
    }
    if (isSceneHeader3Standalone(line)) {
      state.expectedSceneHeader = null;
      state.expectingDialogueAfterCue = false;
      return "scene_header_3";
    }
    state.expectedSceneHeader = null;
  } else if (state.expectedSceneHeader === "scene_header_3") {
    if (hasTemporalSceneSignal(line) || hasSceneNumericSignal(line)) {
      state.expectedSceneHeader = null;
      state.expectingDialogueAfterCue = false;
      return "scene_header_3";
    }
    if (isSceneHeader3Standalone(line)) {
      state.expectedSceneHeader = null;
      state.expectingDialogueAfterCue = false;
      return "scene_header_3";
    }
    if (isSceneHeader2Only(line)) {
      state.expectedSceneHeader = "scene_header_3";
      state.expectingDialogueAfterCue = false;
      return "scene_header_2";
    }
    state.expectedSceneHeader = null;
  }

  if (isSceneHeader1Only(line)) {
    state.expectedSceneHeader = "scene_header_2";
    state.expectingDialogueAfterCue = false;
    return "scene_header_1";
  }

  if (isSceneHeader2Only(line)) {
    state.expectedSceneHeader = "scene_header_3";
    state.expectingDialogueAfterCue = false;
    return "scene_header_2";
  }

  if (isSceneHeader3Standalone(line)) {
    state.expectedSceneHeader = null;
    state.expectingDialogueAfterCue = false;
    return "scene_header_3";
  }

  if (isTransitionLine(line)) {
    state.expectedSceneHeader = null;
    state.expectingDialogueAfterCue = false;
    return "transition";
  }

  const cueOnlyMatch = line.match(SPEAKER_CUE_RE);
  if (cueOnlyMatch && isLikelySpeakerName(cueOnlyMatch[1] ?? "")) {
    state.expectingDialogueAfterCue = true;
    return "character";
  }

  const inlineSpeakerMatch = line.match(INLINE_SPEAKER_RE);
  if (inlineSpeakerMatch && isLikelySpeakerName(inlineSpeakerMatch[1] ?? "")) {
    state.expectingDialogueAfterCue = false;
    return "dialogue";
  }

  if (state.expectingDialogueAfterCue) {
    state.expectedSceneHeader = null;
    state.expectingDialogueAfterCue = false;
    return "dialogue";
  }

  if (state.previousFormat === "character") {
    state.expectedSceneHeader = null;
    return "dialogue";
  }

  if (
    state.previousFormat === "dialogue" ||
    state.previousFormat === "parenthetical"
  ) {
    const normalizedForAction = normalizeLine(line);
    if (
      isActionVerbStart(normalizedForAction) ||
      matchesActionStartPattern(normalizedForAction) ||
      hasActionVerbStructure(normalizedForAction)
    ) {
      state.expectedSceneHeader = null;
      state.expectingDialogueAfterCue = false;
      return "action";
    }
    state.expectedSceneHeader = null;
    return "dialogue";
  }

  state.expectedSceneHeader = null;
  return "action";
};

const countNonActionBlocks = (blocks: ScreenplayBlock[]): number =>
  blocks.filter((block) => block.formatId !== "action").length;

/**
 * يُطبّع النص لمعالجة البنية: يوحّد فواصل الأسطر ويزيل أحرف التحكم
 * (NULL, VT, FF, BOM) وفواصل الفقرات/الأسطر في Unicode.
 *
 * @param text - النص الخام
 * @returns النص المُطبَّع
 */
export const normalizeTextForStructure = (text: string): string =>
  (text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u2028|\u2029/g, "\n")
    .split("\u0000")
    .join("")
    .split("\u000B")
    .join("\n")
    .split("\f")
    .join("\n")
    .replace(/^\uFEFF/, "");

/**
 * يُقسّم النص إلى أسطر مُطبَّعة مع حذف الأسطر الفارغة.
 * يُطبّق {@link normalizeTextForStructure} ثم تطبيع المسافات لكل سطر.
 *
 * @param text - النص الخام
 * @returns مصفوفة الأسطر غير الفارغة
 */
export const segmentLinesStrict = (text: string): string[] =>
  normalizeTextForStructure(text)
    .split("\n")
    .map(normalizeLineForStructure)
    .filter((line) => line.length > 0);

/**
 * يبني كتل سيناريو مُصنَّفة من نص خام عبر خط الأنابيب الكامل.
 *
 * التسلسل: تطبيع النص → تقسيم الأسطر → تصنيف كل سطر عبر
 * {@link classifyLineLabelOnly} مع حالة آلة مشتركة.
 *
 * @param text - النص الخام المراد تصنيفه
 * @param policy - سياسة خط الأنابيب الجزئية (اختياري)
 * @returns نتيجة تحتوي النص المُطبَّع والأسطر والكتل المُصنَّفة والسياسة المُطبَّقة
 *
 * @example
 * ```ts
 * const result = buildStructuredBlocksFromText('مشهد 1\nداخلي - ليل\nغرفة المعيشة')
 * // result.blocks → [{ formatId: 'scene_header_1', text: '...' }, ...]
 * ```
 */
export const buildStructuredBlocksFromText = (
  text: string,
  policy?: Partial<StructurePipelinePolicy>
): StructurePipelineResult => {
  const resolvedPolicy = resolvePolicy(policy);
  const normalizedText = normalizeTextForStructure(text);
  const normalizedLines = segmentLinesStrict(normalizedText);

  const state: ClassificationState = {
    expectedSceneHeader: null,
    expectingDialogueAfterCue: false,
    previousFormat: null,
  };

  const blocks: ScreenplayBlock[] = normalizedLines.flatMap((line) => {
    const split = splitCombinedSceneHeader(line);
    if (split) {
      state.expectedSceneHeader = "scene_header_3";
      state.expectingDialogueAfterCue = false;
      state.previousFormat = "scene_header_2";
      return [
        { formatId: "scene_header_1" as BlockFormatId, text: split.header1 },
        { formatId: "scene_header_2" as BlockFormatId, text: split.header2 },
      ];
    }

    const formatId = classifyLineLabelOnly(line, state);
    state.previousFormat = formatId;
    return [{ formatId, text: line }];
  });

  return {
    normalizedText,
    normalizedLines,
    blocks,
    policy: resolvedPolicy,
  };
};

/**
 * يبني تقرير حارس الإسقاط لمنع الكتابة التدميرية عند انهيار حاد في عدد الكتل.
 *
 * يفحص أربعة أنماط انهيار:
 * - `single-block-output-for-multiline-input` — مُدخل متعدد الأسطر أنتج كتلة واحدة فقط
 * - `sharp-input-output-collapse` — ≥8 أسطر مُدخلة أنتجت ≤25% كتل
 * - `sharp-document-collapse` — المستند الحالي ≥12 كتلة والمُخرج ≤20%
 * - `non-action-structure-loss` — فقدان ≥85% من الكتل غير الفعلية (حوار/ترويسات)
 *
 * @param inputLineCount - عدد أسطر المُدخل الأصلي
 * @param currentBlocks - الكتل الحالية في المستند (اختياري، للمقارنة)
 * @param nextBlocks - الكتل الناتجة عن التصنيف الجديد
 * @param policy - سياسة خط الأنابيب الجزئية (اختياري)
 * @returns تقرير يحتوي `accepted` (مقبول/مرفوض) وأسباب الرفض
 */
export const buildProjectionGuardReport = ({
  inputLineCount,
  currentBlocks,
  nextBlocks,
  policy,
}: {
  inputLineCount: number;
  currentBlocks?: ScreenplayBlock[];
  nextBlocks: ScreenplayBlock[];
  policy?: Partial<StructurePipelinePolicy>;
}): ProjectionGuardReport => {
  const resolvedPolicy = resolvePolicy(policy);
  const reasons: string[] = [];
  const safeInputLineCount = Math.max(0, inputLineCount);
  const outputBlockCount = nextBlocks.length;

  if (safeInputLineCount > 1 && outputBlockCount <= 1) {
    reasons.push("single-block-output-for-multiline-input");
  }

  if (
    safeInputLineCount >= 8 &&
    outputBlockCount <= Math.max(1, Math.floor(safeInputLineCount * 0.25))
  ) {
    reasons.push("sharp-input-output-collapse");
  }

  const currentBlockCount = currentBlocks?.length;
  if (
    typeof currentBlockCount === "number" &&
    currentBlockCount >= 12 &&
    outputBlockCount <= Math.max(1, Math.floor(currentBlockCount * 0.2))
  ) {
    reasons.push("sharp-document-collapse");
  }

  const currentNonActionCount = currentBlocks
    ? countNonActionBlocks(currentBlocks)
    : undefined;
  const outputNonActionCount = countNonActionBlocks(nextBlocks);

  if (
    resolvedPolicy.classifierRole === "label-only" &&
    typeof currentNonActionCount === "number" &&
    currentNonActionCount >= 3 &&
    outputNonActionCount <=
      Math.max(0, Math.floor(currentNonActionCount * 0.15))
  ) {
    reasons.push("non-action-structure-loss");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    inputLineCount: safeInputLineCount,
    outputBlockCount,
    currentBlockCount,
    currentNonActionCount,
    outputNonActionCount,
    fallbackApplied: false,
  };
};
