import type { ContextContradictionEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

export const detectSequenceViolation: DetectorFn = (trace, line, context) => {
  const { previousType, nextType, dialogueBlockDepth } =
    context.features.context;

  // Transition not at the end of a scene — next element exists and is not a scene header
  if (line.type === "transition") {
    if (nextType !== null && nextType !== "scene_header_1") {
      const evidence: ContextContradictionEvidence = {
        signalType: "context-contradiction",
        contradictionType: "transition-position",
        expectedPrecedingType: null,
        actualPrecedingType: previousType,
        windowSize: 1,
      };

      return [
        createSignal<ContextContradictionEvidence>({
          lineIndex: trace.lineIndex,
          family: "context",
          signalType: "context-contradiction",
          score: 0.5,
          reasonCode: "transition-not-at-scene-end",
          message: `انتقال في موضع غير صحيح — العنصر التالي هو "${nextType}" وليس رأس مشهد`,
          suggestedType: null,
          evidence,
          debug: {
            nextType,
            previousType: previousType ?? null,
          },
        }),
      ];
    }

    return [];
  }

  // Dialogue block interrupted by action then resumed — dialogueBlockDepth > 1
  // signals that a dialogue block was broken and restarted
  if (
    line.type === "dialogue" &&
    previousType === "action" &&
    dialogueBlockDepth > 1
  ) {
    const evidence: ContextContradictionEvidence = {
      signalType: "context-contradiction",
      contradictionType: "dialogue-block-interrupted",
      expectedPrecedingType: "character",
      actualPrecedingType: "action",
      windowSize: dialogueBlockDepth,
    };

    return [
      createSignal<ContextContradictionEvidence>({
        lineIndex: trace.lineIndex,
        family: "context",
        signalType: "context-contradiction",
        score: 0.3,
        reasonCode: "dialogue-block-interrupted-by-action",
        message: "كتلة حوار مقطوعة بوصف حركي ثم استُؤنفت",
        suggestedType: null,
        evidence,
        debug: {
          dialogueBlockDepth,
          previousType: previousType ?? null,
        },
      }),
    ];
  }

  return [];
};
