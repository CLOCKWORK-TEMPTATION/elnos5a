export interface UnstructuredChunk {
  raw: string;
}

export function segmentToChunks(workText: string): UnstructuredChunk[] {
  const lines = (workText ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  return lines.map((raw) => ({ raw }));
}

const SCENE_RE = /مشهد\s*\d+/u;
const CUT_PREFIX_RE = /^\s*قطع(?:\s|$)/u;

export function splitCutSceneGlue(
  chunks: UnstructuredChunk[]
): UnstructuredChunk[] {
  const out: UnstructuredChunk[] = [];

  for (const ch of chunks) {
    const t = ch.raw;

    if (CUT_PREFIX_RE.test(t) && SCENE_RE.test(t)) {
      const idx = t.search(SCENE_RE);
      if (idx >= 0) {
        const left = t.slice(0, idx).trim();
        const right = t.slice(idx).trim();

        if (left) out.push({ raw: left });
        if (right) out.push({ raw: right });
        continue;
      }
    }

    out.push(ch);
  }

  return out;
}
