import type { RawCorruptionEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

/**
 * @module corruption/split-character.detector
 * @description
 * كاشف اسم الشخصية المنقسم — يرصد حالات انقسام اسم الشخصية على سطرين:
 *
 * الحالة 1: السطر الحالي نوعه `action` وقصير (≤3 كلمات) والسطر التالي `character`
 *   — يشير إلى أن السطر الحالي هو الجزء الأول من اسم شخصية مكسور.
 *
 * الحالة 2: السطر الحالي `character` والسطر السابق `action` وقصير جداً
 *   — يشير إلى أن السطر السابق هو شطر من الاسم ملتصق بسطر الحركة.
 */
export const detectSplitCharacter: DetectorFn = (trace, line, context) => {
  const { lineIndex } = trace;
  const { neighbors, neighborTraces } = context;

  // ── الحالة 1: action قصير يليه character ───────────────────────────────
  if (line.type === "action") {
    const wordCount = line.text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    if (wordCount > 3) return [];

    const nextNeighbor = neighbors.find(
      (_n, idx) => neighborTraces[idx]?.lineIndex === lineIndex + 1
    );

    if (nextNeighbor?.type !== "character") return [];

    const evidence: RawCorruptionEvidence = {
      signalType: "raw-corruption",
      corruptionType: "broken-words",
      qualityScore: context.features.rawQuality.qualityScore,
      affectedSegments: [line.text, nextNeighbor.text],
      weirdCharRatio: context.features.rawQuality.weirdCharRatio,
      arabicRatio: context.features.rawQuality.arabicRatio,
    };

    return [
      createSignal<RawCorruptionEvidence>({
        lineIndex,
        family: "corruption",
        signalType: "raw-corruption",
        score: 0.6,
        reasonCode: "SPLIT_CHARACTER_ACTION_BEFORE",
        message: `action قصير (${wordCount} كلمات) يسبق سطر شخصية — قد يكون الاسم منقسماً: "${line.text}"`,
        suggestedType: "character",
        evidence,
        debug: {
          wordCount,
          nextType: nextNeighbor.type,
          lineIndex,
        },
      }),
    ];
  }

  // ── الحالة 2: character يسبقه action قصير جداً ─────────────────────────
  if (line.type === "character") {
    const prevNeighbor = neighbors.find(
      (_n, idx) => neighborTraces[idx]?.lineIndex === lineIndex - 1
    );

    if (prevNeighbor?.type !== "action") return [];

    const prevWordCount = prevNeighbor.text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // "قصير جداً" = كلمة أو كلمتان كحد أقصى
    if (prevWordCount > 2) return [];

    const evidence: RawCorruptionEvidence = {
      signalType: "raw-corruption",
      corruptionType: "broken-words",
      qualityScore: context.features.rawQuality.qualityScore,
      affectedSegments: [prevNeighbor.text, line.text],
      weirdCharRatio: context.features.rawQuality.weirdCharRatio,
      arabicRatio: context.features.rawQuality.arabicRatio,
    };

    return [
      createSignal<RawCorruptionEvidence>({
        lineIndex,
        family: "corruption",
        signalType: "raw-corruption",
        score: 0.5,
        reasonCode: "SPLIT_CHARACTER_PREV_ACTION_SHORT",
        message: `سطر شخصية مسبوق بـ action قصير جداً (${prevWordCount} كلمات) — قد يكون الاسم منقسماً: "${prevNeighbor.text} | ${line.text}"`,
        suggestedType: "character",
        evidence,
        debug: {
          prevWordCount,
          prevText: prevNeighbor.text,
          lineIndex,
        },
      }),
    ];
  }

  return [];
};
