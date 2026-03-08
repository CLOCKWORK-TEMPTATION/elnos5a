import type {
  ClassificationTrace,
  CrossPassFeatures,
  ElementType,
} from "@/suspicion-engine/types";

export function extractCrossPassFeatures(
  trace: ClassificationTrace
): CrossPassFeatures {
  const votes = trace.passVotes;

  if (votes.length === 0) {
    return {
      totalVotes: 0,
      distinctTypes: 0,
      agreementRatio: 1,
      highestConflictSeverity: "none",
      dominantType: null,
      minorityType: null,
    };
  }

  const typeCounts = new Map<ElementType, number>();
  for (const vote of votes) {
    typeCounts.set(
      vote.suggestedType,
      (typeCounts.get(vote.suggestedType) ?? 0) + 1
    );
  }

  const distinctTypes = typeCounts.size;
  const totalVotes = votes.length;

  let dominantType: ElementType | null = null;
  let dominantCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantType = type;
    }
  }

  const agreementRatio = dominantCount / totalVotes;

  let minorityType: ElementType | null = null;
  if (distinctTypes > 1) {
    let minCount = Infinity;
    for (const [type, count] of typeCounts) {
      if (type !== dominantType && count < minCount) {
        minCount = count;
        minorityType = type;
      }
    }
  }

  let highestConflictSeverity: "none" | "minor" | "moderate" | "severe" =
    "none";
  if (distinctTypes > 1) {
    if (agreementRatio >= 0.75) {
      highestConflictSeverity = "minor";
    } else if (agreementRatio >= 0.5) {
      highestConflictSeverity = "moderate";
    } else {
      highestConflictSeverity = "severe";
    }
  }

  return {
    totalVotes,
    distinctTypes,
    agreementRatio,
    highestConflictSeverity,
    dominantType,
    minorityType,
  };
}
