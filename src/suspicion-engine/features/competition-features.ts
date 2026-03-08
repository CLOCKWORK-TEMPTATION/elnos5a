import type {
  ClassificationTrace,
  CompetitionFeatures,
  ElementType,
} from "@/suspicion-engine/types";

export function extractCompetitionFeatures(
  trace: ClassificationTrace
): CompetitionFeatures {
  const votes = trace.passVotes;
  const finalType = trace.finalDecision.assignedType;

  if (votes.length === 0) {
    return {
      strongestAlternativeType: null,
      pullStrength: 0,
      confidenceDelta: 0,
      contributingStageCount: 0,
    };
  }

  const alternativeVotes = votes.filter((v) => v.suggestedType !== finalType);

  if (alternativeVotes.length === 0) {
    return {
      strongestAlternativeType: null,
      pullStrength: 0,
      confidenceDelta: 0,
      contributingStageCount: 0,
    };
  }

  const altTypeCounts = new Map<
    ElementType,
    { count: number; totalConfidence: number }
  >();
  for (const vote of alternativeVotes) {
    const entry = altTypeCounts.get(vote.suggestedType) ?? {
      count: 0,
      totalConfidence: 0,
    };
    entry.count++;
    entry.totalConfidence += vote.confidence;
    altTypeCounts.set(vote.suggestedType, entry);
  }

  let strongestAlternativeType: ElementType | null = null;
  let maxAltScore = 0;
  for (const [type, entry] of altTypeCounts) {
    const score = (entry.count * entry.totalConfidence) / entry.count;
    if (score > maxAltScore) {
      maxAltScore = score;
      strongestAlternativeType = type;
    }
  }

  const pullStrength = alternativeVotes.length / votes.length;
  const finalConfidence = trace.finalDecision.confidence;
  const confidenceDelta = finalConfidence - maxAltScore;

  return {
    strongestAlternativeType,
    pullStrength,
    confidenceDelta,
    contributingStageCount: alternativeVotes.length,
  };
}
