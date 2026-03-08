import type { SourceRiskEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

// أنواع النصوص المتوقعة في مصدر فاونتن حسب اتفاقياته
const FOUNTAIN_EXPECTED_TYPES = new Set([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "transition",
  "parenthetical",
]);

// يكشف التناقض بين تلميحات مصدر الاستيراد والتصنيف المعطى
export const detectSourceHintMismatch: DetectorFn = (trace, line, _context) => {
  const { importSource, lineQuality } = trace.sourceHints;
  const finalConfidence = trace.finalDecision.confidence;

  if (
    importSource === "paste" ||
    importSource === "txt" ||
    importSource === "fdx"
  ) {
    return [];
  }

  if (importSource === "pdf" && lineQuality.score < 0.5) {
    const riskLevel: "low" | "medium" | "high" =
      lineQuality.score < 0.25 ? "high" : "medium";
    const score = 0.3 + (1 - lineQuality.score) * 0.2;

    const evidence: SourceRiskEvidence = {
      signalType: "source-risk",
      riskType: "pdf-extraction-artifact",
      sourceCategory: "pdf",
      riskLevel,
      affectedFields: ["rawText", "normalizedText"],
    };

    return [
      createSignal<SourceRiskEvidence>({
        lineIndex: trace.lineIndex,
        family: "source",
        signalType: "source-risk",
        score,
        reasonCode: "PDF_LOW_QUALITY_MISMATCH",
        message: `مصدر PDF بجودة منخفضة (${lineQuality.score.toFixed(2)}) — محتمل أن يكون أثر استخراج`,
        suggestedType: null,
        evidence,
        debug: {
          lineQualityScore: lineQuality.score,
          arabicRatio: lineQuality.arabicRatio,
          riskLevel,
        },
      }),
    ];
  }

  if (importSource === "docx" && finalConfidence < 0.5) {
    const score = 0.3 + (0.5 - finalConfidence) * 0.4;

    const evidence: SourceRiskEvidence = {
      signalType: "source-risk",
      riskType: "docx-style-mismatch",
      sourceCategory: "docx",
      riskLevel: finalConfidence < 0.3 ? "high" : "medium",
      affectedFields: ["assignedType", "confidence"],
    };

    return [
      createSignal<SourceRiskEvidence>({
        lineIndex: trace.lineIndex,
        family: "source",
        signalType: "source-risk",
        score,
        reasonCode: "DOCX_STYLE_LOW_CONFIDENCE",
        message: `مصدر DOCX بثقة تصنيف منخفضة (${finalConfidence.toFixed(2)}) — احتمال عدم تطابق نمط الأنماط`,
        suggestedType: null,
        evidence,
        debug: {
          finalConfidence,
          assignedType: line.type,
        },
      }),
    ];
  }

  if (importSource === "fountain" && !FOUNTAIN_EXPECTED_TYPES.has(line.type)) {
    const evidence: SourceRiskEvidence = {
      signalType: "source-risk",
      riskType: "fountain-format-ambiguity",
      sourceCategory: "fountain",
      riskLevel: "low",
      affectedFields: ["assignedType"],
    };

    return [
      createSignal<SourceRiskEvidence>({
        lineIndex: trace.lineIndex,
        family: "source",
        signalType: "source-risk",
        score: 0.35,
        reasonCode: "FOUNTAIN_UNEXPECTED_TYPE",
        message: `نوع "${line.type}" غير متوقع في مصدر فاونتن`,
        suggestedType: null,
        evidence,
        debug: {
          assignedType: line.type,
          importSource,
        },
      }),
    ];
  }

  return [];
};
