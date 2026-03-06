import { levenshtein } from "./metrics";

/**
 * @deprecated استخدم {@link levenshtein} من `metrics.ts` مباشرة.
 * هذا مجرد alias للتوافق مع الكود القديم.
 */
export const simpleEditDistance = levenshtein;

export function patchLineIfSafe(
  original: string,
  candidate: string
): { accepted: boolean; value: string; reason?: string } {
  const o = original.trim();
  const c = candidate.trim();
  if (!c) {
    return { accepted: false, value: original, reason: "empty_candidate" };
  }

  const dist = levenshtein(o, c);
  const ratio = dist / Math.max(o.length, c.length, 1);

  // حد آمن: تصحيح OCR وليس إعادة كتابة
  if (ratio > 0.45) {
    return { accepted: false, value: original, reason: "too_different" };
  }

  return { accepted: true, value: c };
}
