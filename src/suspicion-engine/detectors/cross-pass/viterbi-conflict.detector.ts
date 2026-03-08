import type { MultiPassConflictEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

// يكشف التعارض بين تمريرة المضي للأمام وخوارزمية فيتربي
// تعارض فيتربي أكثر أهمية لأنه مُحسِّن عالمي يأخذ البنية الكاملة بعين الاعتبار
export const detectViterbiConflict: DetectorFn = (trace, _line, context) => {
  const forwardVote = trace.passVotes.find((v) => v.stage === "forward");
  const viterbiVote = trace.passVotes.find((v) => v.stage === "viterbi");

  if (forwardVote === undefined || viterbiVote === undefined) {
    return [];
  }

  const finalType = trace.finalDecision.assignedType;

  // الكاشف يُطلق فقط حين تتعارض فيتربي مع القرار النهائي
  if (viterbiVote.suggestedType === finalType) {
    return [];
  }

  const confidenceDelta = Math.abs(
    viterbiVote.confidence - trace.finalDecision.confidence
  );

  // فيتربي مُحسِّن عالمي — التعارض أكثر خطورة، نطاق الدرجة أعلى: 0.5-0.8
  const conflictSeverity: "minor" | "moderate" | "severe" =
    confidenceDelta < 0.15
      ? "severe"
      : confidenceDelta < 0.35
        ? "moderate"
        : "minor";

  const score =
    conflictSeverity === "minor"
      ? 0.5
      : conflictSeverity === "moderate"
        ? 0.65
        : 0.8;

  const { dominantType, minorityType } = context.features.crossPass;

  if (dominantType === null || minorityType === null) {
    return [];
  }

  const conflictingVotes: MultiPassConflictEvidence["conflictingVotes"] = [
    {
      stage: "viterbi",
      suggestedType: viterbiVote.suggestedType,
      confidence: viterbiVote.confidence,
    },
    {
      stage: trace.finalDecision.winningStage ?? "final",
      suggestedType: finalType,
      confidence: trace.finalDecision.confidence,
    },
  ];

  if (
    forwardVote.suggestedType !== finalType &&
    forwardVote.suggestedType !== viterbiVote.suggestedType
  ) {
    (
      conflictingVotes as Array<{
        stage: string;
        suggestedType: typeof forwardVote.suggestedType;
        confidence: number;
      }>
    ).push({
      stage: "forward",
      suggestedType: forwardVote.suggestedType,
      confidence: forwardVote.confidence,
    });
  }

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
      reasonCode: "VITERBI_FINAL_CONFLICT",
      message: `تعارض بين فيتربي (${viterbiVote.suggestedType}) والقرار النهائي (${finalType}) — فارق الثقة: ${confidenceDelta.toFixed(2)}`,
      suggestedType: viterbiVote.suggestedType,
      evidence,
      debug: {
        viterbiType: viterbiVote.suggestedType,
        finalType,
        viterbiConfidence: viterbiVote.confidence,
        finalConfidence: trace.finalDecision.confidence,
        confidenceDelta,
        conflictSeverity,
      },
    }),
  ];
};
