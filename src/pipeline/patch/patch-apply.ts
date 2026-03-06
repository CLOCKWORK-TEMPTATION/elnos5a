import { editDistanceRatio } from "../metrics";
import { simpleLineAlignment } from "./align";
import type { ExtractedLine } from "../types";

export function patchSuspiciousLinesFromOcr(opts: {
  pageLines: ExtractedLine[];
  ocrLines: string[];
  suspiciousThreshold: number;
  maxEditDistanceRatio: number;
}): { patched: number; lines: ExtractedLine[] } {
  const { pageLines, ocrLines, suspiciousThreshold, maxEditDistanceRatio } =
    opts;

  const patchedLines = [...pageLines];
  const sourceTexts = pageLines.map((l) => l.text);

  const matches = simpleLineAlignment(sourceTexts, ocrLines);

  let patched = 0;

  for (const m of matches) {
    const line = patchedLines[m.sourceIndex];
    if (!line) continue;
    if (line.quality.score >= suspiciousThreshold) continue; // لا نلمس السطور الجيدة

    const candidate = (ocrLines[m.ocrIndex] || "").trim();
    if (!candidate) continue;

    const ratio = editDistanceRatio(line.text, candidate);

    // تصحيح مقيد: فقط إذا الاختلاف معقول (تصحيح OCR) وليس إعادة كتابة كاملة
    if (ratio <= maxEditDistanceRatio) {
      if (candidate !== line.text) {
        line.text = candidate;
        line.source = "patched";
        line.flags.push("patched_from_ocr");
        patched++;
      }
    } else {
      line.flags.push("patch_rejected_large_diff");
    }
  }

  return { patched, lines: patchedLines };
}
