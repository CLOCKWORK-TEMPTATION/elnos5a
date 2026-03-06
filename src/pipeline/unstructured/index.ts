import type { UnstructuredReconstructionResult } from "./types";
import { detectUnstructured } from "./detect";
import { normalizeForUnstructuredWork } from "./normalize";
import { segmentToChunks, splitCutSceneGlue } from "./segmenter";
import { classifyUnstructuredLines } from "./classifier";
import { validateUnstructuredResult } from "./validator";
import { toStructuredBlocks, toStructuredText } from "./to-structured";

export interface MaybeReconstructOptions {
  threshold: number;
  replaceBullets?: boolean;
}

export function maybeReconstructUnstructured(
  text: string,
  opt: MaybeReconstructOptions
): UnstructuredReconstructionResult {
  const decision = detectUnstructured(text, { threshold: opt.threshold });

  if (!decision.applied) {
    return {
      applied: false,
      qualityScore: decision.qualityScore,
      structuredText: text ?? "",
      structuredBlocks: [],
      debug: {
        reasons: decision.reasons,
        operationsCount: 0,
        itemsCount: 0,
      },
    };
  }

  const work = normalizeForUnstructuredWork(text ?? "", {
    replaceBullets: opt.replaceBullets ?? true,
    collapseBlankLines: true,
  });

  let chunks = segmentToChunks(work);
  chunks = splitCutSceneGlue(chunks);

  const lines = chunks.map((c) => c.raw);

  const classified = classifyUnstructuredLines(lines);
  const v = validateUnstructuredResult(classified);

  if (!v.ok) {
    return {
      applied: false,
      qualityScore: decision.qualityScore,
      structuredText: text ?? "",
      structuredBlocks: [],
      debug: {
        reasons: decision.reasons.concat(
          v.errors.slice(0, 5).map((e) => `V_${e.code}`)
        ),
        operationsCount: classified.operations.length,
        itemsCount: classified.items.length,
      },
    };
  }

  const structuredBlocks = toStructuredBlocks(classified);
  const structuredText = toStructuredText(structuredBlocks);

  return {
    applied: true,
    qualityScore: decision.qualityScore,
    structuredText,
    structuredBlocks,
    debug: {
      reasons: decision.reasons,
      operationsCount: classified.operations.length,
      itemsCount: classified.items.length,
    },
  };
}
