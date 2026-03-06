import type { OcrProvider } from "../types";

export function chunkPages(pages: number[], size: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pages.length; i += size) {
    out.push(pages.slice(i, i + size));
  }
  return out;
}

export { OcrProvider };
