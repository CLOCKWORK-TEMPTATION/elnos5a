import type {
  SuspicionSignal,
  SignalFamily,
  FamilyWeights,
} from "@/suspicion-engine/types";

// ─── Family → Weight Key Mapping ─────────────────────────────────────────────

const FAMILY_TO_WEIGHT_KEY: Record<SignalFamily, keyof FamilyWeights> = {
  "gate-break": "gateBreak",
  context: "contextContradiction",
  corruption: "rawCorruption",
  "cross-pass": "multiPassConflict",
  source: "sourceRisk",
};

// ─── applyWeights ─────────────────────────────────────────────────────────────

/**
 * تجميع الإشارات حسب العائلة وتطبيق الوزن على أعلى درجة في كل عائلة.
 *
 * لكل عائلة: max(score) * familyWeight
 *
 * @param signals - قائمة الإشارات المرصودة
 * @param familyWeights - أوزان العائلات من السياسة الحالية
 * @returns خريطة من العائلة إلى الدرجة المرجحة
 */
export function applyWeights(
  signals: readonly SuspicionSignal[],
  familyWeights: FamilyWeights
): Map<SignalFamily, number> {
  // تجميع أعلى درجة خام لكل عائلة
  const maxPerFamily = new Map<SignalFamily, number>();

  for (const signal of signals) {
    const current = maxPerFamily.get(signal.family) ?? 0;
    if (signal.score > current) {
      maxPerFamily.set(signal.family, signal.score);
    }
  }

  // تطبيق الوزن على أعلى درجة في كل عائلة
  const weighted = new Map<SignalFamily, number>();

  for (const [family, maxScore] of maxPerFamily) {
    const weightKey = FAMILY_TO_WEIGHT_KEY[family];
    const weight = familyWeights[weightKey];
    weighted.set(family, maxScore * weight);
  }

  return weighted;
}
