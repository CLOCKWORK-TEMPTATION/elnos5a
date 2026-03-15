/**
 * @module types/unified-reception
 * @description أنواع الاستجابة الموحدة وتتبع مراحل المعالجة
 * لنقطة الدخول `/api/text-extract`
 */

import type { ElementType } from "../extensions/classification-types";

/**
 * نوع المصدر: لصق أو مستند قديم أو مستند حديث
 */
export type ReceptionSourceType = "paste" | "doc" | "docx";

/**
 * عنصر مستخرج ومُطبَّع من النص
 */
export interface UnifiedReceptionElement {
  /** معرف فريد للتتبع في طبقتي الشك والمراجعة */
  id: string;
  /** النص الأصلي قبل التطبيع */
  originalText: string;
  /** النص بعد التطبيع */
  normalizedText: string;
  /** تلميح أولي اختياري من المحرك */
  suggestedType?: ElementType;
  /** بيانات وصفية إضافية */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * الاستجابة الموحدة من الخادم — متطابقة لجميع مسارات الإدخال الثلاثة
 */
export interface UnifiedReceptionResponse {
  /** النص الخام المُعاد بناؤه من المستند أو اللصق */
  rawText: string;
  /** تسلسل العناصر المستخرجة والمطبعة */
  elements: UnifiedReceptionElement[];
  /** بيانات وصفية عن عملية الاستخراج */
  extractionMeta: {
    sourceType: ReceptionSourceType;
    processingTimeMs: number;
    success: boolean;
    error?: string;
  };
}

/**
 * مرحلة من مراحل المعالجة
 */
export type PipelineStage =
  | "extraction"
  | "local_classification"
  | "suspicion_engine"
  | "review_layer";

/**
 * حالة المرحلة
 */
export type PipelineStageStatus = "started" | "completed" | "failed";

/**
 * حدث تتبع مرحلة معالجة — لضمان (FR-017 / SC-010)
 */
export interface PipelineTelemetryEvent {
  /** معرف عملية الاستيراد — يربط جميع الأحداث لعملية واحدة */
  importOpId: string;
  /** المرحلة الحالية */
  stage: PipelineStage;
  /** حالة المرحلة */
  status: PipelineStageStatus;
  /** نوع المصدر */
  sourceType: ReceptionSourceType;
  /** الطابع الزمني */
  timestamp: number;
  /** المدة بالمللي ثانية (عند الاكتمال أو الفشل) */
  durationMs?: number;
  /** تفاصيل الخطأ (عند الفشل فقط) */
  errorDetails?: {
    message: string;
    stack?: string;
  };
}
