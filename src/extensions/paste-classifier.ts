import { Extension } from "@tiptap/core";
import { Fragment, Node as PmNode, Schema, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isActionLine } from "./action";
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
import type {
  ClassifiedDraft,
  ClassificationContext,
  ElementType,
} from "./classification-types";
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
import { stripLeadingBullets } from "./text-utils";
import { progressiveUpdater } from "./ai-progressive-updater";
import { pipelineRecorder } from "./pipeline-recorder";
import {
  agentReviewLogger,
  sanitizeOcrArtifactsForClassification,
  TEXT_EXTRACT_ENDPOINT,
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
  type ClassifiedDraftWithId,
} from "./paste-classifier-helpers";
import { traceCollector } from "@/suspicion-engine/trace/trace-collector";
import type { PassStage } from "@/suspicion-engine/types";
import { createDefaultSuspicionEngine } from "@/suspicion-engine/engine";
import {
  collectTracesFromMap,
  applyPreRenderActions,
} from "@/suspicion-engine/adapters/from-classifier";
import type { SuspicionCase } from "@/suspicion-engine/types";
import type { ReviewRoutingStats as FinalReviewRoutingStats } from "@/types/final-review";
import type {
  FinalReviewRequestPayload,
  FinalReviewResponsePayload,
  FinalReviewSuspiciousLinePayload,
} from "@/types/final-review";
import {
  FINAL_REVIEW_ENDPOINT,
  FINAL_REVIEW_MAX_RATIO,
  FINAL_REVIEW_PROMOTION_THRESHOLD,
  DEFAULT_FINAL_REVIEW_SCHEMA_HINTS,
} from "./paste-classifier-config";
import {
  buildFinalReviewSuspiciousLinePayload,
  formatFinalReviewPacketText,
} from "@/final-review/payload-builder";

// â”€â”€ Re-entry guard + text dedup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let pipelineRunning = false;
let lastProcessedHash = "";
let lastProcessedAt = 0;
const DEDUP_WINDOW_MS = 2_000;

const simpleHash = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
};

/** Record current classified state as PassVotes for the given stage */
const recordStageVotes = (
  classified: readonly ClassifiedDraft[],
  stage: PassStage
): void => {
  for (let i = 0; i < classified.length; i++) {
    const line = classified[i];
    traceCollector.addVote(i, {
      stage,
      suggestedType: line.type,
      confidence: line.confidence,
      reasonCode: line.classificationMethod,
      metadata: {},
    });
  }
};

type ClassifiedDraftPipelineState = ClassifiedDraftWithId[] & {
  _sequenceOptimization?: SequenceOptimizationResult;
  _suspicionCases?: readonly SuspicionCase[];
};

// â”€â”€â”€ Feature Flags (Ø·Ø¨Ù‚Ø§Øª Ø¬Ø¯ÙŠØ¯Ø© â€” Ù„Ù„ØªØ¬Ø±Ø¨Ø©) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ØºÙŠÙ‘Ø± Ù„Ù€ true Ø¹Ø´Ø§Ù† ØªÙØ¹Ù‘Ù„ ÙƒÙ„ Ø·Ø¨Ù‚Ø©
export const PIPELINE_FLAGS = {
  /** Document Context Graph + DCG bonus ÙÙŠ Ø§Ù„Ù€ hybrid classifier */
  DCG_ENABLED: true,
  /** Self-Reflection Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ù€ forward pass */
  SELF_REFLECTION_ENABLED: true,
  /** Ø£Ù†Ù…Ø§Ø· 6-9 Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© ÙÙŠ Ø§Ù„Ù€ retroactive corrector */
  RETRO_NEW_PATTERNS_ENABLED: true,
  /** Reverse Classification Pass + Ø¯Ù…Ø¬ */
  REVERSE_PASS_ENABLED: true,
  /** Viterbi Override (ØªØ·Ø¨ÙŠÙ‚ Ø§Ù‚ØªØ±Ø§Ø­Ø§Øª Viterbi Ø§Ù„Ù‚ÙˆÙŠØ©) */
  VITERBI_OVERRIDE_ENABLED: true,
  /** Final review layer after suspicion routing */
  FINAL_REVIEW_ENABLED: true,
};

/**
 * Ø®ÙŠØ§Ø±Ø§Øª Ù…ØµÙ†Ù‘Ù Ø§Ù„Ù„ØµÙ‚ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ.
 */
export interface PasteClassifierOptions {
  /** Ø¯Ø§Ù„Ø© Ù…Ø±Ø§Ø¬Ø¹Ø© Ù…Ø­Ù„ÙŠØ© Ù…Ø®ØµØµØ© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ) */
  agentReview?: (
    classified: readonly ClassifiedDraftWithId[]
  ) => ClassifiedDraftWithId[];
}

/**
 * Ø®ÙŠØ§Ø±Ø§Øª ØªØ·Ø¨ÙŠÙ‚ ØªØ¯ÙÙ‚ Ø§Ù„ØªØµÙ†ÙŠÙ Ø¹Ù„Ù‰ Ø§Ù„Ø¹Ø±Ø¶.
 */
export interface ApplyPasteClassifierFlowOptions {
  /** Ø¯Ø§Ù„Ø© Ù…Ø±Ø§Ø¬Ø¹Ø© Ù…Ø­Ù„ÙŠØ© Ù…Ø®ØµØµØ© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ) */
  agentReview?: (
    classified: readonly ClassifiedDraftWithId[]
  ) => ClassifiedDraftWithId[];
  /** Ù…ÙˆØ¶Ø¹ Ø§Ù„Ø¨Ø¯Ø¡ ÙÙŠ Ø§Ù„Ø¹Ø±Ø¶ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ) */
  from?: number;
  /** Ù…ÙˆØ¶Ø¹ Ø§Ù„Ù†Ù‡Ø§ÙŠØ© ÙÙŠ Ø§Ù„Ø¹Ø±Ø¶ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ) */
  to?: number;
  /** Ø¨Ø±ÙˆÙØ§ÙŠÙ„ Ù…ØµØ¯Ø± Ø§Ù„ØªØµÙ†ÙŠÙ (paste | generic-open) */
  classificationProfile?: string; // ClassificationSourceProfile in classification-types
  /** Ù†ÙˆØ¹ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ù…ØµØ¯Ø± (Ø§Ø®ØªÙŠØ§Ø±ÙŠ) */
  sourceFileType?: string;
  /** Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø§Ø³ØªØ®Ø±Ø§Ø¬ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ) */
  sourceMethod?: string;
  /** ØªÙ„Ù…ÙŠØ­Ø§Øª Ø¨Ù†ÙŠÙˆÙŠØ© Ù…Ù† Ø§Ù„Ù…ØµØ¯Ø± (FilmlaneØŒ PDFØŒ Ø¥Ù„Ø®) */
  structuredHints?: readonly unknown[]; // ScreenplayBlock[]
  /** Ø¹Ù†Ø§ØµØ± schema Ù…Ù† Ø§Ù„Ù…Ø­Ø±Ùƒ Ø§Ù„Ù…Ø¶Ù…Ù‘Ù† (Ø§Ø®ØªÙŠØ§Ø±ÙŠ) */
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
 * Ø¬Ø¯ÙˆÙ„ Ø±Ø¨Ø· Ø£Ø³Ù…Ø§Ø¡ Ø¹Ù†Ø§ØµØ± Ø§Ù„Ù…Ø­Ø±Ùƒ Ø¨Ø£Ù†ÙˆØ§Ø¹ Ø¹Ù†Ø§ØµØ± Ø§Ù„Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ
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
 * Ù…Ø³Ø§Ø± schema-style: ØªØ­ÙˆÙŠÙ„ schemaElements Ù…Ø¨Ø§Ø´Ø±Ø© Ø¥Ù„Ù‰ ClassifiedDraftWithId[]
 * Ø¨Ù€ classificationMethod="external-engine" Ø¯ÙˆÙ† Ø§Ù„Ù…Ø±ÙˆØ± Ø¨Ù€ HybridClassifier
 */
const classifyFromSchemaElements = (
  schemaElements: readonly SchemaElementInput[]
): ClassifiedDraftWithId[] => {
  const drafts: ClassifiedDraftWithId[] = [];

  for (const el of schemaElements) {
    if (!el || typeof el.element !== "string" || typeof el.value !== "string")
      continue;

    const mappedType = ENGINE_ELEMENT_MAP.get(el.element.trim());
    if (!mappedType) continue; // Ø¹Ù†ØµØ± ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ â€” ØªØ¬Ø§Ù‡Ù„

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
 * ØªØµÙ†ÙŠÙ Ø§Ù„Ù†ØµÙˆØµ Ø§Ù„Ù…ÙÙ„ØµÙ‚Ø© Ù…Ø­Ù„ÙŠØ§Ù‹ Ù…Ø¹ ØªÙˆÙ„ÙŠØ¯ Ù…Ø¹Ø±Ù ÙØ±ÙŠØ¯ (_itemId) Ù„ÙƒÙ„ Ø¹Ù†ØµØ±.
 * Ø§Ù„Ù…Ø¹Ø±Ù‘Ù ÙŠÙØ³ØªØ®Ø¯Ù… Ù„Ø§Ø­Ù‚Ø§Ù‹ ÙÙŠ ØªØªØ¨Ø¹ Ø§Ù„Ø£ÙˆØ§Ù…Ø± Ù…Ù† Ø§Ù„ÙˆÙƒÙŠÙ„.
 */
export const classifyLines = (
  text: string,
  context?: ClassifyLinesContext
): ClassifiedDraftWithId[] => {
  // â”€â”€ Ù…Ø³Ø§Ø± schema-style: Ø¥Ø°Ø§ Ø£ØªØª schemaElements Ù…Ù† Ø§Ù„Ù…Ø­Ø±Ùƒ â”€â”€
  if (context?.schemaElements && context.schemaElements.length > 0) {
    const schemaDrafts = classifyFromSchemaElements(context.schemaElements);
    if (schemaDrafts.length > 0) {
      // â”€â”€ ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ø¹Ù„Ø§Ù…Ø§Øª Ø¨Ø¹Ø¯ Ø§Ù„ØªØµÙ†ÙŠÙ â”€â”€
      const cleaned = schemaDrafts
        .map((d) => ({ ...d, text: stripLeadingBullets(d.text) }))
        .filter((d) => d.text.length > 0);

      if (cleaned.length > 0) {
        pipelineRecorder.trackFile("paste-classifier.ts");
        pipelineRecorder.snapshot("schema-style-classify", cleaned, {
          source: "external-engine",
          elementCount: cleaned.length,
        });
        return cleaned;
      }
    }
    // fallback: Ø¥Ø°Ø§ Ù„Ù… ÙŠÙ†ØªØ¬ schema-style Ø£ÙŠ Ù†ØªØ§Ø¦Ø¬ØŒ ØªØ§Ø¨Ø¹ Ø¨Ø§Ù„Ù…Ø³Ø§Ø± Ø§Ù„Ø¹Ø§Ø¯ÙŠ
  }

  // â”€â”€ ØªÙˆØ­ÙŠØ¯ Ø§Ù„Ù†Øµ: Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø­Ø±ÙˆÙ ØºÙŠØ± Ø§Ù„Ù…Ø±Ø¦ÙŠØ© Ø§Ù„ØªÙŠ ÙŠØ¶ÙŠÙÙ‡Ø§ Word clipboard â”€â”€
  const normalizedText = normalizeRawInputText(text);

  // â”€â”€ diagnostic: Ø¨ØµÙ…Ø© Ø§Ù„Ù†Øµ Ø§Ù„Ù…ÙØ¯Ø®Ù„ Ù„Ù„Ù…Ù‚Ø§Ø±Ù†Ø© Ø¨ÙŠÙ† Ø§Ù„Ù…Ø³Ø§Ø±Ø§Øª â”€â”€
  const _diagRawLen = normalizedText.length;
  const _diagRawLines = normalizedText.split(/\r?\n/).length;
  const _diagRawHash = Array.from(normalizedText).reduce(
    (h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0,
    0
  );
  const _diagFirst80 = normalizedText.slice(0, 80).replace(/\n/g, "â†µ");
  const _diagLast80 = normalizedText.slice(-80).replace(/\n/g, "â†µ");

  // â”€â”€ diagnostic: ØªÙØµÙŠÙ„ Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø­Ø±ÙˆÙ Ø§Ù„Ø®Ø§ØµØ© ÙÙŠ Ø§Ù„Ù†Øµ Ø§Ù„Ø£ØµÙ„ÙŠ â”€â”€
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
  // Ø¨Ø°Ø± Ø§Ù„Ù€ registry Ù…Ù† inline patterns (regex-based) Ù‚Ø¨Ù„ Ø§Ù„Ù€ loop
  memoryManager.seedFromInlinePatterns(lines);
  // Ø¨Ø°Ø± Ø§Ù„Ù€ registry Ù…Ù† standalone patterns (Ø§Ø³Ù…: Ø³Ø·Ø± + Ø­ÙˆØ§Ø± Ø³Ø·Ø± ØªØ§Ù„ÙŠ)
  memoryManager.seedFromStandalonePatterns(lines);
  const hybridClassifier = new HybridClassifier();

  // â”€â”€ Ø¨Ù†Ø§Ø¡ Document Context Graph (Ù…Ø³Ø­ Ø£ÙˆÙ„ÙŠ â€” O(n)) â”€â”€
  const dcg: DocumentContextGraph | undefined = PIPELINE_FLAGS.DCG_ENABLED
    ? buildDocumentContextGraph(lines)
    : undefined;

  // Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ù„Ø®ÙŠØ§Ø±Ø§Øª Ù…Ù† Ø§Ù„Ø³ÙŠØ§Ù‚
  const sourceProfile = toSourceProfile(context?.classificationProfile);
  const hintQueues = buildStructuredHintQueues(context?.structuredHints);
  let activeSourceHintType: ElementType | undefined;

  const push = (entry: ClassifiedDraft): void => {
    const withId: ClassifiedDraftWithId = {
      ...entry,
      _itemId: generateItemId(),
      // Ø¥Ø¶Ø§ÙØ© Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ØµØ¯Ø± Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ù…ØªÙˆÙØ±Ø©
      sourceProfile,
      sourceHintType: activeSourceHintType,
    };
    classified.push(withId);
    memoryManager.record(entry);
  };

  // â”€â”€ Recorder: Ø¨Ø¯Ø§ÙŠØ© run Ø¬Ø¯ÙŠØ¯ + snapshot Ø£ÙˆÙ„ÙŠ â”€â”€
  traceCollector.clear();
  pipelineRecorder.startRun(context?.classificationProfile ?? "paste", {
    textLength: normalizedText.length,
    lineCount: lines.length,
  });

  // â”€â”€ Self-Reflection: Ø¹Ø¯Ù‘Ø§Ø¯ Ø£Ø³Ø·Ø± Ø§Ù„Ù€ chunk Ø§Ù„Ø­Ø§Ù„ÙŠ â”€â”€
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

    // Ø£Ø®Ø° snapshot Ù‚Ø¨Ù„ parseImplicit Ø¹Ø´Ø§Ù† Ù†Ù…Ø±Ø± confirmedCharacters
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
        text: trimmed.replace(/^[-â€“â€”]\s*/, ""),
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

    // â”€â”€ Self-Reflection: Ù…Ø±Ø§Ø¬Ø¹Ø© Ø°Ø§ØªÙŠØ© Ø¯ÙˆØ±ÙŠØ© Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ù€ forward pass â”€â”€
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

  // â”€â”€ Self-Reflection: Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù€ chunk Ø§Ù„Ø£Ø®ÙŠØ± Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ â”€â”€
  if (PIPELINE_FLAGS.SELF_REFLECTION_ENABLED && linesInChunk >= 3) {
    reflectOnChunk(
      classified,
      chunkStartIdx,
      classified.length,
      memoryManager,
      dcg
    );
  }

  // â”€â”€ Recorder: snapshot Ø¨Ø¹Ø¯ Ø§Ù„Ù€ forward pass â”€â”€
  pipelineRecorder.trackFile("paste-classifier.ts");
  pipelineRecorder.snapshot("forward-pass", classified);
  recordStageVotes(classified, "forward");

  // â”€â”€ Ù…Ù…Ø± Ø§Ù„ØªØµØ­ÙŠØ­ Ø§Ù„Ø±Ø¬Ø¹ÙŠ (retroactive correction pass) â”€â”€
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

  // â”€â”€ Recorder: snapshot Ø¨Ø¹Ø¯ Ø§Ù„Ù€ retroactive corrector â”€â”€
  pipelineRecorder.trackFile("paste-classifier.ts");
  pipelineRecorder.snapshot("retroactive", classified, {
    corrections: _retroCorrections,
  });
  recordStageVotes(classified, "retroactive");

  // â”€â”€ Ù…Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„Ø¹ÙƒØ³ÙŠ (Reverse Classification Pass) + Ø¯Ù…Ø¬ â”€â”€
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

  // â”€â”€ Recorder: snapshot Ø¨Ø¹Ø¯ Ø§Ù„Ù€ reverse pass â”€â”€
  pipelineRecorder.trackFile("paste-classifier.ts");
  pipelineRecorder.snapshot("reverse-pass", classified);
  recordStageVotes(classified, "reverse");

  // â”€â”€ Ù…Ù…Ø± Viterbi Ù„Ù„ØªØ­Ø³ÙŠÙ† Ø§Ù„ØªØ³Ù„Ø³Ù„ÙŠ (Structural Sequence Optimizer) â”€â”€
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
            `L${d.lineIndex}:${d.forwardType}â†’${d.viterbiType}(${d.disagreementStrength})`
        ),
    });
  }

  // â”€â”€ Viterbi Feedback Loop: ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ø§Ù‚ØªØ±Ø§Ø­Ø§Øª Ø§Ù„Ù‚ÙˆÙŠØ© â”€â”€
  if (PIPELINE_FLAGS.VITERBI_OVERRIDE_ENABLED) {
    const _viterbiOverrides = applyViterbiOverrides(classified, _seqOptResult);
    if (_viterbiOverrides > 0) {
      agentReviewLogger.info("diag:viterbi-overrides", {
        applied: _viterbiOverrides,
        classifiedCount: classified.length,
      });
    }
  }

  // â”€â”€ Recorder: snapshot Ø¨Ø¹Ø¯ Viterbi â”€â”€
  pipelineRecorder.trackFile("paste-classifier.ts");
  pipelineRecorder.snapshot("viterbi", classified, {
    disagreements: _seqOptResult.totalDisagreements,
  });
  recordStageVotes(classified, "viterbi");

  // â”€â”€ Suspicion Engine: ØªØ­Ù„ÙŠÙ„ Ø§Ù„Ø§Ø´ØªØ¨Ø§Ù‡ ÙˆØ§Ù„Ø¥ØµÙ„Ø§Ø­ Ø§Ù„Ù…Ø­Ù„ÙŠ â”€â”€
  const _suspicionTraces = collectTracesFromMap(
    classified,
    traceCollector.getAllVotes()
  );
  const _suspicionEngine = createDefaultSuspicionEngine();
  const _suspicionResult = _suspicionEngine.analyze({
    classifiedLines: classified,
    traces: _suspicionTraces,
    sequenceOptimization:
      _seqOptResult.totalDisagreements > 0
        ? {
            disagreements: _seqOptResult.disagreements.map((d) => ({
              lineIndex: d.lineIndex,
              suggestedType: d.viterbiType,
            })),
          }
        : null,
    extractionQuality: null,
  });
  const _suspicionFixes = applyPreRenderActions(
    classified,
    _suspicionResult.actions
  );
  pipelineRecorder.snapshot("suspicion-engine", classified, {
    cases: _suspicionResult.cases.length,
    fixes: _suspicionFixes,
  });
  agentReviewLogger.telemetry("paste-pipeline-stage", {
    stage: "suspicion-engine-complete",
    cases: _suspicionResult.cases.length,
    fixes: _suspicionFixes,
    actions: _suspicionResult.actions.length,
  });

  // ØªØ®Ø²ÙŠÙ† Ù†ØªÙŠØ¬Ø© Viterbi Ø¹Ù„Ù‰ Ø§Ù„Ù…ØµÙÙˆÙØ© Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù…Ù‡Ø§ ÙÙŠ agent review
  const pipelineState = classified as ClassifiedDraftPipelineState;
  pipelineState._sequenceOptimization = _seqOptResult;
  pipelineState._suspicionCases = _suspicionResult.cases;

  // â”€â”€ diagnostic: Ù…Ù„Ø®Øµ Ù†ØªØ§Ø¦Ø¬ Ø§Ù„ØªØµÙ†ÙŠÙ Ù„Ù„Ù…Ù‚Ø§Ø±Ù†Ø© â”€â”€
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

// â”€â”€â”€ Final Review Layer (T012 + T015 + T023â€“T025 + T027) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * T023 â€” ØªØ±Ù‚ÙŠØ© Ø­Ø§Ù„Ø§Øª agent-candidate â†’ agent-forced Ø¹Ù†Ø¯ alternative-pull â‰¥ 96
 */
const promoteHighSeveritySuspicionCases = (
  cases: readonly SuspicionCase[]
): SuspicionCase[] =>
  cases.map((c) => {
    if (c.band !== "agent-candidate") return c;
    const hasHighPull = c.signals.some(
      (s) =>
        s.signalType === "alternative-pull" &&
        s.score >= FINAL_REVIEW_PROMOTION_THRESHOLD
    );
    if (!hasHighPull) return c;
    return { ...c, band: "agent-forced" } as SuspicionCase;
  });

/**
 * T024 â€” Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø£Ø³Ø·Ø± Ø§Ù„Ù…Ø±Ø³Ù„Ø© Ù„Ù„ÙˆÙƒÙŠÙ„ Ù…Ø¹ Ø§Ø­ØªØ±Ø§Ù… Ø§Ù„Ø³Ù‚Ù
 */
const selectSuspicionCasesForAgent = (
  cases: readonly SuspicionCase[],
  totalReviewed: number
): SuspicionCase[] => {
  const cap = Math.ceil(totalReviewed * FINAL_REVIEW_MAX_RATIO);
  const eligible = cases.filter(
    (c) => c.band === "agent-candidate" || c.band === "agent-forced"
  );
  // agent-forced Ø£ÙˆÙ„Ø§Ù‹ØŒ Ø«Ù… agent-candidate Ø­Ø³Ø¨ score ØªÙ†Ø§Ø²Ù„ÙŠØ§Ù‹
  const sorted = [...eligible].sort((a, b) => {
    if (a.band === "agent-forced" && b.band !== "agent-forced") return -1;
    if (b.band === "agent-forced" && a.band !== "agent-forced") return 1;
    return b.score - a.score;
  });
  return sorted.slice(0, cap);
};

/**
 * T027 â€” Ø­Ø³Ø§Ø¨ Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„ØªÙˆØ¬ÙŠÙ‡ Ù…Ù† SuspicionCase[]
 */
const computeFinalReviewRoutingStats = (
  cases: readonly SuspicionCase[]
): FinalReviewRoutingStats => {
  let countPass = 0;
  let countLocalReview = 0;
  let countAgentCandidate = 0;
  let countAgentForced = 0;
  for (const c of cases) {
    switch (c.band) {
      case "pass":
        countPass++;
        break;
      case "local-review":
        countLocalReview++;
        break;
      case "agent-candidate":
        countAgentCandidate++;
        break;
      case "agent-forced":
        countAgentForced++;
        break;
    }
  }
  return { countPass, countLocalReview, countAgentCandidate, countAgentForced };
};

/**
 * Ù‡Ù„ ÙŠØ¬Ø¨ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø­Ø§Ù„Ø© Ù„Ù„ÙˆÙƒÙŠÙ„ (Ø¶Ù…Ù† Ø·Ø¨Ù‚Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠØ©)
 */
const shouldEscalateSuspicionCaseToAgent = (c: SuspicionCase): boolean => {
  if (c.band === "agent-forced") return true;
  if (c.critical) return true;
  if (c.score >= 85) return true;
  const families = new Set(c.signals.map((s) => s.family));
  if (families.size >= 2) return true;
  if (
    c.primarySuggestedType &&
    c.primarySuggestedType !== c.classifiedLine.type
  )
    return true;
  return false;
};

/**
 * T012 + T015 + T025 â€” Ø·Ø¨Ù‚Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠØ©
 *
 * ØªØ³ØªÙ‚Ø¨Ù„ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ø³Ø·Ø± Ø§Ù„Ù…ØµÙ†Ù‘ÙØ© + Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø§Ø´ØªØ¨Ø§Ù‡ Ù…Ù† Ù…Ø­Ø±Ùƒ Ø§Ù„Ø§Ø´ØªØ¨Ø§Ù‡ØŒ
 * ÙˆØªØ±Ø³Ù„ Ø§Ù„Ù…Ø´Ø¨ÙˆÙ‡Ø§Øª Ù…Ù†Ù‡Ø§ Ø¥Ù„Ù‰ Ù†Ù‚Ø·Ø© Ø§Ù„Ù†Ù‡Ø§ÙŠØ© `/api/final-review`ØŒ
 * Ø«Ù… ØªØ·Ø¨Ù‘Ù‚ Ø£ÙˆØ§Ù…Ø± `relabel` Ø§Ù„Ù…ÙØ±Ø¬ÙŽØ¹Ø© Ø¹Ù„Ù‰ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©.
 */
export const applyFinalReviewLayer = async (
  classified: ClassifiedDraftWithId[],
  suspicionCases: readonly SuspicionCase[],
  importOpId: string,
  sessionId: string
): Promise<{
  classified: ClassifiedDraftWithId[];
  stats: FinalReviewRoutingStats;
}> => {
  // T023: ØªØ±Ù‚ÙŠØ© Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø°Ø§Øª alternative-pull Ø§Ù„Ø¹Ø§Ù„ÙŠ
  const promoted = promoteHighSeveritySuspicionCases(suspicionCases);

  // T027: Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª
  const stats = computeFinalReviewRoutingStats(promoted);

  // T024: Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø¶Ù…Ù† Ø³Ù‚Ù Ø§Ù„Ù†Ø³Ø¨Ø©
  const selected = selectSuspicionCasesForAgent(promoted, classified.length);

  if (selected.length === 0 || !FINAL_REVIEW_ENDPOINT) {
    return { classified, stats };
  }

  // T013 + T015: Ø¨Ù†Ø§Ø¡ Ø­Ù…ÙˆÙ„Ø© ÙƒÙ„ Ø³Ø·Ø± Ù…Ø´Ø¨ÙˆÙ‡
  const suspiciousLines: FinalReviewSuspiciousLinePayload[] = [];
  for (const c of selected) {
    if (!shouldEscalateSuspicionCaseToAgent(c)) continue;
    const classifiedItem = classified[c.lineIndex];
    const itemId = classifiedItem?._itemId ?? `item-${c.lineIndex}`;
    const payload = buildFinalReviewSuspiciousLinePayload({
      suspicionCase: c,
      classified,
      itemId,
      fingerprint: `${itemId}:${simpleHash(c.classifiedLine.text)}`,
    });
    if (payload) suspiciousLines.push(payload);
  }

  if (suspiciousLines.length === 0) {
    return { classified, stats };
  }

  const requiredItemIds = suspiciousLines.map((l) => l.itemId);
  const forcedItemIds = suspiciousLines
    .filter((l) => l.routingBand === "agent-forced")
    .map((l) => l.itemId);

  const requestPayload: FinalReviewRequestPayload = {
    packetVersion: "suspicion-final-review-v1",
    schemaVersion: "arabic-screenplay-classifier-output-v1",
    importOpId,
    sessionId,
    totalReviewed: classified.length,
    suspiciousLines,
    requiredItemIds,
    forcedItemIds,
    schemaHints: DEFAULT_FINAL_REVIEW_SCHEMA_HINTS,
    reviewPacketText: formatFinalReviewPacketText({
      totalReviewed: classified.length,
      requiredItemIds,
      forcedItemIds,
      suspiciousLines,
    }),
  };

  // Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨
  try {
    const { default: axios } = await import("axios");
    const response = await axios.post<FinalReviewResponsePayload>(
      FINAL_REVIEW_ENDPOINT,
      requestPayload,
      { timeout: 180_000 }
    );

    const data = response.data;
    if (
      data.status === "error" ||
      !data.commands ||
      data.commands.length === 0
    ) {
      return { classified, stats };
    }

    // ØªØ·Ø¨ÙŠÙ‚ Ø£ÙˆØ§Ù…Ø± relabel
    const result: ClassifiedDraftWithId[] = [...classified];
    for (const cmd of data.commands) {
      if (cmd.op === "relabel") {
        const lineIndex = suspiciousLines.find(
          (l) => l.itemId === cmd.itemId
        )?.lineIndex;
        if (
          lineIndex !== undefined &&
          lineIndex >= 0 &&
          lineIndex < result.length
        ) {
          const original = result[lineIndex];
          if (original) {
            result[lineIndex] = {
              ...original,
              type: cmd.newType,
            } as ClassifiedDraftWithId;
          }
        }
      }
    }
    return { classified: result, stats };
  } catch {
    return { classified, stats };
  }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * ØªØ·Ø¨ÙŠÙ‚ Ø¯Ø§Ù„Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…Ø­Ù„ÙŠØ© (Ø¥Ø°Ø§ ÙˆÙÙÙ‘Ø±Øª).
 * ØªÙØ³ØªØ®Ø¯Ù… ÙÙŠ Ø³ÙŠØ§Ù‚ Ø§Ù„Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„Ù…Ø®ØµØµØ© Ù„Ù„ØªØ·Ø¨ÙŠÙ‚.
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
 * Ø¥Ù†Ø´Ø§Ø¡ Ø¹Ù‚Ø¯Ø© ProseMirror Ù…Ù† Ø¹Ù†ØµØ± Ù…ØµÙ†Ù‘Ù.
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
 * ØªØ­ÙˆÙŠÙ„ Ø¹Ù†Ø§ØµØ± Ù…ØµÙ†Ù‘ÙØ© Ø¥Ù„Ù‰ Ø¹Ù‚Ø¯ ProseMirror.
 */
const classifiedToNodes = (
  classified: readonly ClassifiedDraftWithId[],
  schema: Schema
): PmNode[] => {
  const nodes: PmNode[] = [];

  for (let i = 0; i < classified.length; i++) {
    const item = classified[i];
    const next = classified[i + 1];

    // look-ahead: scene_header_1 + scene_header_2 â†’ scene_header_top_line display node
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

    // scene_header_1 alone â†’ wrap in top_line with empty header_2
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

    // scene_header_2 alone (orphan) â†’ wrap in top_line with empty header_1
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
 * ØªØµÙ†ÙŠÙ Ø§Ù„Ù†Øµ Ù…Ø­Ù„ÙŠØ§Ù‹ ÙÙ‚Ø· (Ø¨Ø¯ÙˆÙ† Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„ÙˆÙƒÙŠÙ„).
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
 * ØªØ·Ø¨ÙŠÙ‚ ØªØµÙ†ÙŠÙ Ø§Ù„Ù„ØµÙ‚ Ø¹Ù„Ù‰ Ø§Ù„Ø¹Ø±Ø¶ Ø¨Ù†Ù…Ø· Render-First.
 *
 * 1) ØªØµÙ†ÙŠÙ Ù…Ø­Ù„ÙŠ + ØªØ·Ø¨ÙŠÙ‚ Ø¥ØµÙ„Ø§Ø­Ø§Øª Ø§Ù„Ø§Ø´ØªØ¨Ø§Ù‡ Ù‚Ø¨Ù„ Ø§Ù„Ø¹Ø±Ø¶
 * 2) Ø¹Ø±Ø¶ ÙÙˆØ±ÙŠ
 * 3) Ù…Ø±Ø§Ø¬Ø¹Ø© Ù†Ù‡Ø§Ø¦ÙŠØ© ÙÙŠ Ø§Ù„Ø®Ù„ÙÙŠØ©
 *
 * Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙŠØ´ÙˆÙ Ø§Ù„Ù…Ø­ØªÙˆÙ‰ ÙÙˆØ±Ø§Ù‹ (Ø§Ù„Ø®Ø·ÙˆØ© 1)ØŒ
 * Ø«Ù… ØªØ·Ø¨Ù‚ Ø·Ø¨Ù‚Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠØ© ØªØµØ­ÙŠØ­Ø§ØªÙ‡Ø§ ØªØ¯Ø±ÙŠØ¬ÙŠØ§Ù‹.
 */
export const applyPasteClassifierFlowToView = async (
  view: EditorView,
  text: string,
  options?: ApplyPasteClassifierFlowOptions
): Promise<boolean> => {
  // â”€â”€ Re-entry guard â”€â”€
  if (pipelineRunning) {
    agentReviewLogger.warn("pipeline-reentry-blocked", {});
    return false;
  }

  // â”€â”€ Text dedup â”€â”€
  const textHash = simpleHash(text);
  if (
    textHash === lastProcessedHash &&
    performance.now() - lastProcessedAt < DEDUP_WINDOW_MS
  ) {
    agentReviewLogger.telemetry("pipeline-dedup-skip", { hash: textHash });
    return false;
  }

  pipelineRunning = true;
  try {
    const customReview = options?.agentReview;
    const classificationProfile = options?.classificationProfile;
    const sourceFileType = options?.sourceFileType;
    const sourceMethod = options?.sourceMethod;
    const structuredHints = options?.structuredHints;
    let schemaElements = options?.schemaElements;

    // â”€â”€ Phase -1: Ø¬Ù„Ø¨ schema elements Ù…Ù† Ø§Ù„Ù…Ø­Ø±Ùƒ Ø¹Ù†Ø¯ Ø§Ù„Ù„ØµÙ‚ â”€â”€
    const bridgeStart = performance.now();
    if (classificationProfile === "paste" && TEXT_EXTRACT_ENDPOINT) {
      const engineController = new AbortController();
      // T010: show loading spinner
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("paste-classifier:loading", {
            detail: { loading: true },
          })
        );
      }
      try {
        const response = await fetchWithTimeout(
          TEXT_EXTRACT_ENDPOINT,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text, sourceType: "paste" }),
          },
          engineController,
          30_000
        );
        if (!response.ok) {
          throw new Error(
            `Server returned ${String(response.status)}: ${response.statusText}`
          );
        }
        const body = (await response.json()) as {
          rawText?: string;
          elements?: readonly {
            normalizedText: string;
            suggestedType?: string;
          }[];
          extractionMeta?: Record<string, unknown>;
        };
        if (!Array.isArray(body.elements) || body.elements.length === 0) {
          throw new Error("Server returned empty elements array");
        }
        schemaElements = body.elements.map(
          (el): SchemaElementInput => ({
            element: el.suggestedType ?? "",
            value: el.normalizedText,
          })
        );
        agentReviewLogger.telemetry("paste-pipeline-stage", {
          stage: "engine-text-extract-success",
          elementCount: schemaElements.length,
        });
        pipelineRecorder.logBridgeCall(
          "paste",
          schemaElements.length,
          Math.round(performance.now() - bridgeStart)
        );
      } catch (engineError) {
        // T011 (FR-013): server failure → cancel paste entirely
        const errorMessage =
          engineError instanceof Error
            ? engineError.message
            : String(engineError);
        agentReviewLogger.error("engine-text-extract-failed", {
          error: errorMessage,
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(PASTE_CLASSIFIER_ERROR_EVENT, {
              detail: { message: errorMessage },
            })
          );
        }
        return false;
      } finally {
        // T010: hide loading spinner
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("paste-classifier:loading", {
              detail: { loading: false },
            })
          );
        }
      }
    }

    // â”€â”€ Phase 0: Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„Ù…Ø­Ù„ÙŠ â”€â”€
    // Ø±ØµØ¯ Ø§Ù„Ø¨Ø±ÙŠØ¯Ø¬ Ù„Ùˆ Ø§Ù„Ù€ schemaElements Ø¬Ø§ÙŠØ© Ù…Ù† file import (Ø§Ù„Ø¨Ø±ÙŠØ¯Ø¬ Ø§ØªØ¹Ù…Ù„ ÙÙŠ Ø§Ù„Ø¨Ø§Ùƒ Ø¥Ù†Ø¯)
    if (
      schemaElements &&
      schemaElements.length > 0 &&
      classificationProfile !== "paste"
    ) {
      pipelineRecorder.logBridgeCall(
        classificationProfile ?? "file-import",
        schemaElements.length,
        Math.round(performance.now() - bridgeStart)
      );
    }
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

    // â”€â”€ Phase 0.5: Ø¹Ø±Ø¶ ÙÙˆØ±ÙŠ (Render-First) â”€â”€
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

    // â”€â”€ Recorder: snapshot Ø¨Ø¹Ø¯ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„ÙÙˆØ±ÙŠ â”€â”€
    pipelineRecorder.trackFile("paste-classifier.ts");
    pipelineRecorder.snapshot("render-first", locallyReviewed, {
      nodesRendered: nodes.length,
    });

    // â”€â”€ Ø±Ø³Ø§Ù„Ø© Ù…Ø¤Ù‚ØªØ© Ø¹Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø© (TODO: Ø´ÙŠÙ„Ù‡Ø§ Ø¨Ø¹Ø¯ Ø§Ù„ØªØ¬Ø±Ø¨Ø©) â”€â”€
    if (typeof window !== "undefined") {
      const enabledFlags = Object.entries(PIPELINE_FLAGS)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const flagsText =
        enabledFlags.length > 0
          ? enabledFlags.join(", ")
          : "Ø§Ù„ÙƒÙ„ OFF (baseline)";
      const banner = document.createElement("div");
      banner.textContent = `âœ… Pipeline ØªÙ… â€” ${nodes.length} Ø³Ø·Ø± | Ø§Ù„Ø·Ø¨Ù‚Ø§Øª: ${flagsText}`;
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

    // â”€â”€ Phase 1: final review ÙÙŠ Ø§Ù„Ø®Ù„ÙÙŠØ© â”€â”€
    // Ù„Ø§ Ù†Ù†ØªØ¸Ø±Ù‡Ø§ â€” Ø¨ØªØ´ØªØºÙ„ async ÙˆØ¨ØªØ­Ø¯Ù‘Ø« Ø§Ù„Ù…Ø­Ø±Ø± ØªØ¯Ø±ÙŠØ¬ÙŠØ§Ù‹
    // T013: generate importOpId early and pass to background review
    const importOpId = generateItemId();
    void runFinalReviewPipeline(view, locallyReviewed, importOpId).catch(
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        agentReviewLogger.error("final-review-pipeline-error", {
          error: message,
        });
        // T014 (FR-015): toast notification on background failure
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("paste-classifier:background-error", {
              detail: { message, importOpId },
            })
          );
        }
      }
    );

    lastProcessedHash = textHash;
    lastProcessedAt = performance.now();
    return true;
  } finally {
    pipelineRunning = false;
  }
};

/**
 * ØªØ·Ø¨ÙŠÙ‚ Ø·Ø¨Ù‚Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠØ© Ø¨Ø¹Ø¯ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„ÙÙˆØ±ÙŠ.
 */
const runFinalReviewPipeline = async (
  view: EditorView,
  locallyReviewed: ClassifiedDraftWithId[],
  importOpId: string
): Promise<void> => {
  if (view.isDestroyed) return;

  const sessionId = `final-review-${Date.now()}`;
  const updateSession = progressiveUpdater.createSession(sessionId, {
    minConfidenceThreshold: 0.65,
    allowLayerOverride: true,
    layerPriority: ["final-review", "gemini-context"],
  });
  const suspicionCases =
    (locallyReviewed as ClassifiedDraftPipelineState)._suspicionCases ?? [];

  try {
    if (!PIPELINE_FLAGS.FINAL_REVIEW_ENABLED) {
      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "final-review-skipped",
        reason: "FINAL_REVIEW_ENABLED=false",
      });
      return;
    }

    if (suspicionCases.length === 0) {
      agentReviewLogger.telemetry("paste-pipeline-stage", {
        stage: "final-review-skipped",
        reason: "no-suspicion-cases",
      });
      return;
    }

    agentReviewLogger.telemetry("paste-pipeline-stage", {
      stage: "final-review-start",
      suspicionCount: suspicionCases.length,
    });

    const { classified: finalReviewed, stats: routingStats } =
      await applyFinalReviewLayer(
        locallyReviewed,
        suspicionCases,
        importOpId,
        sessionId
      );

    let appliedCount = 0;
    const comparableLength = Math.min(
      locallyReviewed.length,
      finalReviewed.length
    );
    for (let i = 0; i < comparableLength; i += 1) {
      const original = locallyReviewed[i];
      const corrected = finalReviewed[i];
      if (!original || !corrected) continue;
      if (original.type === corrected.type) continue;

      const applied = updateSession.applyCorrection(view, {
        lineIndex: i,
        correctedType: corrected.type,
        confidence: Math.max(0.65, corrected.confidence),
        reason: "Final review correction",
        source: "final-review",
      });
      if (applied) {
        appliedCount += 1;
      }
    }

    pipelineRecorder.trackFile("paste-classifier.ts");
    pipelineRecorder.snapshot("final-review", finalReviewed, {
      appliedCount,
      suspicionCount: suspicionCases.length,
      ...routingStats,
    });

    agentReviewLogger.telemetry("paste-pipeline-stage", {
      stage: "final-review-complete",
      appliedCount,
      suspicionCount: suspicionCases.length,
      countPass: routingStats.countPass,
      countLocalReview: routingStats.countLocalReview,
      countAgentCandidate: routingStats.countAgentCandidate,
      countAgentForced: routingStats.countAgentForced,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    agentReviewLogger.error("final-review-pipeline-failed", {
      sessionId,
      error: message,
    });
    // T014 (FR-015): silent toast on background review failure
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("paste-classifier:background-error", {
          detail: { message, importOpId },
        })
      );
    }
  } finally {
    updateSession.complete();
    pipelineRecorder.finishRun();
  }
};

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
