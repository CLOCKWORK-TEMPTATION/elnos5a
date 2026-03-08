import type {
  SuspicionSignal,
  SuspicionCase,
  SuspicionWeightPolicy,
  ClassificationTrace,
} from "@/suspicion-engine/types";
import type { ClassifiedDraft } from "@/extensions/classification-types";
import {
  aggregateEvidence,
  derivePrimarySuggestedType,
} from "@/suspicion-engine/aggregation/evidence-aggregator";
import { calculateSuspicionScore } from "@/suspicion-engine/scoring/score-calculator";
import { assignBand } from "@/suspicion-engine/scoring/thresholds";

// ─── BuildSuspicionCaseParams ─────────────────────────────────────────────────

export interface BuildSuspicionCaseParams {
  readonly lineIndex: number;
  readonly classifiedLine: ClassifiedDraft;
  readonly trace: ClassificationTrace;
  readonly signals: readonly SuspicionSignal[];
  readonly policy: SuspicionWeightPolicy;
}

// ─── buildSuspicionCase ───────────────────────────────────────────────────────

/**
 * بناء حالة الشبهة الكاملة لسطر واحد.
 *
 * التدفق:
 * 1. aggregateEvidence    — توزيع الإشارات على العائلات الخمس
 * 2. calculateSuspicionScore — حساب الدرجة المرجحة متعددة العوامل
 * 3. assignBand           — تحويل الدرجة إلى نطاق قرار
 * 4. تجميع SuspicionCase  — الحالة الكاملة بجميع حقولها
 *
 * `critical` يكون true في حالتين:
 * - النطاق هو 'agent-forced'
 * - أي إشارة في القائمة تتجاوز درجة 0.8 (حرج مطلق بمقياس 0–1)
 *
 * @param params - معاملات البناء
 * @returns حالة الشبهة الكاملة
 */
export function buildSuspicionCase(
  params: BuildSuspicionCaseParams
): SuspicionCase {
  const { lineIndex, classifiedLine, trace, signals, policy } = params;

  // ── الخطوة 1: تجميع الأدلة في عائلاتها ──────────────────────────────────
  const summary = aggregateEvidence(signals);

  // ── الخطوة 2: حساب درجة الشبهة ──────────────────────────────────────────
  const score = calculateSuspicionScore(signals, policy);

  // ── الخطوة 3: تحديد النطاق ───────────────────────────────────────────────
  const band = assignBand(score, policy.bandThresholds);

  // ── الخطوة 4: حساب خاصية critical ───────────────────────────────────────
  const hasCriticalSignalScore = signals.some((s) => s.score > 0.8);
  const critical = band === "agent-forced" || hasCriticalSignalScore;

  // ── الخطوة 5: استخراج النوع المقترح الأغلب ───────────────────────────────
  const primarySuggestedType = derivePrimarySuggestedType(signals);

  return {
    lineIndex,
    classifiedLine,
    trace,
    signals,
    summary,
    score,
    band,
    critical,
    primarySuggestedType,
  };
}
