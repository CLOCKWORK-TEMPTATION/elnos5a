/**
 * @module extensions/classification-scoring
 * @description منطق حساب درجة التصعيد وتوجيه الشبهات في نظام المراجعة
 */

import type {
  ClassificationMethod,
  ClassifiedLine,
  DetectorFinding,
  SuspicionScoreBreakdown,
} from "./classification-types";

export const calculateTotalSuspicion = (
  findings: readonly DetectorFinding[]
): number => {
  if (findings.length === 0) return 0;
  if (findings.length === 1) return findings[0].suspicionScore;

  const sorted = [...findings].sort(
    (a, b) => b.suspicionScore - a.suspicionScore
  );
  const primary = sorted[0].suspicionScore;
  const secondary = sorted
    .slice(1)
    .reduce((sum, finding) => sum + finding.suspicionScore, 0);

  return Math.min(Math.round(primary + secondary * 0.3), 99);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const computeMethodPenalty = (
  method: ClassificationMethod,
  confidence: number
): number => {
  if (method === "regex") {
    return confidence >= 92 ? 0 : 4;
  }
  if (method === "context") return 8;
  if (method === "fallback") return 14;
  return 6;
};

const computeConfidencePenalty = (originalConfidence: number): number =>
  clamp((82 - originalConfidence) * 0.5, 0, 12);

const computeDiversityBoost = (distinctDetectors: number): number =>
  clamp((distinctDetectors - 1) * 5, 0, 10);

const hasSuggestedType = (findings: readonly DetectorFinding[]): boolean =>
  findings.some((finding) => finding.suggestedType !== null);

export const isCriticalMismatchFromFindings = (
  findings: readonly DetectorFinding[]
): boolean =>
  findings.some(
    (finding) =>
      finding.detectorId === "source-hint-mismatch" ||
      (finding.detectorId === "content-type-mismatch" &&
        finding.suggestedType !== null) ||
      finding.detectorId === "split-character-fragment"
  );

export const computeEscalationScore = (
  line: ClassifiedLine,
  findings: readonly DetectorFinding[],
  totalSuspicion: number
): { score: number; breakdown: SuspicionScoreBreakdown } => {
  const distinctDetectors = new Set(
    findings.map((finding) => finding.detectorId)
  ).size;
  const criticalMismatch = isCriticalMismatchFromFindings(findings);
  const breakdown: SuspicionScoreBreakdown = {
    detectorBase: totalSuspicion,
    methodPenalty: computeMethodPenalty(
      line.classificationMethod,
      line.originalConfidence
    ),
    confidencePenalty: computeConfidencePenalty(line.originalConfidence),
    evidenceDiversityBoost: computeDiversityBoost(distinctDetectors),
    suggestionBoost: hasSuggestedType(findings) ? 6 : 0,
    criticalMismatchBoost: criticalMismatch ? 10 : 0,
  };
  const weightedScore =
    breakdown.detectorBase * 0.92 +
    breakdown.methodPenalty +
    breakdown.confidencePenalty +
    breakdown.evidenceDiversityBoost +
    breakdown.suggestionBoost +
    breakdown.criticalMismatchBoost;

  return {
    score: clamp(Math.round(weightedScore), 0, 99),
    breakdown,
  };
};

export const extractContextWindow = (
  lines: readonly ClassifiedLine[],
  centerIndex: number,
  radius: number
): readonly ClassifiedLine[] => {
  const start = Math.max(0, centerIndex - radius);
  const end = Math.min(lines.length, centerIndex + radius + 1);
  return lines.slice(start, end);
};
