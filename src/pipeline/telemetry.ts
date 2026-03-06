/**
 * @module pipeline/telemetry
 * @description Telemetry / Logging — المرحلة 10 من إعادة الهيكلة
 *
 * يوفر هيكل تسجيل كافٍ للإجابة عن:
 * - هل أُرسلت السطور للوكيل؟
 * - هل ردّ الوكيل؟
 * - لماذا لم تُطبَّق بعض النتائج؟
 */

import { logger } from "../utils/logger";

const telemetryLogger = logger.createScope("pipeline.telemetry");

// ─── أحداث مستوى العملية ────────────────────────────────────────

export interface OperationTelemetry {
  /** معرف عملية الاستيراد */
  importOpId: string;
  /** مصدر العملية */
  source: "open" | "paste" | "import";
  /** مستوى الثقة */
  trustLevel: "trusted_structured" | "semi_structured" | "raw_text";
  /** عدد الأسطر المشبوهة */
  suspiciousCount: number;
  /** عدد الأسطر المُرسلة للوكيل */
  sentToAgentCount: number;
  /** عدد الأسطر الإجمالي */
  totalLines: number;
  /** الوقت الإجمالي بالمللي ثانية */
  totalDurationMs: number;
}

// ─── أحداث مستوى استجابة الوكيل ─────────────────────────────────

export interface AgentResponseTelemetry {
  /** معرف الطلب */
  requestId: string;
  /** معرف العملية */
  importOpId: string;
  /** زمن الاستجابة */
  latencyMs: number;
  /** حالة الاستجابة */
  status: string;
  /** عدد الأوامر المُستلمة */
  commandsReceived: number;
}

// ─── أحداث مستوى تطبيق الأوامر ──────────────────────────────────

export interface CommandApplyTelemetryEvent {
  /** معرف العملية */
  importOpId: string;
  /** معرف الطلب */
  requestId: string;
  /** عدد الأوامر المُطبّعة بعد التطبيع */
  commandsNormalized: number;
  /** عدد الأوامر المُطبّقة فعلياً */
  commandsApplied: number;
  /** عدد الأوامر المتخطاة */
  commandsSkipped: number;
  /** عدد التخطيات بسبب عدم تطابق البصمة */
  skippedFingerprintMismatchCount: number;
  /** عدد التخطيات بسبب عنصر مفقود */
  skippedMissingItemCount: number;
  /** عدد التخطيات بسبب أمر غير صالح */
  skippedInvalidCommandCount: number;
  /** عدد التخطيات بسبب تضارب */
  skippedConflictCount: number;
  /** هل تم تجاهل الدفعة كاملة (stale) */
  staleDiscard: boolean;
  /** هل تم تجاهل الدفعة (idempotent) */
  idempotentDiscard: boolean;
}

// ─── دوال التسجيل ───────────────────────────────────────────────

/** تسجيل بداية عملية */
export const logOperationStart = (data: OperationTelemetry): void => {
  telemetryLogger.telemetry("operation-start", data);
};

/** تسجيل نهاية عملية */
export const logOperationComplete = (data: OperationTelemetry): void => {
  telemetryLogger.telemetry("operation-complete", data);
};

/** تسجيل استجابة الوكيل */
export const logAgentResponse = (data: AgentResponseTelemetry): void => {
  telemetryLogger.telemetry("agent-response", data);
};

/** تسجيل تطبيق الأوامر */
export const logCommandApply = (data: CommandApplyTelemetryEvent): void => {
  telemetryLogger.telemetry("command-apply", data);
};

/** تسجيل خطأ في الوكيل */
export const logAgentError = (importOpId: string, error: unknown): void => {
  telemetryLogger.error("agent-error", {
    importOpId,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : String(error),
  });
};

/** تسجيل تخطي مراجعة الوكيل */
export const logAgentSkipped = (importOpId: string, reason: string): void => {
  telemetryLogger.info("agent-skipped", { importOpId, reason });
};

// ─── Telemetry Object for Unified Interface ─────────────────────

/** نوع حدث التتبع للاستيراد */
export interface IngestionTelemetryEvent {
  importOpId: string;
  source: string;
  trustLevel: string;
  itemsProcessed: number;
  commandsApplied: number;
  inputSize?: number;
  latencyMs?: number;
  agentReviewInitiated?: boolean;
}

/** كائن التتبع الموحد */
export const telemetry = {
  recordIngestionStart: (
    importOpId: string,
    data: Partial<IngestionTelemetryEvent>
  ): void => {
    telemetryLogger.telemetry("ingestion-start", { importOpId, ...data });
  },

  recordIngestionComplete: (
    importOpId: string,
    data: Partial<IngestionTelemetryEvent>
  ): void => {
    telemetryLogger.telemetry("ingestion-complete", { importOpId, ...data });
  },

  recordIngestionError: (importOpId: string, error: string): void => {
    telemetryLogger.error("ingestion-error", { importOpId, error });
  },

  recordAgentReviewStart: (
    importOpId: string,
    data: { itemsSent: number; forcedItems: number }
  ): void => {
    telemetryLogger.telemetry("agent-review-start", { importOpId, ...data });
  },

  recordAgentReviewComplete: (
    importOpId: string,
    data: { status: string; commandsReceived: number; latencyMs: number }
  ): void => {
    telemetryLogger.telemetry("agent-review-complete", { importOpId, ...data });
  },

  recordAgentReviewError: (importOpId: string, error: string): void => {
    telemetryLogger.error("agent-review-error", { importOpId, error });
  },

  recordCommandsApplied: (
    importOpId: string,
    data: Record<string, number | boolean>
  ): void => {
    telemetryLogger.telemetry("commands-applied", { importOpId, ...data });
  },

  recordStaleDiscard: (importOpId: string): void => {
    telemetryLogger.info("stale-discard", { importOpId });
  },

  recordIdempotentDiscard: (importOpId: string, requestId: string): void => {
    telemetryLogger.info("idempotent-discard", { importOpId, requestId });
  },
};
