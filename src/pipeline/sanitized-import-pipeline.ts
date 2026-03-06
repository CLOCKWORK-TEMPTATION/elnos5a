/**
 * @module pipeline/sanitized-import-pipeline
 * @description خط أنابيب الاستيراد المُنظَّف — مسار مستقل للملفات الشاذة
 *
 * يكشف الملفات ذات التنسيقات غير القياسية (مثل بادئات `[pStyle=-]` من Word)
 * وينظفها قبل تمريرها للتصنيف والمراجعة والوكيل.
 *
 * التدفق:
 * ```
 * نص خام → كشف (needsSanitization) → تنظيف (sanitizeInput)
 *         → تصنيف → مراجعة لاحقة → self-check → وكيل AI
 * ```
 *
 * هذا المسار مستقل تماماً عن:
 * - مسار اللصق (`paste-classifier`)
 * - مسار DOC/DOCX (`import-classified-text`)
 * - مسار الكتل البنيوية (`import-structured-blocks`)
 */

import { logger } from "@/utils/logger";
import type { SanitizationReport } from "./input-sanitizer";
import { needsSanitization, sanitizeInput } from "./input-sanitizer";

const sanitizedPipelineLogger = logger.createScope("pipeline.sanitized-import");

// ─── الأنواع ─────────────────────────────────────────────────────

/** نتيجة تشغيل خط أنابيب التنظيف */
export interface SanitizedImportResult {
  /** النص بعد التنظيف (جاهز للتصنيف) */
  readonly cleanText: string;
  /** النص الأصلي قبل التنظيف */
  readonly originalText: string;
  /** هل تم تعديل النص */
  readonly wasModified: boolean;
  /** تقرير التنظيف المفصل */
  readonly sanitizationReport: SanitizationReport;
}

// ─── الدوال المصدّرة ─────────────────────────────────────────────

/**
 * يتحقق مما إذا كان النص يحتاج للمرور عبر خط أنابيب التنظيف.
 *
 * يُستخدم في {@link buildFileOpenPipelineAction} لتوجيه الملفات الشاذة
 * إلى مسار `import-sanitized-text` بدلاً من المسار العادي.
 */
export function shouldUseSanitizedPipeline(text: string): boolean {
  return needsSanitization(text);
}

/**
 * يُنفّذ خط أنابيب التنظيف على النص الخام.
 *
 * 1. يكتشف التنسيقات غير القياسية
 * 2. ينظف النص (حذف بادئات، وسوم XML، أكواد حقول، إلخ)
 * 3. يُسجّل telemetry
 * 4. يُرجع النص النظيف جاهزاً للتصنيف
 *
 * @param text - النص الخام المستورد
 * @returns نتيجة التنظيف مع التقرير
 */
export function runSanitizedImportPipeline(
  text: string
): SanitizedImportResult {
  const sanitized = sanitizeInput(text);

  if (sanitized.report.wasModified) {
    const appliedRules = sanitized.report.rulesApplied
      .filter((r) => r.applied)
      .map((r) => r.ruleId);

    sanitizedPipelineLogger.telemetry("sanitized-pipeline-executed", {
      inputLines: sanitized.report.inputLineCount,
      outputLines: sanitized.report.outputLineCount,
      totalMatches: sanitized.report.totalMatchCount,
      rulesApplied: appliedRules,
      durationMs: sanitized.report.durationMs,
    });
  }

  return {
    cleanText: sanitized.text,
    originalText: text,
    wasModified: sanitized.report.wasModified,
    sanitizationReport: sanitized.report,
  };
}
