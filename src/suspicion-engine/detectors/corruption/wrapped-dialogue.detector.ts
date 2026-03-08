import type { RawCorruptionEvidence } from "@/suspicion-engine/types";
import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import { createSignal } from "@/suspicion-engine/helpers";

/**
 * @module corruption/wrapped-dialogue.detector
 * @description
 * كاشف الحوار الملتف — يرصد أسطر حوار التفّت على سطر جديد وصُنِّفت خطأً كـ `action`.
 *
 * الشروط المجتمعة:
 * 1. السطر الحالي نوعه `action`
 * 2. السطر السابق نوعه `dialogue`
 * 3. السياق داخل كتلة حوار نشطة (dialogueBlockDepth > 0)
 * 4. السطر لا يحتوي على مؤشرات حركة قوية (شرطة أو رصاصة)
 */

// مؤشرات الحركة القوية التي تعني أن السطر ليس استمراراً للحوار
const ACTION_INDICATOR_PATTERN = /^[-\u2013\u2014\u2022*#]/;

export const detectWrappedDialogue: DetectorFn = (trace, line, context) => {
  if (line.type !== "action") return [];

  const { previousType, dialogueBlockDepth } = context.features.context;

  if (previousType !== "dialogue") return [];
  if (dialogueBlockDepth <= 0) return [];

  // سطر لا يحتوي على مؤشر حركة قوي في بدايته
  const trimmed = line.text.trim();
  if (ACTION_INDICATOR_PATTERN.test(trimmed)) return [];

  // الدرجة تتناسب مع عمق كتلة الحوار — كلما كان أعمق زادت الشبهة
  const depthFactor = Math.min(dialogueBlockDepth * 0.1, 0.2);
  const score = Math.min(0.4 + depthFactor, 0.6);

  const evidence: RawCorruptionEvidence = {
    signalType: "raw-corruption",
    corruptionType: "broken-words",
    qualityScore: context.features.rawQuality.qualityScore,
    affectedSegments: [line.text],
    weirdCharRatio: context.features.rawQuality.weirdCharRatio,
    arabicRatio: context.features.rawQuality.arabicRatio,
  };

  return [
    createSignal<RawCorruptionEvidence>({
      lineIndex: trace.lineIndex,
      family: "corruption",
      signalType: "raw-corruption",
      score,
      reasonCode: "WRAPPED_DIALOGUE_AS_ACTION",
      message: `سطر action داخل كتلة حوار (عمق: ${dialogueBlockDepth}) بعد dialogue مباشرة — قد يكون استمراراً للحوار: "${line.text}"`,
      suggestedType: "dialogue",
      evidence,
      debug: {
        previousType,
        dialogueBlockDepth,
        score,
        lineIndex: trace.lineIndex,
      },
    }),
  ];
};
