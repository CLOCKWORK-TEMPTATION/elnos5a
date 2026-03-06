import { Extension } from "@tiptap/core";
import { Fragment, Node as PmNode, Schema, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isActionLine } from "./action";
import { parseReviewCommands } from "./Arabic-Screenplay-Classifier-Agent";
import {
  DATE_PATTERNS,
  TIME_PATTERNS,
  convertHindiToArabic,
  detectDialect,
} from "./arabic-patterns";
import { isStandaloneBasmalaLine } from "./basmala";
import {
  ensureCharacterTrailingColon,
  isCharacterLine,
  parseImplicitCharacterDialogueWithoutColon,
  parseInlineCharacterDialogue,
} from "./character";
import { resolveNarrativeDecision } from "./classification-decision";
import { PostClassificationReviewer } from "./classification-core";
import type {
  ClassifiedDraft,
  ClassificationContext,
  ClassifiedLine,
  ElementType,
  LLMReviewPacket,
  SuspiciousLine,
} from "./classification-types";
import { isElementType } from "./classification-types";
import { ContextMemoryManager } from "./context-memory-manager";
import {
  getDialogueProbability,
  isDialogueContinuationLine,
  isDialogueLine,
} from "./dialogue";
import {
  buildDocumentContextGraph,
  type DocumentContextGraph,
} from "./document-context-graph";
import { HybridClassifier } from "./hybrid-classifier";
import { retroactiveCorrectionPass } from "./retroactive-corrector";
import {
  reverseClassificationPass,
  mergeForwardReverse,
} from "./reverse-classification-pass";
import {
  shouldReflect,
  reflectOnChunk,
  SELF_REFLECTION_CHUNK_SIZE,
} from "./self-reflection-pass";
import type { SequenceOptimizationResult } from "./structural-sequence-optimizer";
import {
  optimizeSequence,
  applyViterbiOverrides,
} from "./structural-sequence-optimizer";
import {
  mergeBrokenCharacterName,
  parseBulletLine,
  shouldMergeWrappedLines,
} from "./line-repair";
import { isParentheticalLine } from "./parenthetical";
import { isSceneHeader3Line } from "./scene-header-3";
import {
  isCompleteSceneHeaderLine,
  splitSceneHeaderLine,
} from "./scene-header-top-line";
import { isTransitionLine } from "./transition";
import { progressiveUpdater } from "./ai-progressive-updater";
import { pipelineRecorder } from "./pipeline-recorder";
import {
  COMMAND_API_VERSION,
  CLASSIFICATION_MODE,
  AGENT_REVIEW_MODEL,
  AGENT_REVIEW_DEADLINE_MS,
  AGENT_REVIEW_MAX_ATTEMPTS,
  AGENT_REVIEW_MAX_RATIO,
  AGENT_REVIEW_MIN_TIMEOUT_MS,
  AGENT_REVIEW_MAX_TIMEOUT_MS,
  AGENT_REVIEW_RETRY_DELAY_MS,
  agentReviewLogger,
  AGENT_REVIEW_FAIL_OPEN,
  sanitizeOcrArtifactsForClassification,
  AGENT_REVIEW_ENDPOINT,
  TEXT_EXTRACT_ENDPOINT,
  REVIEWABLE_AGENT_TYPES,
  VALID_AGENT_DECISION_TYPES,
  PASTE_CLASSIFIER_ERROR_EVENT,
} from "./paste-classifier-config";
export { PASTE_CLASSIFIER_ERROR_EVENT } from "./paste-classifier-config";
import {
  generateItemId,
  fetchWithTimeout,
  normalizeRawInputText,
  toSourceProfile,
  buildStructuredHintQueues,
  consumeSourceHintTypeForLine,
  shouldSkipAgentReviewInRuntime,
  waitBeforeRetry,
  isRetryableHttpStatus,
  toUniqueSortedIndexes,
  toNormalizedMetaIds,
  type ClassifiedDraftWithId,
} from "./paste-classifier-helpers";
import { requestContextEnhancement } from "./ai-context-layer";
import { requestDoubtResolution } from "./ai-doubt-layer";
import type {
  AgentReviewRequestPayload,
  AgentReviewResponsePayload,
  AgentCommand,
  AgentReviewResponseMeta,
  LineType,
} from "../types";
import {
  computeFingerprintSync,
  createImportOperationState,
  checkResponseValidity,
  normalizeAndDedupeCommands,
  prepareItemForPacket,
  buildPacketWithBudget,
  DEFAULT_PACKET_BUDGET,
} from "../pipeline";
import type { ItemSnapshot } from "../pipeline";
import {
  logAgentResponse,
  logCommandApply,
  logAgentError,
  telemetry as pipelineTelemetry,
} from "../pipeline/telemetry";

let pendingAgentAbortController: AbortController | null = null;

// ─── Feature Flags (طبقات جديدة — للتجربة) ────────────────────
// غيّر لـ true عشان تفعّل كل طبقة
export const PIPELINE_FLAGS = {
  /** Document Context Graph + DCG bonus في الـ hybrid classifier */
  DCG_ENABLED: true,
  /** Self-Reflection أثناء الـ forward pass */
  SELF_REFLECTION_ENABLED: true,
  /** أنماط 6-9 الجديدة في الـ retroactive corrector */
  RETRO_NEW_PATTERNS_ENABLED: true,
  /** Reverse Classification Pass + دمج */
  REVERSE_PASS_ENABLED: true,
  /** Viterbi Override (تطبيق اقتراحات Viterbi القوية) */
  VITERBI_OVERRIDE_ENABLED: true,
  /** Gemini Flash — تعزيز السياق (AI Layer 1) */
  GEMINI_CONTEXT_ENABLED: false,
  /** Gemini Flash — حل الشبهة (AI Layer 2) */
  GEMINI_DOUBT_ENABLED: false,
  /** Claude Agent Review — مراجعة نهائية (AI Layer 3) */
  CLAUDE_REVIEW_ENABLED: false,
};

/**
 * خيارات مصنّف اللصق التلقائي.
 */
export interface PasteClassifierOptions {
  /** دالة مراجعة محلية مخصصة (اختياري) */
  agentReview?: (
    classified: readonly ClassifiedDraftWithId[]
  ) => ClassifiedDraftWithId[];
}

/**
 * خيارات تطبيق تدفق التصنيف على العرض.
 */
export interface ApplyPasteClassifierFlowOptions {
  /** دالة مراجعة محلية مخصصة (اختياري) */
  agentReview?: (
    classified: readonly ClassifiedDraftWithId[]
  ) => ClassifiedDraftWithId[];
  /** موضع البدء في العرض (اختياري) */
  from?: number;
  /** موضع النهاية في العرض (اختياري) */
  to?: number;
  /** بروفايل مصدر التصنيف (paste | generic-open) */
  classificationProfile?: string; // ClassificationSourceProfile in classification-types
  /** نوع الملف المصدر (اختياري) */
  sourceFileType?: string;
  /** طريقة الاستخراج (اختياري) */
  sourceMethod?: string;
  /** تلميحات بنيوية من المصدر (Filmlane، PDF، إلخ) */
  structuredHints?: readonly unknown[]; // ScreenplayBlock[]
  /** عناصر schema من المحرك المضمّن (اختياري) */
  schemaElements?: readonly SchemaElementInput[];
}

export interface SchemaElementInput {
  readonly element: string;
  readonly value: string;
}

export interface ClassifyLinesContext {
  classificationProfile?: string;
  sourceFileType?: string;
  sourceMethod?: string;
  structuredHints?: readonly unknown[];
  schemaElements?: readonly SchemaElementInput[];
}

const buildContext = (
  previousTypes: readonly ElementType[]
): ClassificationContext => {
  const previousType =
    previousTypes.length > 0 ? previousTypes[previousTypes.length - 1] : null;
  const isInDialogueBlock =
    previousType === "character" ||
    previousType === "dialogue" ||
    previousType === "parenthetical";

  return {
    previousTypes,
    previousType,
    isInDialogueBlock,
    isAfterSceneHeaderTopLine:
      previousType === "scene_header_top_line" ||
      previousType === "scene_header_2",
  };
};

const hasTemporalSceneSignal = (text: string): boolean =>
  DATE_PATTERNS.test(text) || TIME_PATTERNS.test(text);

/**
 * جدول ربط أسماء عناصر المحرك بأنواع عناصر السيناريو
 */
const ENGINE_ELEMENT_MAP: ReadonlyMap<string, ElementType> = new Map([
  ["cene_header_1", "scene_header_1"],
  ["cene_header_2", "scene_header_2"],
  ["scene_header_3", "scene_header_3"],
  ["ACTION", "action"],
  ["DIALOGUE", "dialogue"],
  ["CHARACTER", "character"],
  ["TRANSITION", "transition"],
  ["PARENTHETICAL", "parenthetical"],
  ["BASMALA", "basmala"],
]);

/**
 * مسار schema-style: تحويل schemaElements مباشرة إلى ClassifiedDraftWithId[]
 * بـ classificationMethod="external-engine" دون المرور بـ HybridClassifier
 */
const classifyFromSchemaElements = (
  schemaElements: readonly SchemaElementInput[]
): ClassifiedDraftWithId[] => {
  const drafts: ClassifiedDraftWithId[] = [];

  for (const el of schemaElements) {
    if (!el || typeof el.element !== "string" || typeof el.value !== "string")
      continue;

    const mappedType = ENGINE_ELEMENT_MAP.get(el.element.trim());
    if (!mappedType) continue; // عنصر غير معروف — تجاهل

    const text = el.value.trim();
    if (!text) continue;

    drafts.push({
      _itemId: generateItemId(),
      type: mappedType,
      text,
      confidence: 1.0,
      classificationMethod: "external-engine",
    });
  }

  return drafts;
};

/**
 * تصنيف النصوص المُلصقة محلياً مع توليد معرف فريد (_itemId) لكل عنصر.
 * المعرّف يُستخدم لاحقاً في تتبع الأوامر من الوكيل.
 */
export const classifyLines = (
  text: string,
  context?: ClassifyLinesContext
): ClassifiedDraftWithId[] => {
  // ── مسار schema-style: إذا أتت schemaElements من المحرك ──
  if (context?.schemaElements && context.schemaElements.length > 0) {
    const schemaDrafts = classifyFromSchemaElements(context.schemaElements);
    if (schemaDrafts.length > 0) {
      pipelineRecorder.snapshot("schema-style-classify", schemaDrafts, {
        source: "external-engine",
        elementCount: schemaDrafts.length,
      });
      return schemaDrafts;
    }
    // fallback: إذا لم ينتج schema-style أي نتائج، تابع بالمسار العادي
  }

  // ── توحيد النص: إزالة الحروف غير المرئية التي يضيفها Word clipboard ──
  const normalizedText = normalizeRawInputText(text);

  // ── diagnostic: بصمة النص المُدخل للمقارنة بين المسارات ──
  const _diagRawLen = normalizedText.length;
  const _diagRawLines = normalizedText.split(/\r?\n/).length;
  const _diagRawHash = Array.from(normalizedText).reduce(
    (h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0,
    0
  );
  const _diagFirst80 = normalizedText.slice(0, 80).replace(/\n/g, "↵");
  const _diagLast80 = normalizedText.slice(-80).replace(/\n/g, "↵");

  // ── diagnostic: تفصيل أنواع الحروف الخاصة في النص الأصلي ──
  const _diagCharBreakdown = {
    cr: (text.match(/\r/g) || []).length,
    nbsp: (text.match(/\u00A0/g) || []).length,
    zwnj: (text.match(/\u200C/g) || []).length,
    zwj: (text.match(/\u200D/g) || []).length,
    zwsp: (text.match(/\u200B/g) || []).length,
    lrm: (text.match(/\u200E/g) || []).length,
    rlm: (text.match(/\u200F/g) || []).length,
    bom: (text.match(/\uFEFF/g) || []).length,
    tab: (text.match(/\t/g) || []).length,
    softHyphen: (text.match(/\u00AD/g) || []).length,
    alm: (text.match(/\u061C/g) || []).length,
    fullwidthColon: (text.match(/\uFF1A/g) || []).length,
  };

  agentReviewLogger.info("diag:normalize-delta", {
    originalLength: text.length,
    normalizedLength: normalizedText.length,
    charsRemoved: text.length - normalizedText.length,
    charBreakdown: JSON.stringify(_diagCharBreakdown),
  });

  const { sanitizedText, removedLines } =
    sanitizeOcrArtifactsForClassification(normalizedText);
  if (removedLines > 0) {
    agentReviewLogger.telemetry("artifact-lines-stripped", {
      layer: "frontend-classifier",
      artifactLinesRemoved: removedLines,
    });
  }
  const lines = sanitizedText.split(/\r?\n/);

  agentReviewLogger.info("diag:classifyLines-input", {
    classificationProfile: context?.classificationProfile,
    sourceFileType: context?.sourceFileType,
    hasStructuredHints: !!(
      context?.structuredHints && context.structuredHints.length > 0
    ),
    rawTextLength: _diagRawLen,
    rawLineCount: _diagRawLines,
    rawTextHash: _diagRawHash,
    sanitizedLineCount: lines.length,
    sanitizedRemovedLines: removedLines,
    first80: _diagFirst80,
    last80: _diagLast80,
  });
  const classified: ClassifiedDraftWithId[] = [];

  const memoryManager = new ContextMemoryManager();
  // بذر الـ registry من inline patterns (regex-based) قبل الـ loop
  memoryManager.seedFromInlinePatterns(lines);
  // بذر الـ registry من standalone patterns (اسم: سطر + حوار سطر تالي)
  memoryManager.seedFromStandalonePatterns(lines);
  const hybridClassifier = new HybridClassifier();

  // ── بناء Document Context Graph (مسح أولي — O(n)) ──
  const dcg: DocumentContextGraph | undefined = PIPELINE_FLAGS.DCG_ENABLED
    ? buildDocumentContextGraph(lines)
    : undefined;

  // استخراج الخيارات من السياق
  const sourceProfile = toSourceProfile(context?.classificationProfile);
  const hintQueues = buildStructuredHintQueues(context?.structuredHints);
  let activeSourceHintType: ElementType | undefined;

  const push = (entry: ClassifiedDraft): void => {
    const withId: ClassifiedDraftWithId = {
      ...entry,
      _itemId: generateItemId(),
      // إضافة بيانات المصدر إذا كانت متوفرة
      sourceProfile,
      sourceHintType: activeSourceHintType,
    };
    classified.push(withId);
    memoryManager.record(entry);
  };

  // ── Recorder: بداية run جديد + snapshot أولي ──
  pipelineRecorder.startRun(context?.classificationProfile ?? "paste", {
    textLength: normalizedText.length,
    lineCount: lines.length,
  });

  // ── Self-Reflection: عدّاد أسطر الـ chunk الحالي ──
  let chunkStartIdx = 0;
  let linesInChunk = 0;

  for (let _lineIdx = 0; _lineIdx < lines.length; _lineIdx++) {
    const rawLine = lines[_lineIdx];
    const trimmed = parseBulletLine(rawLine);
    if (!trimmed) continue;
    activeSourceHintType = consumeSourceHintTypeForLine(trimmed, hintQueues);
    const normalizedForClassification = convertHindiToArabic(trimmed);
    const detectedDialect = detectDialect(normalizedForClassification);

    const previous = classified[classified.length - 1];
    if (previous) {
      const mergedCharacter = mergeBrokenCharacterName(previous.text, trimmed);
      if (mergedCharacter && previous.type === "action") {
        const corrected: ClassifiedDraft = {
          ...previous,
          type: "character",
          text: ensureCharacterTrailingColon(mergedCharacter),
          confidence: 92,
          classificationMethod: "context",
        };
        classified[classified.length - 1] = corrected;
        memoryManager.replaceLast(corrected);
        continue;
      }

      if (shouldMergeWrappedLines(previous.text, trimmed, previous.type)) {
        const merged: ClassifiedDraft = {
          ...previous,
          text: `${previous.text} ${trimmed}`.replace(/\s+/g, " ").trim(),
          confidence: Math.max(previous.confidence, 86),
          classificationMethod: "context",
        };
        classified[classified.length - 1] = merged;
        memoryManager.replaceLast(merged);
        continue;
      }
    }

    const context = buildContext(classified.map((item) => item.type));

    if (isStandaloneBasmalaLine(normalizedForClassification)) {
      push({
        type: "basmala",
        text: trimmed,
        confidence: 99,
        classificationMethod: "regex",
      });
      continue;
    }

    if (isCompleteSceneHeaderLine(normalizedForClassification)) {
      const parts = splitSceneHeaderLine(normalizedForClassification);
      if (parts) {
        push({
          type: "scene_header_1",
          text: parts.header1,
          confidence: 96,
          classificationMethod: "regex",
        });
        if (parts.header2) {
          push({
            type: "scene_header_2",
            text: parts.header2,
            confidence: 96,
            classificationMethod: "regex",
          });
        }
        continue;
      }
    }

    if (isTransitionLine(normalizedForClassification)) {
      push({
        type: "transition",
        text: trimmed,
        confidence: 95,
        classificationMethod: "regex",
      });
      continue;
    }

    const temporalSceneSignal = hasTemporalSceneSignal(
      normalizedForClassification
    );
    if (
      context.isAfterSceneHeaderTopLine &&
      (isSceneHeader3Line(normalizedForClassification, context) ||
        temporalSceneSignal)
    ) {
      push({
        type: "scene_header_3",
        text: trimmed,
        confidence: temporalSceneSignal ? 88 : 90,
        classificationMethod: "context",
      });
      continue;
    }

    if (isSceneHeader3Line(normalizedForClassification, context)) {
      push({
        type: "scene_header_3",
        text: trimmed,
        confidence: 82,
        classificationMethod: "regex",
      });
      continue;
    }

    const inlineParsed = parseInlineCharacterDialogue(trimmed);
    if (inlineParsed) {
      if (inlineParsed.cue) {
        push({
          type: "action",
          text: inlineParsed.cue,
          confidence: 92,
          classificationMethod: "regex",
        });
      }

      push({
        type: "character",
        text: ensureCharacterTrailingColon(inlineParsed.characterName),
        confidence: 98,
        classificationMethod: "regex",
      });

      push({
        type: "dialogue",
        text: inlineParsed.dialogueText,
        confidence: 98,
        classificationMethod: "regex",
      });
      continue;
    }

    if (
      isParentheticalLine(normalizedForClassification) &&
      context.isInDialogueBlock
    ) {
      push({
        type: "parenthetical",
        text: trimmed,
        confidence: 90,
        classificationMethod: "regex",
      });
      continue;
    }

    if (isDialogueContinuationLine(rawLine, context.previousType)) {
      push({
        type: "dialogue",
        text: trimmed,
        confidence: 82,
        classificationMethod: "context",
      });
      continue;
    }

    // أخذ snapshot قبل parseImplicit عشان نمرر confirmedCharacters
    const snapshot = memoryManager.getSnapshot();

    const implicit = parseImplicitCharacterDialogueWithoutColon(
      trimmed,
      context,
      snapshot.confirmedCharacters
    );
    if (implicit) {
      if (implicit.cue) {
        push({
          type: "action",
          text: implicit.cue,
          confidence: 85,
          classificationMethod: "context",
        });
      }

      push({
        type: "character",
        text: ensureCharacterTrailingColon(implicit.characterName),
        confidence: 78,
        classificationMethod: "context",
      });

      push({
        type: "dialogue",
        text: implicit.dialogueText,
        confidence: 78,
        classificationMethod: "context",
      });
      continue;
    }
    if (
      isCharacterLine(
        normalizedForClassification,
        context,
        snapshot.confirmedCharacters
      )
    ) {
      push({
        type: "character",
        text: ensureCharacterTrailingColon(trimmed),
        confidence: 88,
        classificationMethod: "regex",
      });
      continue;
    }

    const dialogueProbability = getDialogueProbability(
      normalizedForClassification,
      context
    );
    const dialogueThreshold = detectedDialect ? 5 : 6;
    if (
      isDialogueLine(normalizedForClassification, context, snapshot) ||
      dialogueProbability >= dialogueThreshold
    ) {
      const dialectBoost = detectedDialect ? 3 : 0;
      push({
        type: "dialogue",
        text: trimmed,
        confidence: Math.max(
          72,
          Math.min(94, 64 + dialogueProbability * 4 + dialectBoost)
        ),
        classificationMethod: "context",
      });
      continue;
    }

    const decision = resolveNarrativeDecision(
      normalizedForClassification,
      context,
      snapshot
    );
    const hybridResult = hybridClassifier.classifyLine(
      normalizedForClassification,
      decision.type,
      context,
      memoryManager.getSnapshot(),
      dcg?.lineContexts[_lineIdx]
    );

    if (hybridResult.type === "scene_header_1") {
      const parts = splitSceneHeaderLine(normalizedForClassification);
      if (parts && parts.header2) {
        push({
          type: "scene_header_1",
          text: parts.header1,
          confidence: Math.max(85, hybridResult.confidence),
          classificationMethod: hybridResult.classificationMethod,
        });
        push({
          type: "scene_header_2",
          text: parts.header2,
          confidence: Math.max(85, hybridResult.confidence),
          classificationMethod: hybridResult.classificationMethod,
        });
        continue;
      }
    }

    if (hybridResult.type === "character") {
      push({
        type: "character",
        text: ensureCharacterTrailingColon(trimmed),
        confidence: Math.max(78, hybridResult.confidence),
        classificationMethod: hybridResult.classificationMethod,
      });
      continue;
    }

    if (
      hybridResult.type === "action" ||
      isActionLine(normalizedForClassification, context)
    ) {
      push({
        type: "action",
        text: trimmed.replace(/^[-–—]\s*/, ""),
        confidence: Math.max(74, hybridResult.confidence),
        classificationMethod: hybridResult.classificationMethod,
      });
      continue;
    }

    push({
      type: hybridResult.type,
      text: trimmed,
      confidence: Math.max(68, hybridResult.confidence),
      classificationMethod: hybridResult.classificationMethod,
    });

    // ── Self-Reflection: مراجعة ذاتية دورية أثناء الـ forward pass ──
    if (PIPELINE_FLAGS.SELF_REFLECTION_ENABLED) {
      linesInChunk++;
      const lastType = classified[classified.length - 1]?.type;
      if (
        lastType &&
        shouldReflect(linesInChunk, lastType, SELF_REFLECTION_CHUNK_SIZE)
      ) {
        reflectOnChunk(
          classified,
          chunkStartIdx,
          classified.length,
          memoryManager,
          dcg
        );
        chunkStartIdx = classified.length;
        linesInChunk = 0;
      }
    }
  }

  // ── Self-Reflection: مراجعة الـ chunk الأخير المتبقي ──
  if (PIPELINE_FLAGS.SELF_REFLECTION_ENABLED && linesInChunk >= 3) {
    reflectOnChunk(
      classified,
      chunkStartIdx,
      classified.length,
      memoryManager,
      dcg
    );
  }

  // ── Recorder: snapshot بعد الـ forward pass ──
  pipelineRecorder.snapshot("forward-pass", classified);

  // ── ممر التصحيح الرجعي (retroactive correction pass) ──
  const _retroCorrections = retroactiveCorrectionPass(
    classified,
    memoryManager,
    PIPELINE_FLAGS.RETRO_NEW_PATTERNS_ENABLED
  );
  if (_retroCorrections > 0) {
    agentReviewLogger.info("diag:retroactive-corrections", {
      corrections: _retroCorrections,
      classifiedCount: classified.length,
    });
  }

  // ── Recorder: snapshot بعد الـ retroactive corrector ──
  pipelineRecorder.snapshot("retroactive", classified, {
    corrections: _retroCorrections,
  });

  // ── ممر التصنيف العكسي (Reverse Classification Pass) + دمج ──
  if (PIPELINE_FLAGS.REVERSE_PASS_ENABLED && dcg) {
    const reverseResult = reverseClassificationPass(classified, dcg);
    const _mergeCorrections = mergeForwardReverse(classified, reverseResult);
    if (_mergeCorrections > 0) {
      agentReviewLogger.info("diag:reverse-merge-corrections", {
        corrections: _mergeCorrections,
        classifiedCount: classified.length,
      });
    }
  }

  // ── Recorder: snapshot بعد الـ reverse pass ──
  pipelineRecorder.snapshot("reverse-pass", classified);

  // ── ممر Viterbi للتحسين التسلسلي (Structural Sequence Optimizer) ──
  const preSeeded = memoryManager.getPreSeededCharacters();
  const _seqOptResult = optimizeSequence(classified, preSeeded);
  if (_seqOptResult.totalDisagreements > 0) {
    agentReviewLogger.info("diag:viterbi-disagreements", {
      total: _seqOptResult.totalDisagreements,
      rate: _seqOptResult.disagreementRate.toFixed(3),
      top: _seqOptResult.disagreements
        .slice(0, 5)
        .map(
          (d) =>
            `L${d.lineIndex}:${d.forwardType}→${d.viterbiType}(${d.disagreementStrength})`
        ),
    });
  }

  // ── Viterbi Feedback Loop: تطبيق الاقتراحات القوية ──
  if (PIPELINE_FLAGS.VITERBI_OVERRIDE_ENABLED) {
    const _viterbiOverrides = applyViterbiOverrides(classified, _seqOptResult);
    if (_viterbiOverrides > 0) {
      agentReviewLogger.info("diag:viterbi-overrides", {
        applied: _viterbiOverrides,
        classifiedCount: classified.length,
      });
    }
  }

  // ── Recorder: snapshot بعد Viterbi ──
  pipelineRecorder.snapshot("viterbi", classified, {
    disagreements: _seqOptResult.totalDisagreements,
  });

  // تخزين نتيجة Viterbi على المصفوفة لاستخدامها في agent review
  (
    classified as ClassifiedDraftWithId[] & {
      _sequenceOptimization?: SequenceOptimizationResult;
    }
  )._sequenceOptimization = _seqOptResult;

  // ── diagnostic: ملخص نتائج التصنيف للمقارنة ──
  const _diagTypeDist: Record<string, number> = {};
  for (const item of classified) {
    _diagTypeDist[item.type] = (_diagTypeDist[item.type] ?? 0) + 1;
  }
  agentReviewLogger.info("diag:classifyLines-output", {
    classificationProfile: context?.classificationProfile,
    sourceFileType: context?.sourceFileType,
    rawTextHash: Array.from(normalizedText).reduce(
      (h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0,
      0
    ),
    inputLineCount: lines.length,
    classifiedCount: classified.length,
    mergedOrSkipped: lines.length - classified.length,
    typeDistribution: _diagTypeDist,
    viterbiDisagreements: _seqOptResult.totalDisagreements,
  });

  return classified;
};

const elementTypeToLineType = (type: ElementType): LineType => {
  return type;
};

const normalizeAgentDecisionType = (type: LineType): LineType => {
  if (type === "scene_header_1" || type === "scene_header_2") {
    return "scene_header_top_line";
  }
  return type;
};

const lineTypeToElementType = (type: LineType): ElementType | null => {
  const normalizedType = normalizeAgentDecisionType(type);
  return normalizedType;
};

const toClassifiedLineRecords = (
  classified: ClassifiedDraft[]
): ClassifiedLine[] =>
  classified.map((item, index) => ({
    lineIndex: index,
    text: item.text,
    assignedType: item.type,
    originalConfidence: item.confidence,
    classificationMethod: item.classificationMethod,
    sourceHintType: item.sourceHintType,
    sourceProfile: item.sourceProfile,
  }));

interface ReviewRoutingStats {
  countPass: number;
  countLocalReview: number;
  countAgentCandidate: number;
  countAgentForced: number;
}

const EMBEDDED_NARRATIVE_SUSPICION_FLOOR = 96;

const promoteHighSeverityMismatches = (
  suspiciousLines: readonly SuspiciousLine[]
): SuspiciousLine[] =>
  suspiciousLines.map((suspicious) => {
    if (
      suspicious.routingBand === "agent-candidate" &&
      suspicious.findings.some(
        (f) =>
          f.detectorId === "content-type-mismatch" &&
          f.suspicionScore >= EMBEDDED_NARRATIVE_SUSPICION_FLOOR
      )
    ) {
      return {
        ...suspicious,
        routingBand: "agent-forced" as const,
        escalationScore: Math.max(suspicious.escalationScore, 90),
      };
    }
    return suspicious;
  });

const summarizeRoutingStats = (
  totalReviewed: number,
  suspiciousLines: readonly SuspiciousLine[]
): ReviewRoutingStats => {
  const stats: ReviewRoutingStats = {
    countPass: Math.max(0, totalReviewed - suspiciousLines.length),
    countLocalReview: 0,
    countAgentCandidate: 0,
    countAgentForced: 0,
  };

  for (const line of suspiciousLines) {
    if (line.routingBand === "local-review") {
      stats.countLocalReview += 1;
      continue;
    }
    if (line.routingBand === "agent-candidate") {
      stats.countAgentCandidate += 1;
      continue;
    }
    if (line.routingBand === "agent-forced") {
      stats.countAgentForced += 1;
    }
  }

  return stats;
};

const shouldEscalateToAgent = (suspicious: SuspiciousLine): boolean => {
  if (suspicious.routingBand === "agent-forced") return true;
  if (suspicious.routingBand !== "agent-candidate") return false;
  return suspicious.criticalMismatch || suspicious.distinctDetectors >= 2;
};

export const selectSuspiciousLinesForAgent = (
  packet: LLMReviewPacket
): SuspiciousLine[] => {
  const forced = packet.suspiciousLines
    .filter((line) => line.routingBand === "agent-forced")
    .sort((a, b) => b.escalationScore - a.escalationScore);

  const candidates = packet.suspiciousLines
    .filter(
      (line) =>
        line.routingBand === "agent-candidate" && shouldEscalateToAgent(line)
    )
    .sort((a, b) => b.escalationScore - a.escalationScore);

  if (forced.length === 0 && candidates.length === 0) return [];

  const maxToAgent = Math.max(
    1,
    Math.ceil(packet.totalReviewed * AGENT_REVIEW_MAX_RATIO)
  );
  if (forced.length >= maxToAgent) {
    return forced;
  }

  const remainingSlots = Math.max(0, maxToAgent - forced.length);
  return [...forced, ...candidates.slice(0, remainingSlots)];
};

/**
 * تحويل استجابة الوكيل إلى بيانات وصفية معتمدة (Command API v2).
 * يتعامل مع:
 * - commandCount (بدل decisionCount)
 * - missingItemIds (بدل missingItemIndexes)
 * - forcedItemIds (بدل forcedItemIndexes)
 * - unresolvedForcedItemIds (بدل unresolvedForcedItemIndexes)
 */
const toValidAgentReviewMeta = (
  raw: unknown
): AgentReviewResponseMeta | undefined => {
  if (!raw || typeof raw !== "object") return undefined;

  const record = raw as {
    requestedCount?: unknown;
    commandCount?: unknown;
    missingItemIds?: unknown;
    forcedItemIds?: unknown;
    unresolvedForcedItemIds?: unknown;
  };

  const requestedCount =
    typeof record.requestedCount === "number" &&
    Number.isFinite(record.requestedCount)
      ? Math.max(0, Math.trunc(record.requestedCount))
      : 0;

  const commandCount =
    typeof record.commandCount === "number" &&
    Number.isFinite(record.commandCount)
      ? Math.max(0, Math.trunc(record.commandCount))
      : 0;

  return {
    requestedCount,
    commandCount,
    missingItemIds: toNormalizedMetaIds(record.missingItemIds),
    forcedItemIds: toNormalizedMetaIds(record.forcedItemIds),
    unresolvedForcedItemIds: toNormalizedMetaIds(
      record.unresolvedForcedItemIds
    ),
  };
};

/**
 * تحويل استجابة الوكيل إلى أوامر معتمدة (Command API v2).
 * يتعامل مع نوعي الأوامر:
 * - relabel: إعادة تصنيف عنصر (itemId → newType)
 * - split: تقسيم عنصر إلى عنصرين (itemId → leftType + rightType)
 */
const toValidAgentCommands = (raw: unknown): AgentCommand[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const opRaw = (entry as { op?: unknown }).op;
      const itemIdRaw = (entry as { itemId?: unknown }).itemId;
      const confidenceRaw = (entry as { confidence?: unknown }).confidence;
      const reasonRaw = (entry as { reason?: unknown }).reason;

      // التحقق من الحقول المشتركة
      if (typeof itemIdRaw !== "string" || !itemIdRaw.trim()) return null;
      const itemId = itemIdRaw.trim();

      const confidence =
        typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
          ? Math.max(0, Math.min(1, confidenceRaw))
          : 0.85;

      const reason =
        typeof reasonRaw === "string" && reasonRaw.trim()
          ? reasonRaw.trim()
          : "أمر بدون سبب مفصل";

      // معالجة أوامر relabel
      if (opRaw === "relabel") {
        const newTypeRaw = (entry as { newType?: unknown }).newType;
        if (typeof newTypeRaw !== "string") return null;
        if (!VALID_AGENT_DECISION_TYPES.has(newTypeRaw as LineType))
          return null;
        const normalizedNewType = normalizeAgentDecisionType(
          newTypeRaw as LineType
        );

        return {
          op: "relabel" as const,
          itemId,
          newType: normalizedNewType,
          confidence,
          reason,
        };
      }

      // معالجة أوامر split
      if (opRaw === "split") {
        const splitAtRaw = (entry as { splitAt?: unknown }).splitAt;
        const leftTypeRaw = (entry as { leftType?: unknown }).leftType;
        const rightTypeRaw = (entry as { rightType?: unknown }).rightType;

        if (
          typeof splitAtRaw !== "number" ||
          !Number.isInteger(splitAtRaw) ||
          splitAtRaw <= 0
        )
          return null;
        if (typeof leftTypeRaw !== "string") return null;
        if (typeof rightTypeRaw !== "string") return null;

        if (!VALID_AGENT_DECISION_TYPES.has(leftTypeRaw as LineType))
          return null;
        if (!VALID_AGENT_DECISION_TYPES.has(rightTypeRaw as LineType))
          return null;
        const normalizedLeftType = normalizeAgentDecisionType(
          leftTypeRaw as LineType
        );
        const normalizedRightType = normalizeAgentDecisionType(
          rightTypeRaw as LineType
        );

        return {
          op: "split" as const,
          itemId,
          splitAt: Number(splitAtRaw),
          leftType: normalizedLeftType,
          rightType: normalizedRightType,
          confidence,
          reason,
        };
      }

      return null;
    })
    .filter((entry): entry is AgentCommand => entry !== null);
};

/**
 * تحويل استجابة الوكيل إلى بنية معتمدة (Command API v2).
 * يدعم:
 * - commands (بدل decisions)
 * - importOpId, requestId, apiVersion, mode
 * - status جديد: "applied" | "partial" | "skipped" | "error"
 *   (لم يعد هناك "warning")
 */
const normalizeAgentReviewPayload = (
  payload: unknown,
  fallbackText?: string
): AgentReviewResponsePayload => {
  if (!payload || typeof payload !== "object") {
    const parsedFallback = fallbackText
      ? parseReviewCommands(fallbackText)
      : [];
    return {
      status: parsedFallback.length > 0 ? "applied" : "skipped",
      model: AGENT_REVIEW_MODEL,
      commands: parsedFallback,
      message:
        parsedFallback.length > 0
          ? "تم التطبيق من تحليل نص الاستجابة (fallback)."
          : "بيانات استجابة فارغة أو غير صالحة.",
      latencyMs: 0,
      importOpId: generateItemId(),
      requestId: "",
      apiVersion: COMMAND_API_VERSION,
      mode: CLASSIFICATION_MODE,
      meta: undefined,
    };
  }

  const record = payload as {
    message?: unknown;
    status?: unknown;
    model?: unknown;
    commands?: unknown;
    latencyMs?: unknown;
    importOpId?: unknown;
    requestId?: unknown;
    apiVersion?: unknown;
    mode?: unknown;
    meta?: unknown;
  };

  // التحقق من الـ status وتحويل warning → partial
  let status: "applied" | "partial" | "skipped" | "error" = "error";
  if (
    record.status === "applied" ||
    record.status === "partial" ||
    record.status === "skipped" ||
    record.status === "error"
  ) {
    status = record.status;
  } else if (record.status === "warning") {
    // التحويل التلقائي من warning إلى partial
    status = "partial";
  }

  const directCommands = toValidAgentCommands(record.commands);
  const textCandidates = [
    typeof record.message === "string" ? record.message : "",
    fallbackText ?? "",
  ].filter(Boolean);

  let parsedCommands = directCommands;
  if (parsedCommands.length === 0) {
    for (const candidate of textCandidates) {
      const parsed = parseReviewCommands(candidate);
      if (parsed.length > 0) {
        parsedCommands = parsed;
        break;
      }
    }
  }

  // إذا كان لدينا أوامر لكن الـ status خطأ، غيّره إلى applied
  const normalizedStatus: "applied" | "partial" | "skipped" | "error" =
    parsedCommands.length > 0 && status === "error" ? "applied" : status;

  return {
    status: normalizedStatus,
    model:
      typeof record.model === "string" && record.model.trim()
        ? record.model.trim()
        : AGENT_REVIEW_MODEL,
    commands: parsedCommands,
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message.trim()
        : normalizedStatus === "applied"
          ? "تم تطبيق أوامر الوكيل."
          : "لم يتم إرجاع أوامر قابلة للتطبيق من الوكيل.",
    latencyMs:
      typeof record.latencyMs === "number" && Number.isFinite(record.latencyMs)
        ? record.latencyMs
        : 0,
    importOpId:
      typeof record.importOpId === "string" && record.importOpId.trim()
        ? record.importOpId.trim()
        : generateItemId(),
    requestId:
      typeof record.requestId === "string" ? record.requestId.trim() : "",
    apiVersion:
      typeof record.apiVersion === "string" &&
      record.apiVersion.trim() === "2.0"
        ? "2.0"
        : COMMAND_API_VERSION,
    mode:
      typeof record.mode === "string" && record.mode.trim() === "auto-apply"
        ? "auto-apply"
        : CLASSIFICATION_MODE,
    meta: toValidAgentReviewMeta(record.meta),
  };
};

/**
 * إرسال طلب مراجعة إلى الوكيل عبر HTTP.
 * يدعم إعادة المحاولة المقتولة بالمهلة الزمنية والتعامل مع الأخطاء الشبكية.
 */
const requestAgentReview = async (
  request: AgentReviewRequestPayload
): Promise<AgentReviewResponsePayload> => {
  if (shouldSkipAgentReviewInRuntime()) {
    agentReviewLogger.error("request-runtime-not-supported", {
      sessionId: request.sessionId,
    });
    throw new Error(
      "Agent review backend path is mandatory and requires a browser runtime."
    );
  }

  if (!AGENT_REVIEW_ENDPOINT) {
    agentReviewLogger.error("request-missing-endpoint", {
      sessionId: request.sessionId,
    });
    throw new Error(
      "عنوان خادم المراجعة غير مضبوط — تأكد من ضبط VITE_FILE_IMPORT_BACKEND_URL في ملف .env"
    );
  }

  let lastError: unknown = null;
  const startedAt = Date.now();
  const deadlineAt = startedAt + AGENT_REVIEW_DEADLINE_MS;

  for (let attempt = 1; attempt <= AGENT_REVIEW_MAX_ATTEMPTS; attempt += 1) {
    const remainingBeforeAttempt = deadlineAt - Date.now();
    if (remainingBeforeAttempt <= 0) {
      throw new Error(
        `Agent review exceeded deadline (${AGENT_REVIEW_DEADLINE_MS}ms).`
      );
    }

    if (pendingAgentAbortController) {
      pendingAgentAbortController.abort();
    }
    const controller = new AbortController();
    pendingAgentAbortController = controller;
    const timeoutForAttempt = Math.min(
      AGENT_REVIEW_MAX_TIMEOUT_MS,
      Math.max(AGENT_REVIEW_MIN_TIMEOUT_MS, remainingBeforeAttempt - 200)
    );

    try {
      const response = await fetchWithTimeout(
        AGENT_REVIEW_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        },
        controller,
        timeoutForAttempt
      );

      if (!response.ok) {
        const body = await response.text();
        const isRetryable = isRetryableHttpStatus(response.status);
        agentReviewLogger.error("request-http-error", {
          sessionId: request.sessionId,
          status: response.status,
          body,
          attempt,
          isRetryable,
        });
        if (isRetryable && attempt < AGENT_REVIEW_MAX_ATTEMPTS) {
          // Longer delay for overload errors (server already retried internally)
          const isOverload =
            response.status === 429 ||
            response.status === 529 ||
            response.status === 503;
          const delay = isOverload
            ? Math.max(AGENT_REVIEW_RETRY_DELAY_MS * attempt * 4, 3_000)
            : AGENT_REVIEW_RETRY_DELAY_MS * attempt;
          await waitBeforeRetry(delay);
          continue;
        }
        throw new Error(
          `Agent review route failed (${response.status}): ${body}`
        );
      }

      const responseText = await response.text();
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(responseText);
      } catch {
        parsedPayload = responseText;
      }
      const payload = normalizeAgentReviewPayload(parsedPayload, responseText);
      agentReviewLogger.telemetry("request-response", {
        sessionId: request.sessionId,
        status: payload.status,
        commands: payload.commands?.length ?? 0,
        model: payload.model,
        latencyMs: payload.latencyMs,
        apiVersion: payload.apiVersion,
        mode: payload.mode,
        requestedCount: payload.meta?.requestedCount ?? 0,
        commandCount: payload.meta?.commandCount ?? 0,
        unresolvedForced: payload.meta?.unresolvedForcedItemIds?.length ?? 0,
        attempt,
      });
      if (payload.status === "error") {
        const requestIdSuffix = payload.requestId
          ? ` [requestId=${payload.requestId}]`
          : "";
        throw new Error(
          `Agent review status is ${payload.status}${requestIdSuffix}: ${payload.message}`
        );
      }
      return payload;
    } catch (error) {
      lastError = error;
      const aborted = (error as DOMException)?.name === "AbortError";
      const network = error instanceof TypeError;
      const retryable = aborted || network;
      const remainingAfterAttempt = deadlineAt - Date.now();

      // تصنيف الخطأ حسب نوعه الفعلي لتسهيل الـ debugging
      const isAgentStatusError =
        error instanceof Error &&
        error.message.startsWith("Agent review status is ");

      if (aborted) {
        agentReviewLogger.warn("request-aborted", {
          sessionId: request.sessionId,
          attempt,
          timeoutForAttempt,
          remainingAfterAttempt,
        });
      } else if (network) {
        agentReviewLogger.warn("request-network-error", {
          sessionId: request.sessionId,
          attempt,
          error: error.message,
          remainingAfterAttempt,
        });
      } else if (isAgentStatusError) {
        // الباكإند رجع حالة خطأ معروفة — مش خطأ غير متوقع
        agentReviewLogger.error("request-agent-status-error", {
          sessionId: request.sessionId,
          attempt,
          error: (error as Error).message,
          remainingAfterAttempt,
        });
      } else {
        agentReviewLogger.error("request-unhandled-error", {
          sessionId: request.sessionId,
          attempt,
          error,
          remainingAfterAttempt,
        });
      }

      if (
        retryable &&
        attempt < AGENT_REVIEW_MAX_ATTEMPTS &&
        remainingAfterAttempt > AGENT_REVIEW_MIN_TIMEOUT_MS
      ) {
        await waitBeforeRetry(AGENT_REVIEW_RETRY_DELAY_MS * attempt);
        continue;
      }

      throw error;
    } finally {
      if (pendingAgentAbortController === controller) {
        pendingAgentAbortController = null;
      }
    }
  }

  throw new Error(
    `Agent review request failed after ${AGENT_REVIEW_MAX_ATTEMPTS} attempts and ${Date.now() - startedAt}ms: ${String(lastError)}`
  );
};

/**
 * بناء بيانات وصفية احتياطية للمراجعة (في حالة فشل الاستجابة من الوكيل).
 * يحسب عدد الأوامر المطبقة والمفقودة والمصادمة.
 */
const buildAgentReviewMetaFallback = (
  requestPayload: AgentReviewRequestPayload,
  commands: readonly AgentCommand[],
  classified: readonly ClassifiedDraftWithId[]
): AgentReviewResponseMeta => {
  const commandByItemId = new Map<string, AgentCommand>();
  for (const command of commands) {
    commandByItemId.set(command.itemId, command);
  }

  const missingItemIds = requestPayload.requiredItemIds.filter(
    (itemId) => !commandByItemId.has(itemId)
  );

  // حساب الأوامر المصادمة (forced) التي لم تُطبق فعلياً
  // If the agent returned no command for a forced item, it means the agent
  // reviewed it and confirmed the current classification is correct.
  const unresolvedForcedItemIds = requestPayload.forcedItemIds.filter(
    (itemId) => {
      // بحث عن العنصر بـ itemId
      const originalIndex = classified.findIndex(
        (item) => item._itemId === itemId
      );
      // If the item doesn't exist in the classified list, it's a data error
      if (originalIndex < 0) return true;

      // If no command was returned, the agent confirmed the current type.
      // This is a valid resolution — not an error.
      const command = commandByItemId.get(itemId);
      if (!command) return false;

      // relabel and split are always considered resolved
      return false;
    }
  );

  return {
    requestedCount: requestPayload.requiredItemIds.length,
    commandCount: commandByItemId.size,
    missingItemIds: toNormalizedMetaIds(missingItemIds),
    forcedItemIds: toNormalizedMetaIds(requestPayload.forcedItemIds),
    unresolvedForcedItemIds: toNormalizedMetaIds(unresolvedForcedItemIds),
  };
};

/**
 * تطبيق مراجعة الوكيل عن بُعد (V2 مع Command API).
 * يرسل العناصر المشبوهة إلى الوكيل ويطبق الأوامر المُرجعة:
 * - relabel: إعادة تصنيف عنصر
 * - split: تقسيم عنصر إلى عنصرين
 */
const applyRemoteAgentReviewV2 = async (
  classified: ClassifiedDraftWithId[]
): Promise<ClassifiedDraftWithId[]> => {
  if (classified.length === 0) return classified;

  // استخراج نتيجة Viterbi المخزنة من classifyLines (لو موجودة)
  const storedSeqOpt = (
    classified as ClassifiedDraftWithId[] & {
      _sequenceOptimization?: SequenceOptimizationResult;
    }
  )._sequenceOptimization;

  const reviewInput = toClassifiedLineRecords(classified);
  const reviewer = new PostClassificationReviewer(
    storedSeqOpt?.disagreements?.length
      ? { viterbiDisagreements: storedSeqOpt.disagreements }
      : undefined
  );
  const basePacket = reviewer.review(reviewInput);
  const reviewPacket: LLMReviewPacket = {
    ...basePacket,
    suspiciousLines: promoteHighSeverityMismatches(basePacket.suspiciousLines),
  };
  const routingStats = summarizeRoutingStats(
    reviewPacket.totalReviewed,
    reviewPacket.suspiciousLines
  );
  const selectedForAgent = selectSuspiciousLinesForAgent(reviewPacket);
  const selectedItemIndexesPreview = toUniqueSortedIndexes(
    selectedForAgent.map((line) => line.line.lineIndex)
  );
  const forcedItemIndexesPreview = toUniqueSortedIndexes(
    selectedForAgent
      .filter((line) => line.routingBand === "agent-forced")
      .map((line) => line.line.lineIndex)
  );

  const suspectSnapshots = selectedForAgent.map((suspicious) => ({
    itemIndex: suspicious.line.lineIndex,
    assignedType: suspicious.line.assignedType,
    routingBand: suspicious.routingBand,
    escalationScore: suspicious.escalationScore,
    reason: suspicious.findings[0]?.reason ?? "",
  }));

  agentReviewLogger.telemetry("packet-built", {
    totalReviewed: reviewPacket.totalReviewed,
    totalSuspicious: reviewPacket.totalSuspicious,
    suspicionRate: reviewPacket.suspicionRate,
    ...routingStats,
    countSentToAgent: selectedForAgent.length,
    sentItemIndexes: selectedItemIndexesPreview,
    forcedItemIndexes: forcedItemIndexesPreview,
  });
  if (suspectSnapshots.length > 0) {
    agentReviewLogger.debug("packet-suspects-snapshot", {
      lines: suspectSnapshots,
    });
  }
  if (selectedForAgent.length === 0) {
    agentReviewLogger.info("packet-empty-forwarded", {
      ...routingStats,
      countSentToAgent: 0,
    });
  }

  const reviewPacketText = reviewer.formatForLLM(reviewPacket);

  const suspiciousPayload = selectedForAgent
    .map((rawSuspect) => {
      const lineIndex = rawSuspect.line.lineIndex;
      const item = classified[lineIndex];
      if (!item || !item._itemId) return null;

      const assignedType = elementTypeToLineType(item.type);
      if (!REVIEWABLE_AGENT_TYPES.has(assignedType)) return null;

      const contextLines = rawSuspect.contextLines
        .map((line) => {
          const mapped = elementTypeToLineType(line.assignedType);
          if (!REVIEWABLE_AGENT_TYPES.has(mapped)) return null;
          return {
            lineIndex: line.lineIndex,
            assignedType: mapped,
            text: line.text,
          };
        })
        .filter(
          (
            value
          ): value is {
            lineIndex: number;
            assignedType: LineType;
            text: string;
          } => value !== null
        );

      const routingBand: AgentReviewRequestPayload["suspiciousLines"][number]["routingBand"] =
        rawSuspect.routingBand === "agent-forced"
          ? "agent-forced"
          : "agent-candidate";

      return {
        itemId: item._itemId,
        lineIndex,
        text: item.text,
        assignedType,
        totalSuspicion: rawSuspect.totalSuspicion,
        reasons: rawSuspect.findings.map((finding) => finding.reason),
        contextLines,
        escalationScore: rawSuspect.escalationScore,
        routingBand,
        criticalMismatch: rawSuspect.criticalMismatch,
        distinctDetectors: rawSuspect.distinctDetectors,
        fingerprint: computeFingerprintSync(assignedType, item.text),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (suspiciousPayload.length === 0) {
    agentReviewLogger.info("packet-empty-after-filtering-forwarded", {
      totalSuspicious: reviewPacket.totalSuspicious,
      ...routingStats,
      countSentToAgent: 0,
    });
  }

  // ─── ميزانية الحزمة: اقتطاع إذا تجاوزت الحدود (packet-budget) ───
  const packetItems = suspiciousPayload.map((entry) =>
    prepareItemForPacket(
      entry.itemId,
      entry.text,
      entry.totalSuspicion,
      entry.routingBand === "agent-forced",
      DEFAULT_PACKET_BUDGET
    )
  );
  const packetResult = buildPacketWithBudget(
    packetItems,
    DEFAULT_PACKET_BUDGET
  );
  if (packetResult.wasTruncated) {
    const includedIds = new Set(packetResult.included.map((i) => i.itemId));
    agentReviewLogger.warn("packet-budget-truncated", {
      originalCount: suspiciousPayload.length,
      includedCount: packetResult.included.length,
      overflowCount: packetResult.overflow.length,
      totalEstimatedChars: packetResult.totalEstimatedChars,
    });
    // تصفية الحزمة المُرسلة حسب الميزانية
    suspiciousPayload.splice(
      0,
      suspiciousPayload.length,
      ...suspiciousPayload.filter((entry) => includedIds.has(entry.itemId))
    );
  }

  const sentItemIds = toNormalizedMetaIds(
    suspiciousPayload.map((entry) => entry.itemId)
  );
  const forcedItemIds = toNormalizedMetaIds(
    suspiciousPayload
      .filter((entry) => entry.routingBand === "agent-forced")
      .map((entry) => entry.itemId)
  );
  const emitAgentReviewSummary = (payload: {
    status: string;
    requestId: string;
    commandsReceived: number;
    commandsApplied: number;
  }): void => {
    agentReviewLogger.telemetry("agent-review-summary", {
      totalReviewed: reviewPacket.totalReviewed,
      totalSuspicious: reviewPacket.totalSuspicious,
      itemsSent: suspiciousPayload.length,
      commandsReceived: payload.commandsReceived,
      commandsApplied: payload.commandsApplied,
      status: payload.status,
      requestId: payload.requestId,
    });
  };

  const importOpId = generateItemId();

  // بناء حالة العملية واللقطات (للربط مع command-engine)
  const opState = createImportOperationState(importOpId, "paste");
  for (const entry of suspiciousPayload) {
    opState.snapshots.set(entry.itemId, {
      itemId: entry.itemId,
      fingerprint: entry.fingerprint,
      type: entry.assignedType,
      rawText: entry.text,
    } satisfies ItemSnapshot);
  }

  // تسجيل بداية العملية
  pipelineTelemetry.recordIngestionStart(importOpId, {
    source: "paste",
    trustLevel: "raw_text",
    itemsProcessed: classified.length,
  });

  const requestPayload: AgentReviewRequestPayload = {
    sessionId: `paste-${Date.now()}`,
    importOpId,
    totalReviewed: reviewPacket.totalReviewed,
    reviewPacketText: reviewPacketText || undefined,
    suspiciousLines: suspiciousPayload,
    requiredItemIds: sentItemIds,
    forcedItemIds,
  };

  // تسجيل بداية مراجعة الوكيل (telemetry)
  pipelineTelemetry.recordAgentReviewStart(importOpId, {
    itemsSent: suspiciousPayload.length,
    forcedItems: forcedItemIds.length,
  });

  const fallbackToLocalClassification = (
    reason: string,
    details?: Record<string, unknown>
  ): ClassifiedDraftWithId[] => {
    emitAgentReviewSummary({
      status: "fail-open-local",
      requestId: "",
      commandsReceived: 0,
      commandsApplied: 0,
    });
    logAgentError(importOpId, reason);
    pipelineTelemetry.recordAgentReviewError(importOpId, reason);
    agentReviewLogger.warn("agent-review-fail-open", {
      importOpId,
      reason,
      failOpenEnabled: AGENT_REVIEW_FAIL_OPEN,
      ...details,
    });
    pipelineTelemetry.recordIngestionComplete(importOpId, {
      source: "paste",
      trustLevel: "raw_text",
      itemsProcessed: classified.length,
      commandsApplied: 0,
      latencyMs: 0,
      agentReviewInitiated: true,
    });
    return classified;
  };

  let response: AgentReviewResponsePayload;
  try {
    response = await requestAgentReview(requestPayload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent review request failed.";
    emitAgentReviewSummary({
      status: "request-failed",
      requestId: "",
      commandsReceived: 0,
      commandsApplied: 0,
    });
    if (AGENT_REVIEW_FAIL_OPEN) {
      return fallbackToLocalClassification(message, {
        stage: "request-failed",
      });
    }
    throw error;
  }
  const fallbackMeta = buildAgentReviewMetaFallback(
    requestPayload,
    response.commands,
    classified
  );
  const responseMeta = response.meta ?? fallbackMeta;
  const missingRequiredItemIds = responseMeta.missingItemIds ?? [];
  const unresolvedForcedItemIdsFromMeta =
    responseMeta.unresolvedForcedItemIds ?? [];

  // تسجيل اكتمال مراجعة الوكيل (telemetry)
  pipelineTelemetry.recordAgentReviewComplete(importOpId, {
    status: response.status,
    commandsReceived: response.commands.length,
    latencyMs: response.latencyMs,
  });

  if (response.status === "error") {
    emitAgentReviewSummary({
      status: response.status,
      requestId: response.requestId,
      commandsReceived: response.commands.length,
      commandsApplied: 0,
    });
    const requestIdSuffix = response.requestId
      ? ` | requestId=${response.requestId}`
      : "";
    const reason = response.message
      ? `فشل مراجعة الوكيل: ${response.message}${requestIdSuffix}`
      : `فشل مراجعة الوكيل: status=${response.status}`;
    if (AGENT_REVIEW_FAIL_OPEN) {
      return fallbackToLocalClassification(reason, {
        stage: "response-error",
        status: response.status,
      });
    }
    throw new Error(reason);
  }
  if (response.status === "partial") {
    emitAgentReviewSummary({
      status: response.status,
      requestId: response.requestId,
      commandsReceived: response.commands.length,
      commandsApplied: 0,
    });
    const reason = response.message
      ? `مراجعة الوكيل غير مكتملة: ${response.message}`
      : `مراجعة الوكيل غير مكتملة (${response.commands.length} أمر من أصل ${sentItemIds.length} عنصر)`;
    if (AGENT_REVIEW_FAIL_OPEN) {
      return fallbackToLocalClassification(reason, {
        stage: "response-partial",
        status: response.status,
      });
    }
    throw new Error(reason);
  }
  if (response.status === "skipped" && sentItemIds.length > 0) {
    emitAgentReviewSummary({
      status: response.status,
      requestId: response.requestId,
      commandsReceived: response.commands.length,
      commandsApplied: 0,
    });
    const reason = response.message
      ? `الوكيل لم يراجع العناصر المطلوبة: ${response.message}`
      : "الوكيل لم يُرجع أوامر رغم إرسال عناصر للمراجعة";
    if (AGENT_REVIEW_FAIL_OPEN) {
      return fallbackToLocalClassification(reason, {
        stage: "response-skipped",
        status: response.status,
      });
    }
    throw new Error(reason);
  }

  // ─── تسجيل استجابة الوكيل (telemetry) ───
  logAgentResponse({
    requestId: response.requestId,
    importOpId,
    latencyMs: response.latencyMs,
    status: response.status,
    commandsReceived: response.commands.length,
  });

  // ─── فحص stale / idempotency عبر command-engine ───
  const discardReason = checkResponseValidity(response, opState);
  if (discardReason === "stale_discarded") {
    emitAgentReviewSummary({
      status: discardReason,
      requestId: response.requestId,
      commandsReceived: response.commands.length,
      commandsApplied: 0,
    });
    pipelineTelemetry.recordStaleDiscard(importOpId);
    agentReviewLogger.warn("response-stale-discarded", { importOpId });
    if (AGENT_REVIEW_FAIL_OPEN) {
      return fallbackToLocalClassification(
        "Agent review failed strict mode: stale response discarded.",
        {
          stage: "stale-discarded",
        }
      );
    }
    throw new Error(
      "Agent review failed strict mode: stale response discarded."
    );
  }
  if (discardReason === "idempotent_discarded") {
    emitAgentReviewSummary({
      status: discardReason,
      requestId: response.requestId,
      commandsReceived: response.commands.length,
      commandsApplied: 0,
    });
    pipelineTelemetry.recordIdempotentDiscard(importOpId, response.requestId);
    agentReviewLogger.info("response-idempotent-discarded", { importOpId });
    if (AGENT_REVIEW_FAIL_OPEN) {
      return fallbackToLocalClassification(
        "Agent review failed strict mode: idempotent response discarded.",
        {
          stage: "idempotent-discarded",
        }
      );
    }
    throw new Error(
      "Agent review failed strict mode: idempotent response discarded."
    );
  }

  // ─── تطبيع الأوامر وحل التضاربات عبر command-engine ───
  const { resolved: resolvedCommands, conflictCount } =
    normalizeAndDedupeCommands(response.commands);
  if (conflictCount > 0) {
    agentReviewLogger.warn("commands-conflict-resolved", {
      importOpId,
      conflictCount,
      originalCount: response.commands.length,
      resolvedCount: resolvedCommands.length,
    });
  }

  // ─── التحقق من البصمة وتطبيق الأوامر ───
  const corrected: ClassifiedDraftWithId[] = [...classified];
  const appliedCommandItemIds: string[] = [];
  const effectiveAppliedItemIds: string[] = [];
  const unchangedCommandItemIds: string[] = [];
  let skippedFingerprintCount = 0;

  for (const command of resolvedCommands) {
    appliedCommandItemIds.push(command.itemId);

    const idx = corrected.findIndex((item) => item._itemId === command.itemId);
    if (idx < 0) {
      unchangedCommandItemIds.push(command.itemId);
      continue;
    }

    // ─── فحص البصمة عبر pipeline/fingerprint ───
    const snapshot = opState.snapshots.get(command.itemId);
    if (snapshot) {
      const currentFp = computeFingerprintSync(
        elementTypeToLineType(corrected[idx].type),
        corrected[idx].text
      );
      if (currentFp !== snapshot.fingerprint) {
        agentReviewLogger.warn("command-fingerprint-mismatch", {
          itemId: command.itemId,
          expected: snapshot.fingerprint,
          actual: currentFp,
        });
        unchangedCommandItemIds.push(command.itemId);
        skippedFingerprintCount += 1;
        continue;
      }
    }

    if (command.op === "relabel") {
      const mapped = lineTypeToElementType(command.newType);
      if (!mapped || !isElementType(mapped)) {
        unchangedCommandItemIds.push(command.itemId);
        continue;
      }

      const original = corrected[idx];
      if (!original || original.type === mapped) {
        unchangedCommandItemIds.push(command.itemId);
        continue;
      }

      if (mapped === "scene_header_top_line") {
        // الـ pipeline ما بيُنتجش top_line — نحوّله لـ scene_header_1
        corrected[idx] = {
          ...original,
          type: "scene_header_1",
          header1: undefined,
          header2: undefined,
          confidence: Math.max(
            original.confidence,
            Math.round(command.confidence * 100),
            85
          ),
          classificationMethod: "context",
        };
        effectiveAppliedItemIds.push(command.itemId);
        continue;
      }

      corrected[idx] = {
        ...original,
        type: mapped,
        header1: undefined,
        header2: undefined,
        confidence: Math.max(
          original.confidence,
          Math.round(command.confidence * 100),
          85
        ),
        classificationMethod: "context",
      };
      effectiveAppliedItemIds.push(command.itemId);
    } else if (command.op === "split") {
      const original = corrected[idx];
      if (!original) {
        unchangedCommandItemIds.push(command.itemId);
        continue;
      }

      const leftText = original.text.slice(0, command.splitAt);
      const rightText = original.text.slice(command.splitAt);
      const leftType = lineTypeToElementType(command.leftType);
      const rightType = lineTypeToElementType(command.rightType);

      if (
        !leftType ||
        !rightType ||
        !isElementType(leftType) ||
        !isElementType(rightType)
      ) {
        unchangedCommandItemIds.push(command.itemId);
        continue;
      }

      const newRightId = generateItemId();
      const leftConfidence = Math.round(command.confidence * 100);
      const rightConfidence = Math.round(command.confidence * 100);

      corrected.splice(
        idx,
        1,
        {
          ...original,
          type: leftType,
          text: leftText.trim(),
          confidence: Math.max(original.confidence, leftConfidence, 82),
          classificationMethod: "context",
        },
        {
          ...original,
          type: rightType,
          text: rightText.trim(),
          confidence: Math.max(original.confidence, rightConfidence, 82),
          classificationMethod: "context",
          _itemId: newRightId,
        } as ClassifiedDraftWithId
      );
      effectiveAppliedItemIds.push(command.itemId);
    }
  }

  // ─── تسجيل requestId لمنع التكرار ───
  opState.appliedRequestIds.add(response.requestId);

  const uniqueAppliedCommandItemIds = toNormalizedMetaIds(
    appliedCommandItemIds
  );
  const uniqueEffectiveAppliedItemIds = toNormalizedMetaIds(
    effectiveAppliedItemIds
  );
  const uniqueUnchangedCommandItemIds = toNormalizedMetaIds(
    unchangedCommandItemIds
  );

  // A forced item is "resolved" if:
  // 1. The agent returned a command that was effectively applied (changed the type), OR
  // 2. The agent returned no command (confirming current type is correct), OR
  // 3. The agent returned a same-type relabel (explicit confirmation)
  // Only flag as unresolved if the item wasn't even in the classified list.
  const unresolvedForcedItemIdsFromEffect = forcedItemIds.filter((itemId) => {
    // Check if the item exists at all in the classified data
    const exists = corrected.some((item) => item._itemId === itemId);
    return !exists;
  });
  const unresolvedForcedItemIds = toNormalizedMetaIds([
    ...unresolvedForcedItemIdsFromMeta,
    ...unresolvedForcedItemIdsFromEffect,
  ]);

  if (unresolvedForcedItemIds.length > 0) {
    emitAgentReviewSummary({
      status: "unresolved-forced",
      requestId: response.requestId,
      commandsReceived: response.commands.length,
      commandsApplied: uniqueEffectiveAppliedItemIds.length,
    });
    agentReviewLogger.error("response-unresolved-forced-lines", {
      status: response.status,
      message: response.message,
      forcedItemIds,
      unresolvedForcedItemIdsFromMeta,
      unresolvedForcedItemIdsFromEffect,
      unresolvedForcedItemIds,
      appliedCommandItemIds: uniqueAppliedCommandItemIds,
      effectiveAppliedItemIds: uniqueEffectiveAppliedItemIds,
      unchangedCommandItemIds: uniqueUnchangedCommandItemIds,
      missingRequiredItemIds,
    });
    if (AGENT_REVIEW_FAIL_OPEN) {
      return fallbackToLocalClassification(
        `الوكيل لم يحسم ${unresolvedForcedItemIds.length} عنصر إلزامي | status=${response.status} | message=${response.message}`,
        {
          stage: "unresolved-forced",
          unresolvedForcedCount: unresolvedForcedItemIds.length,
        }
      );
    }
    throw new Error(
      `الوكيل لم يحسم ${unresolvedForcedItemIds.length} عنصر إلزامي | status=${response.status} | message=${response.message}`
    );
  }

  // ─── تسجيل تطبيق الأوامر (telemetry) ───
  logCommandApply({
    importOpId,
    requestId: response.requestId,
    commandsNormalized: resolvedCommands.length,
    commandsApplied: effectiveAppliedItemIds.length,
    commandsSkipped: unchangedCommandItemIds.length,
    skippedFingerprintMismatchCount: skippedFingerprintCount,
    skippedMissingItemCount: 0,
    skippedInvalidCommandCount: 0,
    skippedConflictCount: conflictCount,
    staleDiscard: false,
    idempotentDiscard: false,
  });

  agentReviewLogger.telemetry("response-applied", {
    status: response.status,
    commands: response.commands.length,
    resolvedCommands: resolvedCommands.length,
    conflictCount,
    apiVersion: response.apiVersion,
    mode: response.mode,
    sentItemIds,
    forcedItemIds,
    appliedCommandItemIds: uniqueAppliedCommandItemIds,
    effectiveAppliedItemIds: uniqueEffectiveAppliedItemIds,
    unchangedCommandItemIds: uniqueUnchangedCommandItemIds,
    missingRequiredItemIds,
    unresolvedForcedItemIds,
    skippedFingerprintCount,
  });
  emitAgentReviewSummary({
    status: response.status,
    requestId: response.requestId,
    commandsReceived: response.commands.length,
    commandsApplied: uniqueEffectiveAppliedItemIds.length,
  });

  // تسجيل اكتمال عملية الاستيعاب (telemetry)
  pipelineTelemetry.recordIngestionComplete(importOpId, {
    source: "paste",
    trustLevel: "raw_text",
    itemsProcessed: classified.length,
    commandsApplied: effectiveAppliedItemIds.length,
    latencyMs: response.latencyMs,
    agentReviewInitiated: true,
  });

  return corrected;
};

/**
 * تطبيق دالة المراجعة المحلية (إذا وُفّرت).
 * تُستخدم في سياق الخيارات المخصصة للتطبيق.
 */
const applyAgentReview = (
  classified: ClassifiedDraftWithId[],
  agentReview?: (
    classified: readonly ClassifiedDraftWithId[]
  ) => ClassifiedDraftWithId[]
): ClassifiedDraftWithId[] => {
  if (!agentReview) return classified;

  try {
    const reviewed = agentReview(classified);
    return reviewed.length > 0 ? reviewed : classified;
  } catch (error) {
    agentReviewLogger.error("local-agent-review-failed", { error });
    return classified;
  }
};

/**
 * إنشاء عقدة ProseMirror من عنصر مصنّف.
 */
const createNodeForType = (
  item: ClassifiedDraftWithId,
  schema: Schema
): PmNode | null => {
  const { type, text, header1, header2 } = item;

  switch (type) {
    case "scene_header_top_line": {
      const h1Node = schema.nodes["scene_header_1"].create(
        null,
        header1 ? schema.text(header1) : undefined
      );
      const h2Node = schema.nodes["scene_header_2"].create(
        null,
        header2 ? schema.text(header2) : undefined
      );
      return schema.nodes["scene_header_top_line"].create(null, [
        h1Node,
        h2Node,
      ]);
    }

    case "scene_header_1":
      return schema.nodes["scene_header_1"].create(
        null,
        text ? schema.text(text) : undefined
      );

    case "scene_header_2":
      return schema.nodes["scene_header_2"].create(
        null,
        text ? schema.text(text) : undefined
      );

    case "basmala":
      return schema.nodes.basmala.create(
        null,
        text ? schema.text(text) : undefined
      );

    case "scene_header_3":
      return schema.nodes["scene_header_3"].create(
        null,
        text ? schema.text(text) : undefined
      );

    case "action":
      return schema.nodes.action.create(
        null,
        text ? schema.text(text) : undefined
      );

    case "character":
      return schema.nodes.character.create(
        null,
        text ? schema.text(ensureCharacterTrailingColon(text)) : undefined
      );

    case "dialogue":
      return schema.nodes.dialogue.create(
        null,
        text ? schema.text(text) : undefined
      );

    case "parenthetical":
      return schema.nodes.parenthetical.create(
        null,
        text ? schema.text(text) : undefined
      );

    case "transition":
      return schema.nodes.transition.create(
        null,
        text ? schema.text(text) : undefined
      );

    default:
      return schema.nodes.action.create(
        null,
        text ? schema.text(text) : undefined
      );
  }
};

/**
 * تحويل عناصر مصنّفة إلى عقد ProseMirror.
 */
const classifiedToNodes = (
  classified: readonly ClassifiedDraftWithId[],
  schema: Schema
): PmNode[] => {
  const nodes: PmNode[] = [];

  for (let i = 0; i < classified.length; i++) {
    const item = classified[i];
    const next = classified[i + 1];

    // look-ahead: scene_header_1 + scene_header_2 → scene_header_top_line display node
    if (item.type === "scene_header_1" && next?.type === "scene_header_2") {
      const h1Node = schema.nodes["scene_header_1"].create(
        null,
        item.text ? schema.text(item.text) : undefined
      );
      const h2Node = schema.nodes["scene_header_2"].create(
        null,
        next.text ? schema.text(next.text) : undefined
      );
      nodes.push(
        schema.nodes["scene_header_top_line"].create(null, [h1Node, h2Node])
      );
      i++; // skip next (header_2 consumed)
      continue;
    }

    // scene_header_1 alone → wrap in top_line with empty header_2
    if (item.type === "scene_header_1") {
      const h1Node = schema.nodes["scene_header_1"].create(
        null,
        item.text ? schema.text(item.text) : undefined
      );
      const h2Node = schema.nodes["scene_header_2"].create();
      nodes.push(
        schema.nodes["scene_header_top_line"].create(null, [h1Node, h2Node])
      );
      continue;
    }

    // scene_header_2 alone (orphan) → wrap in top_line with empty header_1
    if (item.type === "scene_header_2") {
      const h1Node = schema.nodes["scene_header_1"].create();
      const h2Node = schema.nodes["scene_header_2"].create(
        null,
        item.text ? schema.text(item.text) : undefined
      );
      nodes.push(
        schema.nodes["scene_header_top_line"].create(null, [h1Node, h2Node])
      );
      continue;
    }

    const node = createNodeForType(item, schema);
    if (node) nodes.push(node);
  }

  return nodes;
};

/**
 * تصنيف النص محلياً فقط (بدون مراجعة الوكيل).
 */
export const classifyText = (
  text: string,
  agentReview?: (
    classified: readonly ClassifiedDraftWithId[]
  ) => ClassifiedDraftWithId[],
  options?: ClassifyLinesContext
): ClassifiedDraftWithId[] => {
  const initiallyClassified = classifyLines(text, options);
  return applyAgentReview(initiallyClassified, agentReview);
};

/**
 * تصنيف النص ثم مراجعة الوكيل عن بُعد.
 * هذا المسار صارم: لا fallback محلي — إذا فشل الباك اند يُرفض التصنيف.
 */
export const classifyTextWithAgentReview = async (
  text: string,
  agentReview?: (
    classified: readonly ClassifiedDraftWithId[]
  ) => ClassifiedDraftWithId[]
): Promise<ClassifiedDraftWithId[]> => {
  const initiallyClassified = classifyLines(text);
  const remotelyReviewed = await applyRemoteAgentReviewV2(initiallyClassified);
  return applyAgentReview(remotelyReviewed, agentReview);
};

/**
 * تطبيق تصنيف اللصق على العرض بنمط Render-First.
 *
 * 1) تصنيف محلي → عرض فوري
 * 2) Gemini Flash — تعزيز السياق (streaming)
 * 3) Kimi 2.5 — حل الشبهة (streaming)
 * 4) Claude Agent Review — مراجعة نهائية
 *
 * المستخدم يشوف المحتوى فوراً (الخطوة 1)،
 * ثم التحسينات بتتطبق تدريجياً في الـ background.
 */
export const applyPasteClassifierFlowToView = async (
  view: EditorView,
  text: string,
  options?: ApplyPasteClassifierFlowOptions
): Promise<boolean> => {
  const customReview = options?.agentReview;
  const classificationProfile = options?.classificationProfile;
  const sourceFileType = options?.sourceFileType;
  const sourceMethod = options?.sourceMethod;
  const structuredHints = options?.structuredHints;
  let schemaElements = options?.schemaElements;

  // ── Phase -1: جلب schema elements من المحرك عند اللصق ──
  if (
    !schemaElements &&
    classificationProfile === "paste" &&
    TEXT_EXTRACT_ENDPOINT
  ) {
    const engineController = new AbortController();
    try {
      const response = await fetchWithTimeout(
        TEXT_EXTRACT_ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
        engineController,
        10_000
      );
      if (response.ok) {
        const body = (await response.json()) as {
          success?: boolean;
          data?: { schemaElements?: readonly SchemaElementInput[] };
        };
        if (
          body?.success &&
          Array.isArray(body.data?.schemaElements) &&
          body.data.schemaElements.length > 0
        ) {
          schemaElements = body.data.schemaElements;
          agentReviewLogger.telemetry("paste-pipeline-stage", {
            stage: "engine-text-extract-success",
            elementCount: schemaElements.length,
          });
        }
      }
    } catch (engineError) {
      agentReviewLogger.warn("engine-text-extract-failed", {
        error:
          engineError instanceof Error
            ? engineError.message
            : String(engineError),
      });
      // fallback: يكمل بالتصنيف المحلي العادي
    }
  }

  // ── Phase 0: التصنيف المحلي ──
  const initiallyClassified = classifyLines(text, {
    classificationProfile,
    sourceFileType,
    sourceMethod,
    structuredHints,
    schemaElements,
  });
  const locallyReviewed = applyAgentReview(initiallyClassified, customReview);

  if (locallyReviewed.length === 0 || view.isDestroyed) return false;

  agentReviewLogger.telemetry("paste-pipeline-stage", {
    stage: "frontend-classify-complete",
    totalLines: locallyReviewed.length,
    sourceFileType,
    sourceMethod,
  });

  // ── Phase 0.5: عرض فوري (Render-First) ──
  const nodes = classifiedToNodes(locallyReviewed, view.state.schema);
  if (nodes.length === 0) return false;

  const fragment = Fragment.from(nodes);
  const slice = new Slice(fragment, 0, 0);
  const from = options?.from ?? view.state.selection.from;
  const to = options?.to ?? view.state.selection.to;
  const tr = view.state.tr;
  tr.replaceRange(from, to, slice);
  view.dispatch(tr);

  agentReviewLogger.telemetry("paste-pipeline-stage", {
    stage: "frontend-render-first",
    nodesApplied: nodes.length,
  });

  // ── Recorder: snapshot بعد العرض الفوري ──
  pipelineRecorder.snapshot("render-first", locallyReviewed, {
    nodesRendered: nodes.length,
  });

  // ── رسالة مؤقتة على الشاشة (TODO: شيلها بعد التجربة) ──
  if (typeof window !== "undefined") {
    const enabledFlags = Object.entries(PIPELINE_FLAGS)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const flagsText =
      enabledFlags.length > 0 ? enabledFlags.join(", ") : "الكل OFF (baseline)";
    const banner = document.createElement("div");
    banner.textContent = `✅ Pipeline تم — ${nodes.length} سطر | الطبقات: ${flagsText}`;
    Object.assign(banner.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1a1a2e",
      color: "#00ff88",
      padding: "10px 24px",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
      zIndex: "99999",
      border: "1px solid #00ff8844",
      direction: "rtl",
      fontFamily: "monospace",
    });
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 5000);
  }

  // ── Phase 1–4: AI layers + Claude في الـ background ──
  // لا ننتظرها — بتشتغل async وبتحدّث المحرر تدريجياً
  void runAIEnhancementPipeline(view, locallyReviewed).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    agentReviewLogger.error("ai-enhancement-pipeline-error", {
      error: message,
    });
  });

  return true;
};

/**
 * AI Enhancement Pipeline — يشتغل في الـ background بعد العرض الفوري.
 *
 * 1) Gemini Flash — تعزيز السياق
 * 2) Kimi 2.5 — حل الشبهة
 * 3) Claude Agent Review — مراجعة نهائية
 *
 * كل طبقة بتطبق تصحيحاتها تدريجياً عبر ProgressiveUpdateSession.
 */
const runAIEnhancementPipeline = async (
  view: EditorView,
  locallyReviewed: ClassifiedDraftWithId[]
): Promise<void> => {
  if (view.isDestroyed) return;

  const sessionId = `ai-enhance-${Date.now()}`;
  const abortController = new AbortController();

  // إنشاء جلسة تحديث تدريجي
  const updateSession = progressiveUpdater.createSession(sessionId, {
    minConfidenceThreshold: 0.65,
    allowLayerOverride: true,
    layerPriority: ["claude-review", "gemini-doubt", "gemini-context"],
  });

  // تحويل التصنيفات لصيغة ClassifiedLine للطبقات
  const classifiedLineRecords = toClassifiedLineRecords(locallyReviewed);

  try {
    // ── Phase 1: Gemini Flash — تعزيز السياق (streaming) ──
    if (PIPELINE_FLAGS.GEMINI_CONTEXT_ENABLED) {
      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "gemini-context-start",
        totalLines: classifiedLineRecords.length,
      });

      const contextResult = await requestContextEnhancement({
        sessionId,
        classifiedLines: classifiedLineRecords,
        updateSession,
        view,
        signal: abortController.signal,
      });

      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "gemini-context-complete",
        totalCorrections: contextResult.totalCorrections,
        appliedCorrections: contextResult.appliedCorrections,
        latencyMs: contextResult.latencyMs,
        success: contextResult.success,
      });

      // ── Recorder: snapshot بعد Gemini context ──
      pipelineRecorder.snapshot("gemini-context", locallyReviewed, {
        totalCorrections: contextResult.totalCorrections,
        appliedCorrections: contextResult.appliedCorrections,
        latencyMs: contextResult.latencyMs,
      });
    } else {
      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "gemini-context-skipped",
        reason: "GEMINI_CONTEXT_ENABLED=false",
      });
    }

    if (view.isDestroyed) return;

    // ── Phase 2: Gemini Flash — حل الشبهة (streaming) ──
    if (PIPELINE_FLAGS.GEMINI_DOUBT_ENABLED) {
      // بنحتاج نبني حزمة الشبهة من الكواشف الحالية
      const storedSeqOpt = (
        locallyReviewed as ClassifiedDraftWithId[] & {
          _sequenceOptimization?: SequenceOptimizationResult;
        }
      )._sequenceOptimization;

      const reviewer = new PostClassificationReviewer(
        storedSeqOpt?.disagreements?.length
          ? { viterbiDisagreements: storedSeqOpt.disagreements }
          : undefined
      );

      const reviewInput = toClassifiedLineRecords(locallyReviewed);
      const reviewPacket = reviewer.review(reviewInput);

      if (reviewPacket.suspiciousLines.length > 0) {
        agentReviewLogger.telemetry("paste-pipeline-stage", {
          stage: "gemini-doubt-start",
          suspiciousCount: reviewPacket.suspiciousLines.length,
        });

        const doubtResult = await requestDoubtResolution({
          sessionId,
          suspiciousLines: reviewPacket.suspiciousLines,
          updateSession,
          view,
          signal: abortController.signal,
        });

        agentReviewLogger.telemetry("paste-pipeline-stage", {
          stage: "gemini-doubt-complete",
          totalVerdicts: doubtResult.totalVerdicts,
          appliedCorrections: doubtResult.appliedCorrections,
          confirmedCount: doubtResult.confirmedCount,
          relabeledCount: doubtResult.relabeledCount,
          latencyMs: doubtResult.latencyMs,
          success: doubtResult.success,
        });
        // ── Recorder: snapshot بعد Gemini doubt ──
        pipelineRecorder.snapshot("gemini-doubt", locallyReviewed, {
          totalVerdicts: doubtResult.totalVerdicts,
          appliedCorrections: doubtResult.appliedCorrections,
          latencyMs: doubtResult.latencyMs,
        });
      } else {
        agentReviewLogger.telemetry("paste-pipeline-stage", {
          stage: "gemini-doubt-skipped",
          reason: "no-suspicious-lines",
        });
      }
    } else {
      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "gemini-doubt-skipped",
        reason: "GEMINI_DOUBT_ENABLED=false",
      });
    }

    if (view.isDestroyed) return;

    // ── Phase 3: Claude Agent Review — مراجعة نهائية ──
    if (PIPELINE_FLAGS.CLAUDE_REVIEW_ENABLED) {
      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "claude-review-start",
      });

      const backendReviewed = await applyRemoteAgentReviewV2(locallyReviewed);

      if (backendReviewed.length > 0 && !view.isDestroyed) {
        // تطبيق تصحيحات Claude كـ progressive updates
        let claudeApplied = 0;
        for (let i = 0; i < backendReviewed.length; i += 1) {
          const original = locallyReviewed[i];
          const corrected = backendReviewed[i];
          if (!original || !corrected) continue;
          if (original.type === corrected.type) continue;

          const applied = updateSession.applyCorrection(view, {
            lineIndex: i,
            correctedType: corrected.type,
            confidence: corrected.confidence / 100,
            reason: "Claude agent review",
            source: "claude-review",
          });
          if (applied) claudeApplied += 1;
        }

        agentReviewLogger.telemetry("paste-pipeline-stage", {
          stage: "claude-review-complete",
          totalLines: backendReviewed.length,
          claudeApplied,
        });
      }
      // ── Recorder: snapshot بعد Claude review ──
      pipelineRecorder.snapshot("claude-review", locallyReviewed);
    } else {
      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "claude-review-skipped",
        reason: "CLAUDE_REVIEW_ENABLED=false",
      });
    }

    // إنهاء الجلسة بنجاح
    updateSession.complete();

    const stats = updateSession.getStats();
    agentReviewLogger.telemetry("paste-pipeline-stage", {
      stage: "ai-enhancement-pipeline-complete",
      totalReceived: stats.totalReceived,
      totalApplied: stats.totalApplied,
      totalSkipped: stats.totalSkipped,
      totalConflicted: stats.totalConflicted,
    });

    // ── Recorder: إنهاء الـ run ──
    pipelineRecorder.finishRun();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    agentReviewLogger.error("ai-enhancement-pipeline-failed", {
      sessionId,
      error: message,
    });

    // fail-open: التصنيف المحلي موجود أصلاً في المحرر
    // الـ AI layers فشلت بس المستخدم مش هيتأثر
    updateSession.complete();
  }
};

/**
 * مصنّف اللصق التلقائي داخل Tiptap.
 */
export const PasteClassifier = Extension.create<PasteClassifierOptions>({
  name: "pasteClassifier",

  addOptions() {
    return {
      agentReview: undefined,
    };
  },

  addProseMirrorPlugins() {
    const agentReview = this.options.agentReview;

    return [
      new Plugin({
        key: new PluginKey("pasteClassifier"),

        props: {
          handlePaste(view, event) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            const text = clipboardData.getData("text/plain");
            if (!text || !text.trim()) return false;

            event.preventDefault();
            void applyPasteClassifierFlowToView(view, text, {
              agentReview,
              classificationProfile: "paste",
            }).catch((error) => {
              const message =
                error instanceof Error ? error.message : String(error);
              agentReviewLogger.error("paste-failed-fatal", {
                error,
                message,
              });

              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent(PASTE_CLASSIFIER_ERROR_EVENT, {
                    detail: { message },
                  })
                );
              }
            });
            return true;
          },
        },
      }),
    ];
  },
});
