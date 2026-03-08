import type { MultiPassConflictEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

// يكشف التعارض بين تمريرة المضي للأمام وتمريرة العكس
export const detectReverseConflict: DetectorFn = (trace, _line, context) => {
  const forwardVote = trace.passVotes.find((v) => v.stage === "forward");
  const reverseVote = trace.passVotes.find((v) => v.stage === "reverse");

  if (forwardVote === undefined || reverseVote === undefined) {
    return [];
  }

  if (forwardVote.suggestedType === reverseVote.suggestedType) {
    return [];
  }

  const confidenceDelta = Math.abs(
    forwardVote.confidence - reverseVote.confidence
  );

  const conflictSeverity: "minor" | "moderate" | "severe" =
    confidenceDelta < 0.2
      ? "severe"
      : confidenceDelta < 0.4
        ? "moderate"
        : "minor";

  // الدرجة: 0.4 (تعارض بسيط) → 0.7 (تعارض حاد مع فارق ثقة ضئيل)
  const score =
    conflictSeverity === "minor"
      ? 0.4
      : conflictSeverity === "moderate"
        ? 0.55
        : 0.7;

  const { dominantType, minorityType } = context.features.crossPass;

  if (dominantType === null || minorityType === null) {
    return [];
  }

  const evidence: MultiPassConflictEvidence = {
    signalType: "multi-pass-conflict",
    conflictingVotes: [
      {
        stage: "forward",
        suggestedType: forwardVote.suggestedType,
        confidence: forwardVote.confidence,
      },
      {
        stage: "reverse",
        suggestedType: reverseVote.suggestedType,
        confidence: reverseVote.confidence,
      },
    ],
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
      reasonCode: "REVERSE_FORWARD_CONFLICT",
      message: `تعارض بين التمريرة الأمامية (${forwardVote.suggestedType}) والعكسية (${reverseVote.suggestedType}) — فارق الثقة: ${confidenceDelta.toFixed(2)}`,
      suggestedType: dominantType,
      evidence,
      debug: {
        forwardType: forwardVote.suggestedType,
        reverseType: reverseVote.suggestedType,
        forwardConfidence: forwardVote.confidence,
        reverseConfidence: reverseVote.confidence,
        confidenceDelta,
        conflictSeverity,
      },
    }),
  ];
};
