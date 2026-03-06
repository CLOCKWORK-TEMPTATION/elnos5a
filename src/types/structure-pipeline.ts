/**
 * @module types/structure-pipeline
 * @description أنماط خط أنابيب الهيكلة — تُعرّف سياسات الدمج والتصنيف ونتائج المعالجة
 *
 * خط أنابيب الهيكلة يُحوّل النص المُستخرج من الملفات إلى كتل سيناريو مُصنّفة.
 * يدعم سياسات دمج مختلفة (none/safe/aggressive) وأدوار مُصنّف مختلفة.
 *
 * @see utils/file-import/structure-pipeline.ts — التنفيذ الفعلي
 */

import type { ScreenplayBlock } from "../utils/file-import/document-model";

/**
 * سياسة الدمج — تُحدد مدى عدوانية دمج الأسطر المتتالية في كتلة واحدة
 * - `none` — لا دمج: كل سطر كتلة مستقلة
 * - `safe` — دمج آمن: دمج الأسطر المتتالية من نفس النوع فقط
 * - `aggressive` — دمج عدواني: دمج مع إعادة تصنيف محتملة
 */
export type StructurePipelineMergePolicy = "none" | "safe" | "aggressive";

/**
 * دور المُصنّف — يُحدد صلاحيات المُصنّف في تعديل المحتوى
 * - `label-only` — تسمية فقط: يُصنّف النوع دون تعديل النص
 * - `limited-rewrite` — إعادة كتابة محدودة: يُصحّح التنسيق البسيط
 */
export type StructurePipelineClassifierRole = "label-only" | "limited-rewrite";

/**
 * ملف تعريف خط الأنابيب — يُحدد مجموعة القواعد المُطبّقة
 * - `strict-structure` — هيكلة صارمة: قواعد تصنيف محافظة
 * - `interactive-legacy` — تفاعلي قديم: توافق مع السلوك السابق
 */
export type StructurePipelineProfile =
  | "strict-structure"
  | "interactive-legacy";

/**
 * سياسة خط أنابيب الهيكلة — تجمع بين سياسة الدمج ودور المُصنّف
 *
 * @property mergePolicy - سياسة دمج الأسطر المتتالية
 * @property classifierRole - صلاحيات المُصنّف في تعديل المحتوى
 */
export interface StructurePipelinePolicy {
  mergePolicy: StructurePipelineMergePolicy;
  classifierRole: StructurePipelineClassifierRole;
}

/**
 * نتيجة خط أنابيب الهيكلة — المُخرج النهائي بعد المعالجة الكاملة
 *
 * @property normalizedText - النص بعد التطبيع (إزالة أسطر فارغة مكررة، توحيد المسافات)
 * @property normalizedLines - مصفوفة الأسطر المُطبّعة
 * @property blocks - كتل السيناريو المُصنّفة النهائية
 * @property policy - السياسة المُستخدمة في هذه العملية
 */
export interface StructurePipelineResult {
  normalizedText: string;
  normalizedLines: string[];
  blocks: ScreenplayBlock[];
  policy: StructurePipelinePolicy;
}

/**
 * تقرير حارس الإسقاط — يمنع الكتابة فوق مستند موجود بمحتوى رديء الجودة
 *
 * يفحص نسبة الكتل غير الحدثية (non-action) في المُخرج مقارنة بالمستند الحالي.
 * إذا كانت النسبة منخفضة جداً، يرفض الإسقاط لحماية المحتوى الموجود.
 *
 * @property accepted - هل تم قبول الإسقاط
 * @property reasons - أسباب القبول أو الرفض
 * @property inputLineCount - عدد أسطر المُدخل الأصلي
 * @property outputBlockCount - عدد الكتل في المُخرج
 * @property currentBlockCount - عدد كتل المستند الحالي (اختياري — إذا كان المستند فارغاً)
 * @property currentNonActionCount - عدد الكتل غير الحدثية في المستند الحالي (اختياري)
 * @property outputNonActionCount - عدد الكتل غير الحدثية في المُخرج
 * @property fallbackApplied - هل طُبّق سلوك بديل (مثل استيراد كنص عادي)
 */
export interface ProjectionGuardReport {
  accepted: boolean;
  reasons: string[];
  inputLineCount: number;
  outputBlockCount: number;
  currentBlockCount?: number;
  currentNonActionCount?: number;
  outputNonActionCount: number;
  fallbackApplied: boolean;
}

/**
 * السياسة الافتراضية لخط أنابيب الهيكلة — لا دمج + تسمية فقط
 */
export const DEFAULT_STRUCTURE_PIPELINE_POLICY: StructurePipelinePolicy = {
  mergePolicy: "none",
  classifierRole: "label-only",
};
