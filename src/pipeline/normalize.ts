export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

export function normalizeSpaces(s: string): string {
  return s
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function normalizeArabicPunctuationForCompare(s: string): string {
  // للتقييم الداخلي فقط (Canonical compare) - لا نستخدمه للإخراج النهائي
  return s
    .replace(/[‐-‒–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([،؛:.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBulletsForRender(s: string): string {
  // الإخراج النهائي: توحيد bullets إلى "·" لتقارب شكل DOCX لديك
  return s.replace(/^\s*[-▪•●◦]\s+/u, "· ");
}

export function stripZeroWidth(s: string): string {
  return s.replace(/[\u200B-\u200F\u2060\uFEFF]/g, "");
}

export function finalRenderLineNormalize(s: string): string {
  return normalizeBulletsForRender(stripZeroWidth(s)).replace(/[ \t]+$/g, "");
}
