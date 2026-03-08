import type {
  ClassificationTrace,
  PassVote,
  LineRepair,
  SourceHints,
  FinalDecision,
} from "@/suspicion-engine/types";

export interface TraceBuilderParams {
  readonly lineIndex: number;
  readonly rawText: string;
  readonly normalizedText: string;
  readonly sourceHints: SourceHints;
  readonly passVotes: readonly PassVote[];
  readonly repairs: readonly LineRepair[];
  readonly finalDecision: FinalDecision;
}

export function createClassificationTrace(
  params: TraceBuilderParams
): ClassificationTrace {
  return {
    lineIndex: params.lineIndex,
    rawText: params.rawText,
    normalizedText: params.normalizedText,
    sourceHints: params.sourceHints,
    repairs: [...params.repairs].sort((a, b) => a.appliedAt - b.appliedAt),
    passVotes: [...params.passVotes],
    finalDecision: params.finalDecision,
  };
}
