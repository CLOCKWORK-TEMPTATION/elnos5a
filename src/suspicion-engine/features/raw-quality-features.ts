import type {
  ClassificationTrace,
  RawQualityFeatures,
} from "@/suspicion-engine/types";

const ARABIC_RANGE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const WEIRD_CHARS =
  /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0020-\u007E\u00A0-\u00FF\s\d.,;:!?()[\]{}"'`\-_/\\@#$%^&*+=<>|~]/g;

export function extractRawQualityFeatures(
  trace: ClassificationTrace
): RawQualityFeatures {
  const text = trace.rawText;
  const readableChars = text.replace(/\s/g, "");
  const totalReadable = readableChars.length;

  if (totalReadable === 0) {
    return {
      arabicRatio: 0,
      weirdCharRatio: 0,
      qualityScore: 0,
      lineLength: 0,
      hasEncodingIssues: false,
    };
  }

  const arabicMatches = text.match(ARABIC_RANGE);
  const arabicCount = arabicMatches ? arabicMatches.length : 0;
  const arabicRatio = arabicCount / totalReadable;

  const weirdMatches = text.match(WEIRD_CHARS);
  const weirdCount = weirdMatches ? weirdMatches.length : 0;
  const weirdCharRatio = weirdCount / totalReadable;

  const hasEncodingIssues = weirdCharRatio > 0.1 || text.includes("\uFFFD");

  const qualityScore = Math.max(
    0,
    Math.min(1, arabicRatio * 0.7 + (1 - weirdCharRatio) * 0.3)
  );

  return {
    arabicRatio,
    weirdCharRatio,
    qualityScore,
    lineLength: text.length,
    hasEncodingIssues,
  };
}
