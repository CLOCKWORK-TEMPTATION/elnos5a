/**
 * @module pipeline/command-engine
 * @description محرك تنفيذ الأوامر — المراحل 6-8 من إعادة الهيكلة
 *
 * يتضمن:
 * - سياسة تضارب الأوامر (Conflict Policy) — المرحلة 6
 * - Idempotency + Stale + Partial Apply — المرحلة 7
 * - تطبيق split و relabel تلقائياً (Auto-Apply Engine) — المرحلة 8
 */

import type {
  AgentCommand,
  RelabelCommand,
  SplitCommand,
  AgentReviewResponsePayload,
} from "../types/agent-review";
import type { LineType } from "../types/screenplay";
import type { ItemSnapshot } from "./fingerprint";
import { computeFingerprint } from "./fingerprint";
import { logger } from "../utils/logger";

const engineLogger = logger.createScope("command-engine");

// ─── حالة العملية (Operation State) ────────────────────────────

/** حالة عملية استيراد واحدة — تُنشأ لكل open/paste/import */
export interface ImportOperationState {
  /** معرف العملية الفريد */
  readonly importOpId: string;
  /** مصدر العملية */
  readonly source: "open" | "paste" | "import";
  /** لقطات العناصر المُرسلة للوكيل */
  readonly snapshots: Map<string, ItemSnapshot>;
  /** معرفات الطلبات المُطبّقة (idempotency) */
  readonly appliedRequestIds: Set<string>;
  /** وقت الإنشاء */
  readonly createdAt: number;
}

/** إنشاء حالة عملية جديدة */
export const createImportOperationState = (
  importOpId: string,
  source: "open" | "paste" | "import"
): ImportOperationState => ({
  importOpId,
  source,
  snapshots: new Map(),
  appliedRequestIds: new Set(),
  createdAt: Date.now(),
});

// ─── Telemetry Counters ─────────────────────────────────────────

export interface CommandApplyTelemetry {
  commandsReceived: number;
  commandsNormalized: number;
  commandsApplied: number;
  commandsSkipped: number;
  skippedFingerprintMismatchCount: number;
  skippedMissingItemCount: number;
  skippedInvalidCommandCount: number;
  skippedConflictCount: number;
  staleDiscard: boolean;
  idempotentDiscard: boolean;
}

const emptyTelemetry = (): CommandApplyTelemetry => ({
  commandsReceived: 0,
  commandsNormalized: 0,
  commandsApplied: 0,
  commandsSkipped: 0,
  skippedFingerprintMismatchCount: 0,
  skippedMissingItemCount: 0,
  skippedInvalidCommandCount: 0,
  skippedConflictCount: 0,
  staleDiscard: false,
  idempotentDiscard: false,
});

// ─── المرحلة 6: سياسة تضارب الأوامر ─────────────────────────

/**
 * تطبيع وإزالة تكرارات الأوامر لنفس itemId.
 * - أمر واحد فقط لكل itemId لكل batch
 * - split له أولوية على relabel
 * - أكثر من split لنفس itemId = تضارب → رفض
 */
export const normalizeAndDedupeCommands = (
  commands: readonly AgentCommand[]
): { resolved: AgentCommand[]; conflictCount: number } => {
  const byItemId = new Map<
    string,
    { splits: SplitCommand[]; relabels: RelabelCommand[] }
  >();
  let conflictCount = 0;

  for (const cmd of commands) {
    const entry = byItemId.get(cmd.itemId) ?? { splits: [], relabels: [] };
    if (cmd.op === "split") {
      entry.splits.push(cmd);
    } else {
      entry.relabels.push(cmd);
    }
    byItemId.set(cmd.itemId, entry);
  }

  const resolved: AgentCommand[] = [];
  for (const [itemId, entry] of byItemId) {
    if (entry.splits.length > 1) {
      // تضارب: أكثر من split لنفس العنصر → رفض الكل
      conflictCount += entry.splits.length + entry.relabels.length;
      engineLogger.warn("conflict-multiple-splits", {
        itemId,
        splitCount: entry.splits.length,
      });
      continue;
    }

    if (entry.splits.length === 1) {
      // split له أولوية — تجاهل أي relabel
      resolved.push(entry.splits[0]);
      if (entry.relabels.length > 0) {
        conflictCount += entry.relabels.length;
      }
      continue;
    }

    // لا splits — أخذ أول relabel فقط
    if (entry.relabels.length > 0) {
      resolved.push(entry.relabels[0]);
      if (entry.relabels.length > 1) {
        conflictCount += entry.relabels.length - 1;
      }
    }
  }

  return { resolved, conflictCount };
};

// ─── المرحلة 7: Idempotency + Stale + Partial Apply ──────────

export type DiscardReason = "stale_discarded" | "idempotent_discarded" | null;

/**
 * فحص ما إذا كانت الاستجابة قديمة أو مكررة.
 */
export const checkResponseValidity = (
  response: AgentReviewResponsePayload,
  state: ImportOperationState
): DiscardReason => {
  // فحص stale
  if (response.importOpId !== state.importOpId) {
    engineLogger.warn("stale-batch-discarded", {
      expected: state.importOpId,
      received: response.importOpId,
    });
    return "stale_discarded";
  }

  // فحص idempotency
  if (state.appliedRequestIds.has(response.requestId)) {
    engineLogger.info("idempotent-request-discarded", {
      requestId: response.requestId,
    });
    return "idempotent_discarded";
  }

  return null;
};

// ─── المرحلة 8: Auto-Apply Engine ──────────────────────────────

/**
 * عنصر في المحرر — الحد الأدنى المطلوب للتطبيق.
 */
export interface EditorItem {
  readonly itemId: string;
  type: LineType;
  text: string;
}

/**
 * نتيجة تطبيق أمر واحد.
 */
export interface CommandApplyResult {
  readonly command: AgentCommand;
  readonly applied: boolean;
  readonly skipReason?: string;
}

/**
 * تحقق صامت قبل تطبيق أمر — بدون أي UI تفاعلي.
 */
const validateCommandPreApply = async (
  command: AgentCommand,
  items: Map<string, EditorItem>,
  state: ImportOperationState
): Promise<string | null> => {
  // 1. importOpId مطابق (تم التحقق مسبقاً في checkResponseValidity)

  // 2. itemId موجود
  const item = items.get(command.itemId);
  if (!item) {
    return "missing_item";
  }

  // 3. fingerprint مطابق (إذا توفر snapshot)
  const snapshot = state.snapshots.get(command.itemId);
  if (snapshot) {
    const currentFp = await computeFingerprint(item.type, item.text);
    if (currentFp !== snapshot.fingerprint) {
      return "fingerprint_mismatch";
    }
  }

  // 4. splitAt ضمن حدود النص (لأمر split)
  if (command.op === "split") {
    if (command.splitAt < 0 || command.splitAt >= item.text.length) {
      return "splitAt_out_of_bounds";
    }
  }

  return null;
};

/**
 * تطبيق أمر relabel على عنصر واحد.
 */
export const applyRelabelCommand = (
  command: RelabelCommand,
  item: EditorItem
): void => {
  item.type = command.newType;
};

/**
 * تطبيق أمر split على عنصر واحد.
 * يُعيد العنصرين الناتجين (الأيسر والأيمن).
 */
export const applySplitCommand = (
  command: SplitCommand,
  item: EditorItem,
  generateId: () => string
): [EditorItem, EditorItem] => {
  const leftText = item.text.slice(0, command.splitAt);
  const rightText = item.text.slice(command.splitAt);

  // العنصر الأيسر يحتفظ بنفس الـ itemId
  const leftItem: EditorItem = {
    itemId: item.itemId,
    type: command.leftType,
    text: leftText.trim(),
  };

  // العنصر الأيمن يحصل على itemId جديد
  const rightItem: EditorItem = {
    itemId: generateId(),
    type: command.rightType,
    text: rightText.trim(),
  };

  return [leftItem, rightItem];
};

// ─── التطبيق التلقائي الكامل (orchestrator) ──────────────────

/**
 * نتيجة التطبيق الكامل لدفعة أوامر.
 */
export interface BatchApplyResult {
  /** الحالة النهائية */
  status:
    | "applied"
    | "partial"
    | "stale_discarded"
    | "idempotent_discarded"
    | "error";
  /** تفاصيل كل أمر */
  results: CommandApplyResult[];
  /** إحصائيات */
  telemetry: CommandApplyTelemetry;
}

/**
 * تطبيق دفعة أوامر كاملة على عناصر المحرر.
 *
 * Pipeline:
 * 1) التحقق من الصلاحية (stale / idempotency)
 * 2) تطبيع الأوامر
 * 3) إزالة التكرارات وحل التضاربات
 * 4) التحقق الفردي وتطبيق كل أمر
 */
export const applyCommandBatch = async (
  response: AgentReviewResponsePayload,
  state: ImportOperationState,
  items: Map<string, EditorItem>,
  generateId: () => string
): Promise<BatchApplyResult> => {
  const telemetry = emptyTelemetry();
  telemetry.commandsReceived = response.commands.length;

  // 1) فحص stale / idempotency
  const discardReason = checkResponseValidity(response, state);
  if (discardReason === "stale_discarded") {
    telemetry.staleDiscard = true;
    return { status: "stale_discarded", results: [], telemetry };
  }
  if (discardReason === "idempotent_discarded") {
    telemetry.idempotentDiscard = true;
    return { status: "idempotent_discarded", results: [], telemetry };
  }

  // 2-3) تطبيع + إزالة تكرارات + حل تضاربات
  const { resolved, conflictCount } = normalizeAndDedupeCommands(
    response.commands
  );
  telemetry.commandsNormalized = resolved.length;
  telemetry.skippedConflictCount = conflictCount;

  // 4) تطبيق كل أمر
  const results: CommandApplyResult[] = [];

  // ترتيب: splits أولاً (من الأخير للأول حسب splitAt لتجنب تغيير المواقع)
  const sortedCommands = [...resolved].sort((a, b) => {
    if (a.op === "split" && b.op !== "split") return -1;
    if (a.op !== "split" && b.op === "split") return 1;
    if (a.op === "split" && b.op === "split") {
      return (b as SplitCommand).splitAt - (a as SplitCommand).splitAt;
    }
    return 0;
  });

  for (const command of sortedCommands) {
    const skipReason = await validateCommandPreApply(command, items, state);

    if (skipReason) {
      results.push({ command, applied: false, skipReason });
      telemetry.commandsSkipped += 1;
      if (skipReason === "fingerprint_mismatch") {
        telemetry.skippedFingerprintMismatchCount += 1;
      } else if (skipReason === "missing_item") {
        telemetry.skippedMissingItemCount += 1;
      } else {
        telemetry.skippedInvalidCommandCount += 1;
      }
      continue;
    }

    const item = items.get(command.itemId)!;

    if (command.op === "relabel") {
      applyRelabelCommand(command, item);
      results.push({ command, applied: true });
      telemetry.commandsApplied += 1;
    } else if (command.op === "split") {
      const [leftItem, rightItem] = applySplitCommand(
        command,
        item,
        generateId
      );
      // تحديث المخزن: استبدال العنصر الأصلي بالأيسر وإضافة الأيمن
      items.set(leftItem.itemId, leftItem);
      items.set(rightItem.itemId, rightItem);
      results.push({ command, applied: true });
      telemetry.commandsApplied += 1;
    }
  }

  // تسجيل requestId
  state.appliedRequestIds.add(response.requestId);

  // تحديد الحالة النهائية
  const allApplied = results.every((r) => r.applied);
  const noneApplied = results.every((r) => !r.applied);
  let status: BatchApplyResult["status"];
  if (results.length === 0 || noneApplied) {
    status = "partial"; // لا أوامر طُبّقت
  } else if (allApplied) {
    status = "applied";
  } else {
    status = "partial";
  }

  engineLogger.telemetry("batch-applied", telemetry);

  return { status, results, telemetry };
};

// ─── Validation لأوامر الوكيل ────────────────────────────────

const VALID_OPS = new Set(["relabel", "split"]);
const VALID_TYPES = new Set([
  "action",
  "dialogue",
  "character",
  "scene_header_top_line",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);

/**
 * تحقق وتصفية أوامر الوكيل — يُسقط الأوامر غير الصالحة.
 */
export const validateAndFilterCommands = (
  rawCommands: unknown[]
): { valid: AgentCommand[]; invalidCount: number } => {
  const valid: AgentCommand[] = [];
  let invalidCount = 0;

  for (const raw of rawCommands) {
    if (!raw || typeof raw !== "object") {
      invalidCount += 1;
      continue;
    }

    const record = raw as Record<string, unknown>;
    const op = record.op;

    if (typeof op !== "string" || !VALID_OPS.has(op)) {
      invalidCount += 1;
      continue;
    }

    if (typeof record.itemId !== "string" || !record.itemId) {
      invalidCount += 1;
      continue;
    }

    if (op === "relabel") {
      const newType = record.newType;
      if (typeof newType !== "string" || !VALID_TYPES.has(newType)) {
        invalidCount += 1;
        continue;
      }
      const confidence =
        typeof record.confidence === "number" ? record.confidence : 0.5;
      const reason =
        typeof record.reason === "string" ? record.reason : "بدون سبب";

      valid.push({
        op: "relabel",
        itemId: record.itemId as string,
        newType: newType as LineType,
        confidence: Math.max(0, Math.min(1, confidence)),
        reason,
      });
    } else if (op === "split") {
      const splitAt = record.splitAt;
      if (
        typeof splitAt !== "number" ||
        !Number.isInteger(splitAt) ||
        splitAt < 0
      ) {
        invalidCount += 1;
        continue;
      }
      const leftType = record.leftType;
      const rightType = record.rightType;
      if (
        typeof leftType !== "string" ||
        !VALID_TYPES.has(leftType) ||
        typeof rightType !== "string" ||
        !VALID_TYPES.has(rightType)
      ) {
        invalidCount += 1;
        continue;
      }
      // ممنوع: leftText / rightText
      if ("leftText" in record || "rightText" in record) {
        invalidCount += 1;
        continue;
      }
      const confidence =
        typeof record.confidence === "number" ? record.confidence : 0.5;
      const reason =
        typeof record.reason === "string" ? record.reason : "بدون سبب";

      valid.push({
        op: "split",
        itemId: record.itemId as string,
        splitAt,
        leftType: leftType as LineType,
        rightType: rightType as LineType,
        confidence: Math.max(0, Math.min(1, confidence)),
        reason,
      });
    }
  }

  return { valid, invalidCount };
};
