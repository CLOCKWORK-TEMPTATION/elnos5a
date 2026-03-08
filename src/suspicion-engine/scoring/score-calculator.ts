import type {
  SuspicionSignal,
  SuspicionWeightPolicy,
} from "@/suspicion-engine/types";
import type { ElementType } from "@/extensions/classification-types";
import { applyWeights } from "@/suspicion-engine/scoring/weighting-policy";

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * يحسب عدد العائلات المختلفة الحاضرة في قائمة الإشارات.
 */
function countDistinctFamilies(signals: readonly SuspicionSignal[]): number {
  const families = new Set<string>();
  for (const s of signals) families.add(s.family);
  return families.size;
}

/**
 * يتحقق هل توجد أي إشارة تتجاوز عتبة الدرجة الحرجة (0.7 على مقياس 0–1).
 *
 * الإشارات مُخزَّنة بمقياس 0–1، والعتبة الحرجة 0.7 × 100 = 70 على مقياس 0–100.
 */
function hasCriticalSignal(signals: readonly SuspicionSignal[]): boolean {
  return signals.some((s) => s.score > 0.7);
}

/**
 * يتحقق هل تقترح إشارتان أو أكثر النوع نفسه (تصويت أغلبية).
 */
function hasConsensusType(signals: readonly SuspicionSignal[]): boolean {
  const typeCounts = new Map<ElementType, number>();
  for (const s of signals) {
    if (s.suggestedType !== null) {
      const prev = typeCounts.get(s.suggestedType) ?? 0;
      typeCounts.set(s.suggestedType, prev + 1);
    }
  }
  for (const count of typeCounts.values()) {
    if (count >= 2) return true;
  }
  return false;
}

// ─── calculateSuspicionScore ──────────────────────────────────────────────────

/**
 * حساب درجة الشبهة المركبة متعددة العوامل (FR-006).
 *
 * الخوارزمية:
 * 1. تجميع الإشارات حسب العائلة وتطبيق الأوزان → درجة أساسية
 * 2. تطبيق مُعاملات التعزيز (ضرب الدرجة الأساسية):
 *    - diversityBoost: إذا وُجدت إشارات من عائلتين أو أكثر
 *    - criticalMismatchBoost: إذا كانت أي إشارة > 0.7
 *    - consensusTypeBoost: إذا اقترحت إشارتان أو أكثر النوع ذاته
 * 3. تطبيق مُعاملات العقوبة (ضرب الدرجة):
 *    - singleFamilyDiscount: إذا كانت جميع الإشارات من عائلة واحدة
 * 4. تثبيت النتيجة في [0, 100]
 *
 * الدرجة النهائية بمقياس 0–100 تتوافق مع عتبات النطاقات في السياسة.
 *
 * @param signals - الإشارات المرصودة للسطر
 * @param policy - سياسة الأوزان والعتبات
 * @returns درجة الشبهة في النطاق [0, 100]
 */
export function calculateSuspicionScore(
  signals: readonly SuspicionSignal[],
  policy: SuspicionWeightPolicy
): number {
  if (signals.length === 0) return 0;

  const { familyWeights, boostFactors, penaltyFactors } = policy;

  // ── الخطوة 1: الدرجة الأساسية المرجحة ──────────────────────────────────────
  // applyWeights تُعيد max(score) * familyWeight لكل عائلة (مقياس 0–1 × وزن)
  const weightedByFamily = applyWeights(signals, familyWeights);
  let baseScore = 0;
  for (const weightedScore of weightedByFamily.values()) {
    baseScore += weightedScore;
  }
  // تحويل من مقياس 0–1 إلى 0–100
  baseScore *= 100;

  // ── الخطوة 2: تطبيق التعزيزات (مُعاملات ضرب) ────────────────────────────
  const distinctFamilies = countDistinctFamilies(signals);

  if (distinctFamilies >= 2) {
    baseScore *= boostFactors.diversityBoost;
  }

  if (hasCriticalSignal(signals)) {
    baseScore *= boostFactors.criticalMismatchBoost;
  }

  if (hasConsensusType(signals)) {
    baseScore *= boostFactors.consensusTypeBoost;
  }

  // ── الخطوة 3: تطبيق العقوبات (مُعاملات ضرب) ─────────────────────────────
  if (distinctFamilies === 1) {
    // singleFamilyDiscount في السياسة هو معامل الاحتفاظ (e.g., 0.8 = خصم 20%)
    baseScore *= penaltyFactors.singleFamilyDiscount;
  }

  // ── الخطوة 4: تثبيت النتيجة في [0, 100] ─────────────────────────────────
  return Math.min(100, Math.max(0, baseScore));
}
