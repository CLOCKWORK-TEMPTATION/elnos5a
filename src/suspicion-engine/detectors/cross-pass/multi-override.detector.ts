import type { MultiPassConflictEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

// يكشف الأسطر التي تعرضت لتجاوز من 3 تمريرات مختلفة أو أكثر
// هذا مؤشر قوي على أن التصنيف غير مستقر بنيوياً
export const detectMultiOverride: DetectorFn = (trace, _line, context) => {
  const { distinctTypes, agreementRatio, dominantType, minorityType } =
    context.features.crossPass;

  if (distinctTypes < 3) {
    return [];
  }

  if (dominantType === null || minorityType === null) {
    return [];
  }

  // الدرجة: تتناسب عكسياً مع نسبة الاتفاق وطردياً مع عدد الأنواع المتميزة
  // النطاق: 0.6 (3 أنواع، اتفاق معقول) → 0.9 (4+ أنواع، اتفاق ضعيف)
  const diversityFactor = Math.min(1, (distinctTypes - 2) / 3);
  const disagreementFactor = 1 - agreementRatio;
  const score = Math.min(
    0.9,
    0.6 + diversityFactor * 0.2 + disagreementFactor * 0.1
  );

  const conflictSeverity: "minor" | "moderate" | "severe" =
    agreementRatio >= 0.6 ? "moderate" : "severe";

  // نجمع أبرز التصويتات المتعارضة للأدلة (نأخذ أول صوت لكل نوع)
  const seenTypes = new Set<string>();
  const conflictingVotes: Array<{
    stage: string;
    suggestedType: typeof dominantType;
    confidence: number;
  }> = [];

  for (const vote of trace.passVotes) {
    if (!seenTypes.has(vote.suggestedType)) {
      seenTypes.add(vote.suggestedType);
      conflictingVotes.push({
        stage: vote.stage,
        suggestedType: vote.suggestedType,
        confidence: vote.confidence,
      });
    }
  }

  const confidenceDelta = trace.finalDecision.confidence - 1 / distinctTypes;

  const evidence: MultiPassConflictEvidence = {
    signalType: "multi-pass-conflict",
    conflictingVotes,
    conflictSeverity,
    dominantType,
    minorityType,
    confidenceDelta,
  };

  return [
    createSignal<MultiPassConflictEvidence>({
      lineIndex: trace.lineIndex,
      family: "cross-pass",
      signalType: "multi-pass-conflict",
      score,
      reasonCode: "MULTI_OVERRIDE_THREE_PLUS_TYPES",
      message: `تجاوزات متعددة: ${distinctTypes} أنواع تصنيف مختلفة عبر التمريرات — نسبة الاتفاق: ${(agreementRatio * 100).toFixed(0)}%`,
      suggestedType: dominantType,
      evidence,
      debug: {
        distinctTypes,
        agreementRatio,
        score,
        conflictSeverity,
        totalVotes: context.features.crossPass.totalVotes,
      },
    }),
  ];
};
