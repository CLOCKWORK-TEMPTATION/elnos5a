import { editDistanceRatio } from "../metrics";

export type LineMatch = {
  sourceIndex: number;
  ocrIndex: number;
  score: number; // 0..1 similarity
};

export function simpleLineAlignment(
  sourceLines: string[],
  ocrLines: string[]
): LineMatch[] {
  // Greedy alignment مع نافذة؛ عملي وسريع كبداية
  const matches: LineMatch[] = [];
  let j = 0;

  for (let i = 0; i < sourceLines.length; i++) {
    let bestJ = -1;
    let bestScore = -1;

    const windowEnd = Math.min(ocrLines.length - 1, j + 4);
    for (let k = j; k <= windowEnd; k++) {
      const ratio = editDistanceRatio(sourceLines[i], ocrLines[k]);
      const sim = 1 - ratio;
      if (sim > bestScore) {
        bestScore = sim;
        bestJ = k;
      }
    }

    if (bestJ >= 0) {
      matches.push({ sourceIndex: i, ocrIndex: bestJ, score: bestScore });
      j = bestJ; // لا نتراجع للخلف
    }
  }

  return matches;
}
