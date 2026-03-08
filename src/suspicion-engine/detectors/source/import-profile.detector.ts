import type { SourceRiskEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

// حد نسبة العربية لاعتبار السطر قصيراً بأسلوب OCR
const OCR_SHORT_LINE_THRESHOLD = 15;
const OCR_LOW_ARABIC_RATIO = 0.4;

// يكشف مخاطر الاستيراد الخاصة بكل مصدر
export const detectImportProfile: DetectorFn = (trace, _line, context) => {
  const { importSource, lineQuality } = trace.sourceHints;
  const { arabicRatio } = context.features.rawQuality;
  const { lineLength } = context.features.rawQuality;
  const finalConfidence = trace.finalDecision.confidence;

  if (importSource === "unknown") {
    // مصدر مجهول — نُعلِم دائماً بمستوى منخفض
    const evidence: SourceRiskEvidence = {
      signalType: "source-risk",
      riskType: "unknown-source",
      sourceCategory: "unknown",
      riskLevel: "low",
      affectedFields: ["importSource"],
    };

    return [
      createSignal<SourceRiskEvidence>({
        lineIndex: trace.lineIndex,
        family: "source",
        signalType: "source-risk",
        score: 0.25,
        reasonCode: "UNKNOWN_IMPORT_SOURCE",
        message: "مصدر الاستيراد مجهول — لا يمكن التحقق من اتفاقيات التنسيق",
        suggestedType: null,
        evidence,
        debug: {
          importSource,
          finalConfidence,
        },
      }),
    ];
  }

  if (importSource === "pdf") {
    // مشكلات OCR النمطية: أسطر قصيرة + نسبة عربية منخفضة
    const isShortLine = lineLength < OCR_SHORT_LINE_THRESHOLD;
    const isLowArabic = arabicRatio < OCR_LOW_ARABIC_RATIO;

    if (!isShortLine && !isLowArabic) {
      return [];
    }

    const riskLevel: "low" | "medium" | "high" =
      isShortLine && isLowArabic ? "high" : "medium";

    const score = riskLevel === "high" ? 0.5 : 0.35;

    const affectedFields: string[] = [];
    if (isShortLine) affectedFields.push("rawText");
    if (isLowArabic) affectedFields.push("arabicRatio");

    const evidence: SourceRiskEvidence = {
      signalType: "source-risk",
      riskType: "pdf-extraction-artifact",
      sourceCategory: "pdf",
      riskLevel,
      affectedFields,
    };

    return [
      createSignal<SourceRiskEvidence>({
        lineIndex: trace.lineIndex,
        family: "source",
        signalType: "source-risk",
        score,
        reasonCode: "PDF_OCR_PROFILE_RISK",
        message: `ملف PDF بملف OCR مشبوه — سطر قصير: ${isShortLine}, نسبة عربية منخفضة: ${isLowArabic}`,
        suggestedType: null,
        evidence,
        debug: {
          lineLength,
          arabicRatio,
          isShortLine,
          isLowArabic,
          riskLevel,
        },
      }),
    ];
  }

  if (importSource === "docx") {
    // مشكلات DOCX: ثقة منخفضة + جودة سطر جيدة (يعني النص سليم لكن النمط غير متطابق)
    const isStyleMismatch = finalConfidence < 0.45 && lineQuality.score >= 0.5;

    if (!isStyleMismatch) {
      return [];
    }

    const evidence: SourceRiskEvidence = {
      signalType: "source-risk",
      riskType: "docx-style-mismatch",
      sourceCategory: "docx",
      riskLevel: "medium",
      affectedFields: ["assignedType", "confidence"],
    };

    return [
      createSignal<SourceRiskEvidence>({
        lineIndex: trace.lineIndex,
        family: "source",
        signalType: "source-risk",
        score: 0.4,
        reasonCode: "DOCX_STYLE_PROFILE_MISMATCH",
        message: `ملف DOCX بنمط غير متطابق — ثقة منخفضة (${finalConfidence.toFixed(2)}) رغم جودة النص الجيدة`,
        suggestedType: null,
        evidence,
        debug: {
          finalConfidence,
          lineQualityScore: lineQuality.score,
        },
      }),
    ];
  }

  return [];
};
