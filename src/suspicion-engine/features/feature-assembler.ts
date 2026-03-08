import type { ClassifiedDraft } from "@/extensions/classification-types";
import type {
  ClassificationTrace,
  SuspicionFeature,
  StabilityFeatures,
} from "@/suspicion-engine/types";
import { extractGateFeatures } from "./gate-features";
import { extractContextFeatures } from "./context-features";
import { extractRawQualityFeatures } from "./raw-quality-features";
import { extractCrossPassFeatures } from "./cross-pass-features";
import { extractCompetitionFeatures } from "./competition-features";

function extractStabilityFeatures(
  trace: ClassificationTrace
): StabilityFeatures {
  const votes = trace.passVotes;
  const finalConfidence = trace.finalDecision.confidence;

  const wasOverridden = votes.some(
    (v) =>
      v.suggestedType !== trace.finalDecision.assignedType &&
      v.confidence > finalConfidence
  );

  const repairCount = trace.repairs.length;

  let decisionFragility = 0;
  if (finalConfidence < 0.5) decisionFragility += 0.3;
  if (finalConfidence < 0.3) decisionFragility += 0.2;
  if (wasOverridden) decisionFragility += 0.3;
  if (repairCount > 0) decisionFragility += Math.min(0.2, repairCount * 0.05);
  decisionFragility = Math.min(1, decisionFragility);

  return {
    decisionFragility,
    repairCount,
    wasOverridden,
    finalConfidence,
  };
}

export function assembleSuspicionFeatures(
  trace: ClassificationTrace,
  lineIndex: number,
  neighbors: readonly ClassifiedDraft[],
  totalLines: number
): SuspicionFeature {
  return {
    lineIndex,
    gate: extractGateFeatures(trace),
    context: extractContextFeatures(lineIndex, neighbors, totalLines),
    rawQuality: extractRawQualityFeatures(trace),
    crossPass: extractCrossPassFeatures(trace),
    competition: extractCompetitionFeatures(trace),
    stability: extractStabilityFeatures(trace),
  };
}
