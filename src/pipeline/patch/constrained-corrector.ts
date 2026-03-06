import type { OcrPageResult, PageExtraction, PipelineConfig } from "../types";
import { patchSuspiciousLinesFromOcr } from "./patch-apply";

export function applyOcrPatchesToPages(args: {
  pages: PageExtraction[];
  ocrResults: OcrPageResult[];
  config: PipelineConfig;
}): { pages: PageExtraction[]; patchedLines: number } {
  const pageMap = new Map<number, OcrPageResult>();
  for (const p of args.ocrResults) pageMap.set(p.page, p);

  let totalPatched = 0;

  for (const page of args.pages) {
    const ocr = pageMap.get(page.page);
    if (!ocr?.lines?.length) continue;

    const r = patchSuspiciousLinesFromOcr({
      pageLines: page.lines,
      ocrLines: ocr.lines,
      suspiciousThreshold: args.config.quality.suspiciousThreshold,
      maxEditDistanceRatio: args.config.patch.maxEditDistanceRatio,
    });

    page.lines = r.lines;
    page.usedOcr = r.patched > 0;
    totalPatched += r.patched;
  }

  return { pages: args.pages, patchedLines: totalPatched };
}
