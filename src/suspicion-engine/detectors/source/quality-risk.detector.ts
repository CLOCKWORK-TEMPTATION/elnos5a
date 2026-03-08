import type { SourceRiskEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

// يكشف نصوص منخفضة الجودة قد تكون صُنِّفت بشكل خاطئ
// الدرجة تتناسب طردياً مع (1 - qualityScore) مضروباً بعامل 0.8
export const detectQualityRisk: DetectorFn = (trace, _line, context) => {
  const { qualityScore } = context.features.rawQuality;
  const finalConfidence = trace.finalDecision.confidence;

  // نشترط انخفاضاً في كلٍّ من جودة النص وثقة القرار النهائي
  if (qualityScore >= 0.5 || finalConfidence >= 0.6) {
    return [];
  }

  const score = (1 - qualityScore) * 0.8;

  const { importSource } = trace.sourceHints;
  const riskType: SourceRiskEvidence["riskType"] =
    importSource === "pdf" ? "pdf-extraction-artifact" : "unknown-source";

  const riskLevel: "low" | "medium" | "high" =
    qualityScore < 0.2 ? "high" : qualityScore < 0.35 ? "medium" : "low";

  const affectedFields: string[] = ["rawText"];
  if (context.features.rawQuality.hasEncodingIssues) {
    affectedFields.push("normalizedText");
  }
  if (finalConfidence < 0.4) {
    affectedFields.push("assignedType");
  }

  const evidence: SourceRiskEvidence = {
    signalType: "source-risk",
    riskType,
    sourceCategory: importSource,
    riskLevel,
    affectedFields,
  };

  return [
    createSignal<SourceRiskEvidence>({
      lineIndex: trace.lineIndex,
      family: "source",
      signalType: "source-risk",
      score,
      reasonCode: "LOW_QUALITY_CLASSIFICATION_RISK",
      message: `جودة نص منخفضة (${qualityScore.toFixed(2)}) مع ثقة ضعيفة (${finalConfidence.toFixed(2)}) — خطر تصنيف خاطئ`,
      suggestedType: null,
      evidence,
      debug: {
        qualityScore,
        finalConfidence,
        riskType,
        riskLevel,
        hasEncodingIssues: context.features.rawQuality.hasEncodingIssues,
        arabicRatio: context.features.rawQuality.arabicRatio,
      },
    }),
  ];
};
