/**
 * @module utils/pipeline-telemetry
 * @description خدمة تسجيل مراحل المعالجة الموحدة (FR-017 / SC-010)
 *
 * تُسجّل بداية ونهاية كل مرحلة مع بيانات وصفية:
 * extraction → local_classification → suspicion_engine → review_layer
 */

/**
 * @typedef {'extraction' | 'local_classification' | 'suspicion_engine' | 'review_layer'} PipelineStage
 * @typedef {'started' | 'completed' | 'failed'} PipelineStageStatus
 * @typedef {'paste' | 'doc' | 'docx'} SourceType
 */

/**
 * @typedef {Object} PipelineTelemetryEvent
 * @property {string} importOpId
 * @property {PipelineStage} stage
 * @property {PipelineStageStatus} status
 * @property {SourceType} sourceType
 * @property {number} timestamp
 * @property {number} [durationMs]
 * @property {{ message: string, stack?: string }} [errorDetails]
 */

const PREFIX = "[pipeline-telemetry]";

/** @type {Map<string, Map<string, number>>} importOpId → (stage → startTimestamp) */
const stageTimers = new Map();

/**
 * بناء كائن الحدث وطباعته
 * @param {PipelineTelemetryEvent} event
 */
const emit = (event) => {
  const tag =
    event.status === "failed"
      ? "❌"
      : event.status === "completed"
        ? "✅"
        : "🔄";
  const duration = event.durationMs != null ? ` (${event.durationMs}ms)` : "";
  const error = event.errorDetails ? ` — ${event.errorDetails.message}` : "";

  console.warn(
    `${PREFIX} ${tag} [${event.importOpId}] ${event.stage} ${event.status}${duration}${error}`
  );
};

/**
 * تسجيل بداية مرحلة
 * @param {string} importOpId
 * @param {PipelineStage} stage
 * @param {SourceType} sourceType
 */
export const recordStageStart = (importOpId, stage, sourceType) => {
  const now = Date.now();
  if (!stageTimers.has(importOpId)) {
    stageTimers.set(importOpId, new Map());
  }
  stageTimers.get(importOpId).set(stage, now);

  emit({
    importOpId,
    stage,
    status: "started",
    sourceType,
    timestamp: now,
  });
};

/**
 * تسجيل اكتمال مرحلة
 * @param {string} importOpId
 * @param {PipelineStage} stage
 * @param {SourceType} sourceType
 */
export const recordStageComplete = (importOpId, stage, sourceType) => {
  const now = Date.now();
  const startTime = stageTimers.get(importOpId)?.get(stage);
  const durationMs = startTime != null ? now - startTime : undefined;

  emit({
    importOpId,
    stage,
    status: "completed",
    sourceType,
    timestamp: now,
    durationMs,
  });

  // تنظيف بعد اكتمال المرحلة
  stageTimers.get(importOpId)?.delete(stage);
  if (stageTimers.get(importOpId)?.size === 0) {
    stageTimers.delete(importOpId);
  }
};

/**
 * تسجيل فشل مرحلة
 * @param {string} importOpId
 * @param {PipelineStage} stage
 * @param {SourceType} sourceType
 * @param {Error | string} error
 */
export const recordStageFailure = (importOpId, stage, sourceType, error) => {
  const now = Date.now();
  const startTime = stageTimers.get(importOpId)?.get(stage);
  const durationMs = startTime != null ? now - startTime : undefined;

  const errorDetails =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) };

  emit({
    importOpId,
    stage,
    status: "failed",
    sourceType,
    timestamp: now,
    durationMs,
    errorDetails,
  });

  stageTimers.get(importOpId)?.delete(stage);
  if (stageTimers.get(importOpId)?.size === 0) {
    stageTimers.delete(importOpId);
  }
};

/**
 * تنظيف جميع المؤقتات لعملية استيراد (عند الإلغاء مثلاً)
 * @param {string} importOpId
 */
export const clearTimers = (importOpId) => {
  stageTimers.delete(importOpId);
};
