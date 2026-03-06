/**
 * @module types/agent-review
 * @description Command API v2 — العقد الرسمي لنقطة النهاية `/api/agent/review`
 *
 * الإصدار: 2.0
 * الوضع: auto-apply (تطبيق تلقائي بدون تدخل المستخدم)
 *
 * التغييرات عن v1:
 * - لا decisions[] — فقط commands[]
 * - الأوامر المعتمدة: relabel, split
 * - split يستخدم splitAt (UTF-16 index) بدون leftText/rightText
 * - importOpId إلزامي لكشف العمليات القديمة (stale)
 * - requestId إلزامي للـ idempotency
 */

import type { LineType } from "./screenplay";

// ─── إصدار العقد ───────────────────────────────────────────────
export const AGENT_API_VERSION = "2.0" as const;
export const AGENT_API_MODE = "auto-apply" as const;

// ─── أنواع الأوامر المسموحة ───────────────────────────────────
export type CommandOp = "relabel" | "split";

// ─── أمر relabel ────────────────────────────────────────────────
export interface RelabelCommand {
  readonly op: "relabel";
  /** معرف العنصر الفريد (وليس الفهرس) */
  readonly itemId: string;
  /** النوع الجديد بعد التصحيح */
  readonly newType: LineType;
  /** درجة ثقة الوكيل (0–1) */
  readonly confidence: number;
  /** تبرير القرار */
  readonly reason: string;
}

// ─── أمر split ──────────────────────────────────────────────────
export interface SplitCommand {
  readonly op: "split";
  /** معرف العنصر المراد تقسيمه */
  readonly itemId: string;
  /**
   * موقع القطع — UTF-16 code-unit index داخل نص العنصر.
   * النص قبل splitAt = الجزء الأيسر.
   * النص من splitAt فصاعداً = الجزء الأيمن.
   */
  readonly splitAt: number;
  /** نوع الجزء الأيسر بعد القطع */
  readonly leftType: LineType;
  /** نوع الجزء الأيمن بعد القطع */
  readonly rightType: LineType;
  /** درجة ثقة الوكيل (0–1) */
  readonly confidence: number;
  /** تبرير القرار */
  readonly reason: string;
}

// ─── اتحاد الأوامر ─────────────────────────────────────────────
export type AgentCommand = RelabelCommand | SplitCommand;

// ─── حالة الاستجابة ─────────────────────────────────────────────
export type AgentResponseStatus = "applied" | "partial" | "skipped" | "error";

// ─── حمولة الطلب (الواجهة → السيرفر) ──────────────────────────
/**
 * سطر سياقي محيط بالسطر المشبوه
 */
export interface AgentReviewContextLine {
  lineIndex: number;
  assignedType: LineType;
  text: string;
}

/**
 * سطر مشبوه واحد — يُرسل ضمن طلب المراجعة
 */
export interface AgentSuspiciousLinePayload {
  /** معرف فريد (UUID أو مُولّد) */
  itemId: string;
  /** فهرس السطر في المستند الأصلي */
  lineIndex: number;
  /** النص الحرفي */
  text: string;
  /** النوع المُعيّن محلياً */
  assignedType: LineType;
  /** بصمة العنصر وقت الإرسال */
  fingerprint: string;
  /** درجة الشك الإجمالية (0-100) */
  totalSuspicion: number;
  /** أسباب الشك */
  reasons: string[];
  /** أسطر محيطة لتوفير السياق */
  contextLines: AgentReviewContextLine[];
  /** سكور التصعيد النهائي */
  escalationScore?: number;
  /** مسار التصفية */
  routingBand?: "agent-candidate" | "agent-forced";
  /** هل السطر ينتمي لحالة mismatch حرجة */
  criticalMismatch?: boolean;
  /** عدد الكواشف المختلفة */
  distinctDetectors?: number;
}

/**
 * حمولة طلب المراجعة الكاملة
 */
export interface AgentReviewRequestPayload {
  /** معرف عملية الاستيراد — يربط الطلب بالحالة المحلية */
  importOpId: string;
  /** معرف الجلسة */
  sessionId: string;
  /** إجمالي الأسطر المفحوصة */
  totalReviewed: number;
  /** تمثيل نصي مُنسّق (اختياري) */
  reviewPacketText?: string;
  /** الأسطر المشبوهة */
  suspiciousLines: AgentSuspiciousLinePayload[];
  /** itemIds المطلوب حسمها */
  requiredItemIds: string[];
  /** itemIds الإلزامية */
  forcedItemIds: string[];
}

// ─── بيانات تشخيص التغطية ──────────────────────────────────────
export interface AgentReviewResponseMeta {
  requestedCount: number;
  commandCount: number;
  missingItemIds: string[];
  forcedItemIds: string[];
  unresolvedForcedItemIds: string[];
}

// ─── حمولة استجابة الوكيل (السيرفر → الواجهة) ─────────────────
export interface AgentReviewResponsePayload {
  /** إصدار العقد — يجب أن يكون "2.0" */
  apiVersion: typeof AGENT_API_VERSION;
  /** وضع التطبيق */
  mode: typeof AGENT_API_MODE;
  /** معرف عملية الاستيراد — يجب مطابقة الطلب */
  importOpId: string;
  /** معرف الطلب الفريد — للـ idempotency */
  requestId: string;
  /** حالة الاستجابة */
  status: AgentResponseStatus;
  /** الأوامر المُعتمدة */
  commands: AgentCommand[];
  /** رسالة نصية وصفية */
  message: string;
  /** زمن الاستجابة */
  latencyMs: number;
  /** بيانات تشخيصية */
  meta?: AgentReviewResponseMeta;
  /** موديل الوكيل المستخدم (اختياري) */
  model?: string;
}

// ─── قرار الوكيل القديم (v1) — يُحذف لاحقاً ───────────────────
// محذوف: لا decisions[] في v2

// ─── ثوابت التحقق ──────────────────────────────────────────────
export const VALID_COMMAND_OPS = new Set<CommandOp>(["relabel", "split"]);

export const VALID_AGENT_LINE_TYPES = new Set<LineType>([
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
