import type { PipelineConfig } from "./types";

const resolveOcrProvider = (): "mistral" | "azure" | "none" => {
  const nodeProvider =
    typeof process !== "undefined" ? process.env?.OCR_PROVIDER : undefined;
  const viteProvider = process.env.NEXT_PUBLIC_OCR_PROVIDER as
    | string
    | undefined;
  const rawProvider = (nodeProvider ?? viteProvider ?? "mistral")
    .trim()
    .toLowerCase();

  if (
    rawProvider === "mistral" ||
    rawProvider === "azure" ||
    rawProvider === "none"
  ) {
    return rawProvider;
  }

  return "mistral";
};

export const defaultConfig: PipelineConfig = {
  lineMerge: {
    yTolerance: 2.5,
    xGapMergeThreshold: 22,
    minSpaceInsertGap: 5,
  },
  quality: {
    suspiciousThreshold: 0.62,
    weirdCharRatioThreshold: 0.12,
    minArabicRatioForArabicDocs: 0.15,
  },
  ocr: {
    enabled: true,
    provider: resolveOcrProvider(),
    maxPagesPerBatch: 8,
  },
  patch: {
    maxEditDistanceRatio: 0.45,
    requireSameLineCountWindow: false,
    windowSize: 2,
  },
  domain: {
    screenplayArabicMode: true,
  },
};
