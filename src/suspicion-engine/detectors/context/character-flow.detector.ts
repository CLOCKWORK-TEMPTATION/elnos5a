import type { ContextContradictionEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

export const detectCharacterFlow: DetectorFn = (trace, line, context) => {
  if (line.type !== "character") {
    return [];
  }

  const { previousType } = context.features.context;

  // Character immediately after another character — the first one may actually be dialogue
  if (previousType === "character") {
    const evidence: ContextContradictionEvidence = {
      signalType: "context-contradiction",
      contradictionType: "missing-character-before-dialogue",
      expectedPrecedingType: "dialogue",
      actualPrecedingType: "character",
      windowSize: 1,
    };

    return [
      createSignal<ContextContradictionEvidence>({
        lineIndex: trace.lineIndex,
        family: "context",
        signalType: "context-contradiction",
        score: 0.6,
        reasonCode: "character-after-character",
        message: "شخصية تلي شخصية مباشرة — قد تكون الأولى حواراً",
        suggestedType: "dialogue",
        evidence,
        debug: {
          previousType,
        },
      }),
    ];
  }

  // Character after scene header with no action in between
  if (
    previousType === "scene_header_1" ||
    previousType === "scene_header_2" ||
    previousType === "scene_header_3"
  ) {
    const evidence: ContextContradictionEvidence = {
      signalType: "context-contradiction",
      contradictionType: "scene-header-sequence",
      expectedPrecedingType: "action",
      actualPrecedingType: previousType,
      windowSize: 1,
    };

    return [
      createSignal<ContextContradictionEvidence>({
        lineIndex: trace.lineIndex,
        family: "context",
        signalType: "context-contradiction",
        score: 0.4,
        reasonCode: "character-after-scene-header",
        message: "شخصية تلي رأس مشهد مباشرة دون وصف حركي",
        suggestedType: null,
        evidence,
        debug: {
          previousType,
        },
      }),
    ];
  }

  return [];
};
