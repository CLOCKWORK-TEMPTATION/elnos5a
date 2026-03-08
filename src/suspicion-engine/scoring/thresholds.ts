import type { SuspicionBand, BandThresholds } from "@/suspicion-engine/types";

// ─── assignBand ───────────────────────────────────────────────────────────────

/**
 * تحويل الدرجة الرقمية إلى نطاق شبهة.
 *
 * النطاقات (بناءً على عتبات السياسة):
 * - score < localReviewMin        → 'pass'
 * - score < agentCandidateMin     → 'local-review'
 * - score < agentForcedMin        → 'agent-candidate'
 * - score >= agentForcedMin       → 'agent-forced'
 *
 * @param score - الدرجة الإجمالية للشبهة
 * @param thresholds - عتبات النطاقات من السياسة الحالية
 * @returns نطاق الشبهة المناسب
 */
export function assignBand(
  score: number,
  thresholds: BandThresholds
): SuspicionBand {
  if (score < thresholds.localReviewMin) return "pass";
  if (score < thresholds.agentCandidateMin) return "local-review";
  if (score < thresholds.agentForcedMin) return "agent-candidate";
  return "agent-forced";
}
