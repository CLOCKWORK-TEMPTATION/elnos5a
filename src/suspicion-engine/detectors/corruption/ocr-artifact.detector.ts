import type { RawCorruptionEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

/**
 * @module corruption/ocr-artifact.detector
 * @description
 * كاشف مخلّفات OCR — يرصد التلوث في جودة النص عبر ثلاثة مسارات:
 *
 * 1. `weirdCharRatio > 0.1` → محارف غريبة/غير معيارية (ocr-artifacts)
 * 2. `arabicRatio < 0.5` لأسطر غير فارغة → اختلاط نصوص أجنبية (mixed-scripts)
 * 3. `hasEncodingIssues` → أخطاء ترميز Unicode (encoding-errors)
 *
 * الدرجات تتناسب مع حدة الفساد وتتراوح بين 0.3 و 0.9.
 */

export const detectOcrArtifact: DetectorFn = (trace, line, context) => {
  const { arabicRatio, weirdCharRatio, qualityScore, hasEncodingIssues } =
    context.features.rawQuality;

  const signals = [];

  // ── 1: نسبة محارف غريبة مرتفعة → مخلّفات OCR ───────────────────────────
  if (weirdCharRatio > 0.1) {
    // الدرجة تتصاعد مع نسبة الفساد: 0.3 عند 0.1 → 0.9 عند 0.7+
    const score = Math.min(0.3 + weirdCharRatio * 0.9, 0.9);

    const evidence: RawCorruptionEvidence = {
      signalType: "raw-corruption",
      corruptionType: "ocr-artifacts",
      qualityScore,
      affectedSegments: [line.text],
      weirdCharRatio,
      arabicRatio,
    };

    signals.push(
      createSignal<RawCorruptionEvidence>({
        lineIndex: trace.lineIndex,
        family: "corruption",
        signalType: "raw-corruption",
        score,
        reasonCode: "OCR_HIGH_WEIRD_CHAR_RATIO",
        message: `نسبة محارف غريبة مرتفعة (${(weirdCharRatio * 100).toFixed(1)}%) — مخلّفات OCR محتملة: "${line.text}"`,
        suggestedType: null,
        evidence,
        debug: {
          weirdCharRatio,
          qualityScore,
          score,
        },
      })
    );
  }

  // ── 2: نسبة عربي منخفضة → اختلاط نصوص ─────────────────────────────────
  // نتجاهل الأسطر الفارغة لأنها تعطي arabicRatio = 0 بشكل طبيعي
  const isNonEmpty = line.text.trim().length > 0;

  if (isNonEmpty && arabicRatio < 0.5) {
    // الدرجة عكسية مع arabicRatio: كلما قلّت العربية زادت الشبهة
    const score = Math.max(0.3, Math.min(0.3 + (0.5 - arabicRatio) * 1.2, 0.9));

    const evidence: RawCorruptionEvidence = {
      signalType: "raw-corruption",
      corruptionType: "mixed-scripts",
      qualityScore,
      affectedSegments: [line.text],
      weirdCharRatio,
      arabicRatio,
    };

    signals.push(
      createSignal<RawCorruptionEvidence>({
        lineIndex: trace.lineIndex,
        family: "corruption",
        signalType: "raw-corruption",
        score,
        reasonCode: "OCR_LOW_ARABIC_RATIO",
        message: `نسبة عربي منخفضة (${(arabicRatio * 100).toFixed(1)}%) — اختلاط نصوص محتمل: "${line.text}"`,
        suggestedType: null,
        evidence,
        debug: {
          arabicRatio,
          qualityScore,
          score,
        },
      })
    );
  }

  // ── 3: أخطاء ترميز → encoding-errors ───────────────────────────────────
  if (hasEncodingIssues) {
    // الدرجة تعتمد على جودة السطر الكلية — كلما كانت أسوأ رفعنا الشبهة
    const score = Math.max(0.3, Math.min(0.9, 0.9 - qualityScore * 0.6));

    const evidence: RawCorruptionEvidence = {
      signalType: "raw-corruption",
      corruptionType: "encoding-errors",
      qualityScore,
      affectedSegments: [line.text],
      weirdCharRatio,
      arabicRatio,
    };

    signals.push(
      createSignal<RawCorruptionEvidence>({
        lineIndex: trace.lineIndex,
        family: "corruption",
        signalType: "raw-corruption",
        score,
        reasonCode: "OCR_ENCODING_ISSUES",
        message: `أخطاء ترميز مكتشفة في السطر — جودة: ${(qualityScore * 100).toFixed(1)}%: "${line.text}"`,
        suggestedType: null,
        evidence,
        debug: {
          hasEncodingIssues,
          qualityScore,
          score,
        },
      })
    );
  }

  return signals;
};
