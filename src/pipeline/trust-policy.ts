/**
 * @module pipeline/trust-policy
 * @description Structured Input Trust Policy — المرحلة 1 من إعادة الهيكلة
 *
 * يُحدد مستويات الثقة للمدخلات المهيكلة ويقرر مسار المعالجة:
 * - trusted_structured → استيراد مباشر كعقد + فحص خلفي
 * - semi_structured → fallback مناسب مع تصنيف جزئي
 * - raw_text → المصنف النصي الكامل (paste-classifier)
 *
 * الثقة هنا ليست "بنية لغوية عربية جاهزة" بل "بنية تشغيلية داخلية
 * ناتجة من التطبيق/الاستخراج الداخلي".
 */

// ─── مستويات الثقة ──────────────────────────────────────────────

export type InputTrustLevel =
  | "trusted_structured"
  | "semi_structured"
  | "raw_text";

// ─── معايير الثقة ───────────────────────────────────────────────

export interface TrustAssessment {
  /** مستوى الثقة المُحدد */
  level: InputTrustLevel;
  /** هل المدخل system-generated */
  isSystemGenerated: boolean;
  /** هل المدخل مُتحقق من المخطط (schema-valid) */
  isSchemaValid: boolean;
  /** هل المدخل مُعلّم بالمصدر (source-tagged) */
  isSourceTagged: boolean;
  /** هل المدخل مُتحقق من السلامة (integrity-checked) */
  isIntegrityChecked: boolean;
  /** مصدر المدخل */
  source: string;
  /** سبب تحديد المستوى */
  reason: string;
  /** إصدار المخطط الرقمي — لدعم هجرة بنية StructuredBlock مستقبلاً */
  schemaVersion: number;
}

/** الإصدار الحالي لمخطط StructuredBlock */
export const CURRENT_SCHEMA_VERSION = 1;

// ─── واجهة كتلة مهيكلة ─────────────────────────────────────────

export interface StructuredBlock {
  /** نوع العنصر */
  type: string;
  /** النص */
  text: string;
  /** بيانات إضافية */
  meta?: Record<string, unknown>;
}

export interface StructuredInput {
  /** الكتل المهيكلة */
  blocks: StructuredBlock[];
  /** المصدر */
  source?: string;
  /** هل وُلّدت من النظام */
  systemGenerated?: boolean;
  /** هل تم التحقق من المخطط */
  schemaValid?: boolean;
  /** هل تم التحقق من السلامة */
  integrityChecked?: boolean;
}

// ─── تحديد مستوى الثقة ─────────────────────────────────────────

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
 * فحص صلاحية المخطط — كل كتلة يجب أن تحتوي type صالح و text غير فارغ.
 */
const validateSchema = (blocks: readonly StructuredBlock[]): boolean => {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  return blocks.every(
    (block) =>
      block &&
      typeof block.type === "string" &&
      VALID_TYPES.has(block.type) &&
      typeof block.text === "string" &&
      block.text.trim().length > 0
  );
};

/**
 * تقييم مستوى الثقة لمدخل مهيكل.
 *
 * القاعدة:
 * - إذا كانت الكتل system-generated + schema-valid + source-tagged + integrity-checked
 *   ⇒ trusted_structured
 * - إذا كانت schema-valid فقط
 *   ⇒ semi_structured
 * - غير ذلك
 *   ⇒ raw_text
 */
export const assessTrustLevel = (input: StructuredInput): TrustAssessment => {
  const isSchemaValid = validateSchema(input.blocks);
  const isSystemGenerated = input.systemGenerated === true;
  const isSourceTagged =
    typeof input.source === "string" && input.source.length > 0;
  const isIntegrityChecked = input.integrityChecked === true;

  if (
    isSystemGenerated &&
    isSchemaValid &&
    isSourceTagged &&
    isIntegrityChecked
  ) {
    return {
      level: "trusted_structured",
      isSystemGenerated,
      isSchemaValid,
      isSourceTagged,
      isIntegrityChecked,
      source: input.source ?? "unknown",
      reason: "جميع معايير الثقة مستوفاة — استيراد مباشر مع فحص خلفي",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  }

  if (isSchemaValid) {
    return {
      level: "semi_structured",
      isSystemGenerated,
      isSchemaValid,
      isSourceTagged,
      isIntegrityChecked,
      source: input.source ?? "unknown",
      reason: "المخطط صالح لكن معايير الثقة غير مكتملة",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  }

  return {
    level: "raw_text",
    isSystemGenerated,
    isSchemaValid,
    isSourceTagged,
    isIntegrityChecked,
    source: input.source ?? "unknown",
    reason: "المدخل غير مهيكل أو المخطط غير صالح — fallback للمصنف النصي",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
};

// ─── مسار المعالجة ─────────────────────────────────────────────

export type ImportAction =
  | "direct_import" // استيراد مباشر كعقد
  | "direct_import_with_bg_check" // استيراد مباشر + فحص خلفي
  | "fallback_to_classifier"; // المصنف النصي الكامل

/**
 * تحديد مسار المعالجة بناءً على مستوى الثقة.
 */
export const resolveImportAction = (level: InputTrustLevel): ImportAction => {
  switch (level) {
    case "trusted_structured":
      return "direct_import_with_bg_check";
    case "semi_structured":
      return "fallback_to_classifier";
    case "raw_text":
      return "fallback_to_classifier";
  }
};
