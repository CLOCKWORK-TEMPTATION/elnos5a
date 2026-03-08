/**
 * @module types/final-review
 * @description Command API v2 — عقد المراجعة النهائية `POST /api/final-review`
 */

import type { LineType } from "./screenplay";
import type {
  GateBreakEvidence,
  AlternativePullEvidence,
  ContextContradictionEvidence,
  RawCorruptionEvidence,
  MultiPassConflictEvidence,
  SourceRiskEvidence,
  PassStage,
  RepairType,
  FinalDecisionMethod,
  ImportSource,
} from "@/suspicion-engine/types";
import type { AgentResponseStatus, AgentCommand } from "./agent-review";

// ─── T001 — أنواع الطلب ──────────────────────────────────────────

// ─── تلميحات مصدر السطر ─────────────────────────────────────────

/**
 * معلومات مصدر الاستيراد وجودة السطر الخام
 */
export interface FinalReviewSourceHintsPayload {
  /** مصدر الاستيراد (paste, pdf, docx, …) */
  readonly importSource: ImportSource;
  /** درجة جودة السطر (0-1) */
  readonly lineQualityScore: number;
  /** نسبة الحروف العربية (0-1) */
  readonly arabicRatio: number;
  /** نسبة الحروف الغريبة (0-1) */
  readonly weirdCharRatio: number;
  /** هل يحتوي السطر على علامات هيكلية */
  readonly hasStructuralMarkers: boolean;
  /** رقم الصفحة — null إذا كانت غير متاحة */
  readonly pageNumber: number | null;
}

// ─── سطر سياقي محيط ─────────────────────────────────────────────

/**
 * سطر سياقي محيط بالسطر المشبوه (offset من -2 إلى +2، باستثناء 0)
 */
export interface FinalReviewContextLine {
  /** فهرس السطر في المستند الأصلي */
  readonly lineIndex: number;
  /** نص السطر */
  readonly text: string;
  /** النوع المُعيّن محلياً */
  readonly assignedType: LineType;
  /** الإزاحة بالنسبة للسطر المشبوه */
  readonly offset: number;
}

// ─── حمولة الأدلة ───────────────────────────────────────────────

/**
 * مجموعة الأدلة المصنّفة حسب عائلة الإشارة
 */
export interface FinalReviewEvidencePayload {
  /** أدلة كسر البوابات */
  readonly gateBreaks: readonly GateBreakEvidence[];
  /** أدلة الجذب نحو نوع بديل */
  readonly alternativePulls: readonly AlternativePullEvidence[];
  /** أدلة التناقض السياقي */
  readonly contextContradictions: readonly ContextContradictionEvidence[];
  /** أدلة تلف النص الخام */
  readonly rawCorruptionSignals: readonly RawCorruptionEvidence[];
  /** أدلة تعارض التمريرات المتعددة */
  readonly multiPassConflicts: readonly MultiPassConflictEvidence[];
  /** أدلة مخاطر المصدر */
  readonly sourceRisks: readonly SourceRiskEvidence[];
}

// ─── تتبع التصنيف — تصويت التمريرة ─────────────────────────────

/**
 * تصويت تمريرة واحدة في سلسلة التصنيف
 */
export interface PassVote {
  /** مرحلة التمريرة */
  readonly stage: PassStage;
  /** النوع المقترح من هذه التمريرة */
  readonly suggestedType: LineType;
  /** درجة الثقة (0-1) */
  readonly confidence: number;
  /** رمز السبب */
  readonly reasonCode: string;
}

// ─── تتبع التصنيف — إصلاح السطر ─────────────────────────────────

/**
 * إصلاح واحد طُبّق على السطر قبل التصنيف أو أثناءه
 */
export interface LineRepair {
  /** نوع الإصلاح المُطبّق */
  readonly repairType: RepairType;
  /** نص السطر قبل الإصلاح */
  readonly textBefore: string;
  /** نص السطر بعد الإصلاح */
  readonly textAfter: string;
  /** وقت تطبيق الإصلاح (timestamp) */
  readonly appliedAt: number;
}

// ─── تتبع التصنيف — القرار النهائي ─────────────────────────────

/**
 * القرار النهائي الذي أفرزته سلسلة التصنيف
 */
export interface FinalDecision {
  /** النوع المُعيّن نهائياً */
  readonly assignedType: LineType;
  /** درجة الثقة (0-1) */
  readonly confidence: number;
  /** طريقة اتخاذ القرار */
  readonly method: FinalDecisionMethod;
}

// ─── ملخص التتبع ─────────────────────────────────────────────────

/**
 * ملخص مسار تصنيف سطر واحد عبر جميع التمريرات
 */
export interface FinalReviewTraceSummary {
  /** تصويتات كل تمريرة */
  readonly passVotes: readonly PassVote[];
  /** الإصلاحات المُطبّقة */
  readonly repairs: readonly LineRepair[];
  /** القرار النهائي */
  readonly finalDecision: FinalDecision;
}

// ─── قواعد المخطط ────────────────────────────────────────────────

/**
 * قاعدة بوابة واحدة من مخطط تحقق النوع
 */
export interface SchemaGateRule {
  /** نوع السطر الذي تنطبق عليه القاعدة */
  readonly lineType: string;
  /** معرف القاعدة */
  readonly ruleId: string;
  /** وصف القاعدة */
  readonly description: string;
}

// ─── تلميحات المخطط ─────────────────────────────────────────────

/**
 * تلميحات المخطط المُرسلة للوكيل لتوجيه قراراته
 */
export interface FinalReviewSchemaHints {
  /** الأنواع المسموح بها */
  readonly allowedLineTypes: readonly string[];
  /** وصف عربي مختصر لكل نوع */
  readonly lineTypeDescriptions: Readonly<Record<string, string>>;
  /** قواعد البوابات الهيكلية */
  readonly gateRules: readonly SchemaGateRule[];
}

/**
 * القيم الافتراضية لتلميحات المخطط — تُستخدم إذا لم تُمرَّر تلميحات صريحة
 */
export const DEFAULT_FINAL_REVIEW_SCHEMA_HINTS = {
  allowedLineTypes: [
    "action",
    "dialogue",
    "character",
    "scene_header_1",
    "scene_header_2",
    "scene_header_3",
    "transition",
    "parenthetical",
    "basmala",
  ],
  lineTypeDescriptions: {
    action: "وصف الحدث والمشهد",
    dialogue: "نص الحوار المنطوق",
    character: "اسم الشخصية فوق الحوار",
    scene_header_1: "رأس المشهد الرئيسي",
    scene_header_2: "رأس المشهد الفرعي",
    scene_header_3: "وصف زمني أو مكاني للمشهد",
    transition: "انتقال بين المشاهد",
    parenthetical: "توجيه أدائي بين قوسين",
    basmala: "البسملة في بداية المستند",
  },
  gateRules: [],
} as const satisfies FinalReviewSchemaHints;

// ─── حمولة السطر المشبوه ─────────────────────────────────────────

/**
 * بيانات سطر مشبوه واحد ضمن طلب المراجعة النهائية
 */
export interface FinalReviewSuspiciousLinePayload {
  /** معرف العنصر الفريد */
  readonly itemId: string;
  /** فهرس السطر في المستند */
  readonly lineIndex: number;
  /** النص الحرفي للسطر */
  readonly text: string;
  /** النوع المُعيّن محلياً */
  readonly assignedType: LineType;
  /** بصمة العنصر وقت الإرسال */
  readonly fingerprint: string;
  /** درجة الشك الإجمالية (0-100) */
  readonly suspicionScore: number;
  /** نطاق التوجيه */
  readonly routingBand: "agent-candidate" | "agent-forced";
  /** هل السطر حالة حرجة */
  readonly critical: boolean;
  /** النوع البديل الأقوى المقترح */
  readonly primarySuggestedType: LineType | null;
  /** عدد عائلات الإشارات المختلفة */
  readonly distinctSignalFamilies: number;
  /** إجمالي عدد الإشارات */
  readonly signalCount: number;
  /** رموز أسباب الشك */
  readonly reasonCodes: readonly string[];
  /** رسائل الإشارات القابلة للقراءة */
  readonly signalMessages: readonly string[];
  /** تلميحات مصدر السطر */
  readonly sourceHints: FinalReviewSourceHintsPayload;
  /** الأدلة المفصّلة حسب العائلة */
  readonly evidence: FinalReviewEvidencePayload;
  /** ملخص مسار التصنيف */
  readonly trace: FinalReviewTraceSummary;
  /** الأسطر السياقية المحيطة */
  readonly contextLines: readonly FinalReviewContextLine[];
}

// ─── حمولة الطلب الكاملة ────────────────────────────────────────

/**
 * حمولة طلب المراجعة النهائية الكاملة (الواجهة → السيرفر)
 */
export interface FinalReviewRequestPayload {
  /** إصدار حزمة البيانات */
  readonly packetVersion: string;
  /** إصدار مخطط العقد */
  readonly schemaVersion: string;
  /** معرف عملية الاستيراد */
  readonly importOpId: string;
  /** معرف الجلسة الحالية */
  readonly sessionId: string;
  /** إجمالي الأسطر المفحوصة */
  readonly totalReviewed: number;
  /** الأسطر المشبوهة المُرسلة للمراجعة */
  readonly suspiciousLines: readonly FinalReviewSuspiciousLinePayload[];
  /** itemIds المطلوب حسمها */
  readonly requiredItemIds: readonly string[];
  /** itemIds الإلزامية */
  readonly forcedItemIds: readonly string[];
  /** تلميحات المخطط لتوجيه الوكيل */
  readonly schemaHints: FinalReviewSchemaHints;
  /** تمثيل نصي منسّق للحزمة (اختياري) */
  readonly reviewPacketText?: string;
}

// ─── T002 — أنواع الاستجابة ──────────────────────────────────────

export type {
  RelabelCommand,
  SplitCommand,
  AgentCommand,
  CommandOp,
  AgentResponseStatus,
} from "./agent-review";

export {
  AGENT_API_VERSION,
  AGENT_API_MODE,
  VALID_COMMAND_OPS,
  VALID_AGENT_LINE_TYPES,
} from "./agent-review";

// ─── بيانات التشخيص والتغطية ────────────────────────────────────

/**
 * بيانات تشخيصية مرفقة باستجابة المراجعة النهائية
 */
export interface FinalReviewResponseMeta {
  /** إجمالي رموز الإدخال المستهلكة (null إذا غير متاحة) */
  readonly totalInputTokens: number | null;
  /** إجمالي رموز الإخراج المُنتجة (null إذا غير متاحة) */
  readonly totalOutputTokens: number | null;
  /** عدد مرات إعادة المحاولة */
  readonly retryCount: number;
  /** itemIds التي حُسمت بنجاح */
  readonly resolvedItemIds: readonly string[];
  /** itemIds التي لم يُعثر عليها في الاستجابة */
  readonly missingItemIds: readonly string[];
  /** هل الاستجابة مزيّفة (mock) */
  readonly isMockResponse: boolean;
}

// ─── حمولة الاستجابة ─────────────────────────────────────────────

/**
 * حمولة استجابة المراجعة النهائية (السيرفر → الواجهة)
 */
export interface FinalReviewResponsePayload {
  /** إصدار العقد — يجب أن يكون "2.0" */
  readonly apiVersion: "2.0";
  /** وضع التطبيق */
  readonly mode: "auto-apply";
  /** معرف عملية الاستيراد — يجب مطابقة الطلب */
  readonly importOpId: string;
  /** معرف الطلب الفريد — للـ idempotency */
  readonly requestId: string;
  /** حالة الاستجابة */
  readonly status: AgentResponseStatus;
  /** الأوامر المُعتمدة */
  readonly commands: readonly AgentCommand[];
  /** رسالة نصية وصفية */
  readonly message: string;
  /** زمن الاستجابة بالميلي ثانية */
  readonly latencyMs: number;
  /** بيانات تشخيصية (اختياري) */
  readonly meta?: FinalReviewResponseMeta;
  /** موديل الوكيل المستخدم (اختياري) */
  readonly model?: string;
}

// ─── إحصائيات التوجيه ───────────────────────────────────────────

/**
 * إحصائيات توزيع الأسطر على نطاقات التوجيه
 */
export interface ReviewRoutingStats {
  /** عدد الأسطر التي اجتازت مباشرة */
  readonly countPass: number;
  /** عدد الأسطر التي خضعت للمراجعة المحلية */
  readonly countLocalReview: number;
  /** عدد الأسطر المُرشحة للوكيل */
  readonly countAgentCandidate: number;
  /** عدد الأسطر الإلزامية للوكيل */
  readonly countAgentForced: number;
}

// ─── ثابت الأنواع المسموحة ──────────────────────────────────────

/**
 * مجموعة الأنواع المسموح بها في المراجعة النهائية
 */
export const ALLOWED_LINE_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);
