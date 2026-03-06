import type { PageExtraction } from "../types";

export function getSuspiciousPages(
  pages: PageExtraction[],
  threshold = 0.62
): number[] {
  const out: number[] = [];

  for (const p of pages) {
    const suspicious = p.lines.filter(
      (l) => l.quality.score < threshold
    ).length;
    const total = p.lines.length || 1;
    const ratio = suspicious / total;

    // صفحة مشبوهة إذا بها نسبة ملحوظة من الأسطر الضعيفة
    if (suspicious >= 2 && ratio >= 0.15) out.push(p.page);
  }

  return out;
}

export function countSuspiciousLines(
  pages: PageExtraction[],
  threshold = 0.62
): number {
  return pages.reduce(
    (sum, p) => sum + p.lines.filter((l) => l.quality.score < threshold).length,
    0
  );
}
