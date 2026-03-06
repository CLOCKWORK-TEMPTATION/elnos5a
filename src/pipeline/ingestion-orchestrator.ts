/**
 * @fileoverview Ingestion Orchestrator — نقطة دخول موحدة لجميع عمليات إدخال النص
 *
 * يدير المسارات المختلفة حسب مستوى الثقة:
 * - trusted_structured: استيراد مباشر بدون مراجعة
 * - semi_structured: فحص سريع + استيراد
 * - raw_text: تصنيف كامل + مراجعة وكيل
 *
 * @module pipeline/ingestion-orchestrator
 */

import type { EditorView } from "@tiptap/pm/view";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import type { ScreenplayBlock } from "../utils/file-import";
import { toLegacyElementType } from "../extensions/classification-types";
import {
  assessTrustLevel,
  type InputTrustLevel,
  type StructuredBlock,
} from "./trust-policy";
import {
  applyCommandBatch,
  createImportOperationState,
  type EditorItem,
} from "./command-engine";
import {
  createImportSnapshotWithMethods,
  type ImportItem,
  type ImportSnapshotWithIdMethods,
} from "./import-state";
import type { ClassifiedItem } from "./editor-insertion";
import {
  buildPacketWithBudget,
  type PacketBudgetConfig,
  type PacketBuildResult,
} from "./packet-budget";
import { telemetry } from "./telemetry";
import { requestAgentReview } from "../extensions/Arabic-Screenplay-Classifier-Agent";
import { classifyLines } from "../extensions/paste-classifier";
import { PostClassificationReviewer } from "../extensions/classification-core";
import type {
  ClassifiedLine,
  ClassificationMethod,
} from "../extensions/classification-types";
import { logger } from "../utils/logger";
import type { AgentCommand } from "../types/agent-review";
import type { LineType } from "../types/screenplay";

const orchestratorLogger = logger.createScope("ingestion-orchestrator");

/** مستويات الثقة للإدخال */
export type TrustLevel = InputTrustLevel;

/** نتيجة عملية الإدخال */
export interface IngestionResult {
  success: boolean;
  importOpId: string;
  trustLevel: TrustLevel;
  itemsProcessed: number;
  commandsApplied: number;
  errors: string[];
}

/** خيارات تشغيل الـ Pipeline */
export interface RunTextIngestionPipelineOptions {
  /** مصدر الإدخال (paste, open, import, etc.) */
  source: string;
  /** معرف الجلسة */
  sessionId?: string;
  /** البيانات الوصفية الإضافية */
  metadata?: Record<string, unknown>;
  /** موضع الإدراج (للـ paste) */
  from?: number;
  /** موضع النهاية (للـ replace) */
  to?: number;
  /** وضع الاستيراد */
  mode?: "replace" | "insert";
  /** إعدادات ميزانية الحزمة */
  packetBudget?: Partial<PacketBudgetConfig>;
  /** callback عند اكتمال المراجعة */
  onReviewComplete?: (result: {
    commands: AgentCommand[];
    applied: number;
    skipped: number;
  }) => void;
}

/** الإعدادات الافتراضية لميزانية الحزمة */
const DEFAULT_PACKET_CONFIG: PacketBudgetConfig = {
  maxSuspiciousLinesPerRequest: 40,
  maxCharsPerLinePreview: 240,
  maxForcedItemsPerRequest: 20,
  maxPacketChars: 15000,
  agentTimeoutMs: 8000,
  retryCount: 1,
};

const toStructuredBlocks = (blocks: ScreenplayBlock[]): StructuredBlock[] =>
  blocks.map((block) => ({
    type: block.formatId,
    text: block.text,
  }));

const toOperationSource = (source: string): "open" | "paste" | "import" => {
  if (source === "open" || source === "paste" || source === "import") {
    return source;
  }
  return "import";
};

const LINE_TYPE_SET = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "scene_header_top_line",
  "transition",
  "parenthetical",
  "basmala",
]);

const toLineType = (value: string): LineType => {
  if (LINE_TYPE_SET.has(value as LineType)) {
    return value as LineType;
  }
  return "action";
};

const getSnapshotItem = (
  snapshot: ImportSnapshotWithIdMethods,
  itemId: string
): ImportItem | null => snapshot.items.get(itemId) ?? null;

const toEditorItem = (item: ImportItem): EditorItem => ({
  itemId: item.itemId,
  type: toLineType(item.type),
  text: item.text,
});

/**
 * نقطة دخول موحدة لجميع عمليات إدخال النص
 *
 * @param view — عرض المحرر
 * @param input — النص أو البلوكات المهيكلة
 * @param options — خيارات التشغيل
 * @returns نتيجة العملية
 */
export async function runTextIngestionPipeline(
  view: EditorView,
  input: string | ScreenplayBlock[],
  options: RunTextIngestionPipelineOptions
): Promise<IngestionResult> {
  const importOpId = crypto.randomUUID();
  const startTime = performance.now();
  const errors: string[] = [];

  // استخدام startTime لتجنب التحذير
  void startTime;

  orchestratorLogger.info("pipeline-started", {
    importOpId,
    source: options.source,
    inputType: typeof input === "string" ? "text" : "blocks",
  });

  try {
    // ── الخطوة 1: تقييم مستوى الثقة ──
    const trustAssessment = assessTrustLevel({
      blocks: typeof input === "string" ? [] : toStructuredBlocks(input),
      source: options.source,
      systemGenerated: options.metadata?.systemGenerated === true,
      integrityChecked: options.metadata?.integrityChecked === true,
    });
    const trustLevel = trustAssessment.level;

    telemetry.recordIngestionStart(importOpId, {
      source: options.source,
      trustLevel,
      inputSize: typeof input === "string" ? input.length : input.length,
    });

    // ── الخطوة 2: التوجيه حسب مستوى الثقة ──
    switch (trustLevel) {
      case "trusted_structured": {
        // مسار موثوق: استيراد مباشر
        const result = await handleTrustedPath(
          view,
          input as ScreenplayBlock[],
          importOpId,
          options
        );

        // تشغيل sanity check في الخلفية
        void runBackgroundSanityCheck(view, importOpId);

        return result;
      }

      case "semi_structured": {
        // مسار شبه موثوق: فحص سريع + استيراد
        const result = await handleSemiTrustedPath(
          view,
          input,
          importOpId,
          options
        );
        return result;
      }

      case "raw_text":
      default: {
        // مسار غير موثوق: تصنيف + مراجعة وكيل
        const result = await handleRawTextPath(
          view,
          input as string,
          importOpId,
          options
        );
        return result;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    orchestratorLogger.error("pipeline-failed", {
      importOpId,
      error: errorMsg,
    });
    errors.push(errorMsg);

    telemetry.recordIngestionError(importOpId, errorMsg);

    return {
      success: false,
      importOpId,
      trustLevel: "raw_text",
      itemsProcessed: 0,
      commandsApplied: 0,
      errors,
    };
  }
}

/**
 * مسار الثقة العالية — استيراد مباشر بدون مراجعة
 */
async function handleTrustedPath(
  view: EditorView,
  blocks: ScreenplayBlock[],
  importOpId: string,
  options: RunTextIngestionPipelineOptions
): Promise<IngestionResult> {
  orchestratorLogger.info("trusted-path-executing", {
    importOpId,
    blockCount: blocks.length,
  });

  // استيراد مباشر بدون تحويل إلى نص
  const { screenplayBlocksToHtml } = await import("../utils/file-import");
  const html = screenplayBlocksToHtml(blocks);

  // إدراج HTML في المحرر
  const tr = view.state.tr;
  const from = options.from ?? 0;
  const to = options.to ?? view.state.doc.content.size;

  // استخدام parseHTML لتحويل HTML إلى عقد ProseMirror
  const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
  const domElement = document.createElement("div");
  domElement.innerHTML = html;
  const parsedContent = parser.parse(domElement);

  tr.replaceWith(from, to, parsedContent);
  view.dispatch(tr);

  telemetry.recordIngestionComplete(importOpId, {
    trustLevel: "trusted_structured",
    itemsProcessed: blocks.length,
    commandsApplied: 0,
    latencyMs: 0,
  });

  return {
    success: true,
    importOpId,
    trustLevel: "trusted_structured",
    itemsProcessed: blocks.length,
    commandsApplied: 0,
    errors: [],
  };
}

/**
 * مسار الثقة المتوسطة — فحص سريع + استيراد
 */
async function handleSemiTrustedPath(
  view: EditorView,
  input: string | ScreenplayBlock[],
  importOpId: string,
  options: RunTextIngestionPipelineOptions
): Promise<IngestionResult> {
  orchestratorLogger.info("semi-trusted-path-executing", { importOpId });

  // تحويل إلى بلوكات إذا كان نص
  let blocks: ScreenplayBlock[];
  if (typeof input === "string") {
    const classified = classifyLines(input);
    blocks = classified.map((item) => ({
      formatId: toLegacyElementType(item.type),
      text: item.text,
    }));
  } else {
    blocks = input;
  }

  // فحص سريع للتحقق من السلامة
  const suspiciousItems = blocks.filter(
    (block) => block.formatId === "dialogue" && block.text.includes("ثم ")
  );

  // إذا كان هناك عناصر مشبوهة، استخدم مسار النص الخام
  if (suspiciousItems.length > 0) {
    orchestratorLogger.info("semi-trusted-fallback-to-raw", {
      importOpId,
      suspiciousCount: suspiciousItems.length,
    });
    const text =
      typeof input === "string"
        ? input
        : blocks.map((block) => block.text).join("\n");
    return handleRawTextPath(view, text, importOpId, options);
  }

  // استيراد مباشر
  return handleTrustedPath(view, blocks, importOpId, options);
}

/**
 * مسار النص الخام — تصنيف كامل + مراجعة وكيل
 */
async function handleRawTextPath(
  view: EditorView,
  text: string,
  importOpId: string,
  options: RunTextIngestionPipelineOptions
): Promise<IngestionResult> {
  const startTime = performance.now();
  orchestratorLogger.info("raw-text-path-executing", {
    importOpId,
    textLength: text.length,
  });

  // ── الخطوة 1: التصنيف المحلي الفوري ──
  const classified = classifyLines(text);

  // إنشاء snapshot للحالة
  const snapshot = createImportSnapshotWithMethods(importOpId, classified);

  // ── الخطوة 2: عرض فوري (Render-First) ──
  // classified أصلاً يحتوي _itemId من classifyLines() — نستخدمه مباشرة
  // بدون إعادة توليد عشان يبقى متطابق مع الـ snapshot

  // إدراج فوري في المحرر
  const editorInsertion = await import("./editor-insertion").catch(() => ({
    insertClassifiedItems: async () => {},
  }));
  await editorInsertion.insertClassifiedItems(
    view,
    classified as ClassifiedItem[],
    {
      from: options.from,
      to: options.to,
    }
  );

  orchestratorLogger.info("raw-text-rendered", {
    importOpId,
    itemCount: classified.length,
    latencyMs: performance.now() - startTime,
  });

  // ── الخطوة 3: تحليل الشبهة عبر PostClassificationReviewer ──
  const reviewInput: ClassifiedLine[] = classified.map((item, index) => ({
    lineIndex: index,
    text: item.text,
    assignedType: item.type,
    originalConfidence: item.confidence,
    classificationMethod: item.classificationMethod as ClassificationMethod,
    sourceHintType: item.sourceHintType,
    sourceProfile: item.sourceProfile,
  }));

  const reviewer = new PostClassificationReviewer();
  const reviewPacket = reviewer.review(reviewInput);

  orchestratorLogger.info("post-classification-review", {
    importOpId,
    totalReviewed: reviewPacket.totalReviewed,
    totalSuspicious: reviewPacket.totalSuspicious,
    suspicionRate: reviewPacket.suspicionRate,
  });

  // بناء حزمة المراجعة من العناصر المشبوهة فعلاً
  const config = { ...DEFAULT_PACKET_CONFIG, ...options.packetBudget };
  const { prepareItemForPacket } = await import("./packet-budget");

  const suspiciousItems = reviewPacket.suspiciousLines
    .map((suspicious) => {
      const item = classified[suspicious.line.lineIndex];
      if (!item || !item._itemId) return null;

      const isForced = suspicious.routingBand === "agent-forced";
      const score = suspicious.escalationScore / 100;

      return prepareItemForPacket(
        item._itemId,
        item.text,
        score,
        isForced,
        config
      );
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const packet = buildPacketWithBudget(suspiciousItems, config);

  if (packet.included.length === 0) {
    orchestratorLogger.info("no-suspicious-items", { importOpId });
    telemetry.recordIngestionComplete(importOpId, {
      trustLevel: "raw_text",
      itemsProcessed: classified.length,
      commandsApplied: 0,
      latencyMs: performance.now() - startTime,
    });

    return {
      success: true,
      importOpId,
      trustLevel: "raw_text",
      itemsProcessed: classified.length,
      commandsApplied: 0,
      errors: [],
    };
  }

  // ── الخطوة 4: إرسال للوكيل (Best-effort, non-blocking) ──
  void runAgentReviewAndApply(view, packet, snapshot, options, importOpId);

  // ── الخطوة 5: إرجاع النتيجة فورًا (لا ننتظر الوكيل) ──
  telemetry.recordIngestionComplete(importOpId, {
    trustLevel: "raw_text",
    itemsProcessed: classified.length,
    commandsApplied: 0,
    latencyMs: performance.now() - startTime,
    agentReviewInitiated: true,
  });

  return {
    success: true,
    importOpId,
    trustLevel: "raw_text",
    itemsProcessed: classified.length,
    commandsApplied: 0,
    errors: [],
  };
}

/**
 * تشغيل مراجعة الوكيل وتطبيق النتائج (في الخلفية)
 */
async function runAgentReviewAndApply(
  _view: EditorView,
  packet: PacketBuildResult,
  snapshot: ImportSnapshotWithIdMethods,
  options: RunTextIngestionPipelineOptions,
  importOpId: string
): Promise<void> {
  const reviewStartTime = performance.now();
  void _view; // تجنب تحذير unused parameter

  try {
    const includedItems = packet.included
      .map((packetItem) => getSnapshotItem(snapshot, packetItem.itemId))
      .filter((item): item is ImportItem => item !== null);

    const request: Parameters<typeof requestAgentReview>[0] = {
      sessionId: options.sessionId ?? importOpId,
      importOpId,
      items: includedItems.map((item) => ({
        itemId: item.itemId,
        type: toLineType(item.type),
        text: item.text,
        fingerprint: item.fingerprint,
      })),
      requiredItemIds: packet.included.map((item) => item.itemId),
      forcedItemIds: packet.included
        .filter((item) => item.isForced)
        .map((item) => item.itemId),
      context: {
        source: options.source,
        totalItems: packet.included.length,
      },
    };

    // إعداد طلب المراجعة
    telemetry.recordAgentReviewStart(importOpId, {
      itemsSent: packet.included.length,
      forcedItems: packet.included.filter((item) => item.isForced).length,
    });

    // إرسال الطلب
    const response = await requestAgentReview(request);

    const latencyMs = performance.now() - reviewStartTime;

    telemetry.recordAgentReviewComplete(importOpId, {
      status: response.status,
      commandsReceived: response.commands?.length ?? 0,
      latencyMs,
    });

    // التحقق من مطابقة importOpId (stale discard)
    if (response.importOpId !== importOpId) {
      orchestratorLogger.warn("stale-batch-discarded", {
        importOpId,
        responseImportOpId: response.importOpId,
      });
      telemetry.recordStaleDiscard(importOpId);
      return;
    }

    // التحقق من idempotency
    if (snapshot.hasRequestId(response.requestId)) {
      orchestratorLogger.info("idempotent-discard", {
        importOpId,
        requestId: response.requestId,
      });
      telemetry.recordIdempotentDiscard(importOpId, response.requestId);
      return;
    }
    snapshot.addRequestId(response.requestId);

    // ── تطبيق الأوامر ──
    if (response.commands && response.commands.length > 0) {
      // إنشاء ImportOperationState للتطبيق
      const state = createImportOperationState(
        importOpId,
        toOperationSource(options.source)
      );

      const items = new Map<string, EditorItem>(
        includedItems.map((item) => [item.itemId, toEditorItem(item)])
      );

      const applyResult = await applyCommandBatch(response, state, items, () =>
        crypto.randomUUID()
      );

      orchestratorLogger.info("commands-applied", {
        importOpId,
        applied: applyResult.telemetry.commandsApplied,
        skipped: applyResult.telemetry.commandsSkipped,
        status: applyResult.status,
      });

      telemetry.recordCommandsApplied(importOpId, {
        commandsNormalized: applyResult.telemetry.commandsNormalized,
        commandsApplied: applyResult.telemetry.commandsApplied,
        commandsSkipped: applyResult.telemetry.commandsSkipped,
        skippedFingerprintMismatch:
          applyResult.telemetry.skippedFingerprintMismatchCount,
        skippedMissingItem: applyResult.telemetry.skippedMissingItemCount,
        skippedInvalidCommand: applyResult.telemetry.skippedInvalidCommandCount,
        skippedConflict: applyResult.telemetry.skippedConflictCount,
      });

      // استدعاء الـ callback إذا موجود
      options.onReviewComplete?.({
        commands: response.commands,
        applied: applyResult.telemetry.commandsApplied,
        skipped: applyResult.telemetry.commandsSkipped,
      });
    } else {
      orchestratorLogger.info("no-commands-to-apply", { importOpId });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    orchestratorLogger.error("agent-review-failed", {
      importOpId,
      error: errorMsg,
    });
    telemetry.recordAgentReviewError(importOpId, errorMsg);

    // لا نعمل rollback — نترك النص كما هو
    orchestratorLogger.info("render-first-preserved", { importOpId });
  }
}

/**
 * فحص سلامة في الخلفية بعد الاستيراد المباشر
 */
async function runBackgroundSanityCheck(
  _view: EditorView,
  importOpId: string
): Promise<void> {
  void _view; // تجنب تحذير unused parameter
  orchestratorLogger.info("background-sanity-check-started", { importOpId });

  // TODO: تنفيذ الفحص الفعلي
  // هذا placeholder للفحص المستقبلي

  orchestratorLogger.info("background-sanity-check-completed", { importOpId });
}
