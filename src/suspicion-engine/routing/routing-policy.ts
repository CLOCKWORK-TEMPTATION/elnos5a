import type {
  SuspicionCase,
  InternalResolutionRoute,
} from "@/suspicion-engine/types";

/**
 * @module routing/routing-policy
 * @description
 * سياسة التوجيه — تُحدّد المسار الداخلي لكل حالة اشتباه بناءً على نطاقها وإشاراتها.
 *
 * الأولويات (من الأعلى إلى الأدنى):
 * 1. pass + لا إشارات → 'none'
 * 2. pass + إشارات gate-break واضحة مع اقتراح → 'auto-local-fix'
 * 3. pass + إشارات تلف (corruption) → 'repair-then-reclassify'
 * 4. local-review → 'local-review'
 * 5. agent-candidate → 'agent-candidate'
 * 6. agent-forced → 'agent-forced'
 */
export function assignRoute(
  suspicionCase: SuspicionCase
): InternalResolutionRoute {
  const { band, signals, primarySuggestedType, summary } = suspicionCase;

  // ── قاعدة 1: نطاق pass بدون إشارات ─────────────────────────────────────
  if (band === "pass" && signals.length === 0) {
    return "none";
  }

  // ── قاعدة 2: نطاق pass مع إشارات gate-break واضحة ومقترح محدد ───────────
  // شرط: وجود اقتراح نوع أساسي + جميع إشارات gate-break قابلة للإصلاح التلقائي
  if (band === "pass" && primarySuggestedType !== null) {
    const gateBreakSignals = summary.gateBreak;
    if (gateBreakSignals.length > 0) {
      return "auto-local-fix";
    }
  }

  // ── قاعدة 3: نطاق pass مع إشارات تلف ───────────────────────────────────
  if (band === "pass" && summary.corruption.length > 0) {
    return "repair-then-reclassify";
  }

  // ── قاعدة 4: نطاق local-review ───────────────────────────────────────────
  if (band === "local-review") {
    return "local-review";
  }

  // ── قاعدة 5: نطاق agent-candidate ────────────────────────────────────────
  if (band === "agent-candidate") {
    return "agent-candidate";
  }

  // ── قاعدة 6: نطاق agent-forced ───────────────────────────────────────────
  return "agent-forced";
}
