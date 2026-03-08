import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import type { GateBreakEvidence } from "@/suspicion-engine/types";
import { createSignal } from "@/suspicion-engine/helpers";

/**
 * @module gate-break/character-gate.detector
 * @description
 * كاشف بوابة الشخصية — يرصد أسطر الشخصية التي تخرق قواعد البوابة:
 *
 * 1. شخصية بدون نقطتين `:` في النهاية
 * 2. شخصية لا يتبعها سطر حوار مباشر
 */

export const detectCharacterGateBreak: DetectorFn = (trace, line, context) => {
  // الكاشف يعمل فقط على أسطر الشخصية
  if (line.type !== "character") return [];

  const signals = [];
  const { lineIndex } = trace;
  const { gate } = context.features;

  // ── قاعدة 1: شخصية بدون نقطتين في النهاية ──────────────────────────────
  // السطر المصنف شخصية يجب أن ينتهي بـ `:` دائماً في نص السيناريو العربي
  if (!gate.endsWithColon) {
    const evidence: GateBreakEvidence = {
      signalType: "gate-break",
      brokenGateRule: "character-must-end-with-colon",
      expectedPattern: "سطر الشخصية ينتهي بـ `:` — مثال: `أحمد:`",
      actualPattern: gate.endsWithColon
        ? "ينتهي بنقطتين"
        : `لا ينتهي بنقطتين — النص: "${line.text.slice(-6)}"`,
      gateType: "character",
    };

    signals.push(
      createSignal<GateBreakEvidence>({
        lineIndex,
        family: "gate-break",
        signalType: "gate-break",
        // خرق صارم — نقطتان إلزامية للشخصية
        score: 0.75,
        reasonCode: "CHARACTER_NO_TRAILING_COLON",
        message: `سطر شخصية بدون نقطتين في النهاية: "${line.text}"`,
        suggestedType: "action",
        evidence,
        debug: {
          endsWithColon: gate.endsWithColon,
          lineLength: gate.lineLength,
          matchesCharacterPattern: gate.matchesCharacterPattern,
        },
      })
    );
  }

  // ── قاعدة 2: شخصية لا يتبعها سطر حوار ─────────────────────────────────
  // نبحث في الجيران عن السطر الذي يأتي مباشرة بعد هذا السطر
  // context.neighbors يحتوي على الجيران (قبل وبعد) بدون ضمان الترتيب المطلق
  // نعتمد على lineIndex لإيجاد الجار التالي الأقرب
  const nextNeighbor = context.neighbors.find(
    (_n, idx) => context.neighborTraces[idx]?.lineIndex === lineIndex + 1
  );

  const nextType = nextNeighbor?.type ?? null;

  if (
    nextType !== null &&
    nextType !== "dialogue" &&
    nextType !== "parenthetical"
  ) {
    const evidence: GateBreakEvidence = {
      signalType: "gate-break",
      brokenGateRule: "character-must-be-followed-by-dialogue",
      expectedPattern:
        "بعد سطر الشخصية يجب أن يأتي `dialogue` أو `parenthetical`",
      actualPattern: `السطر التالي هو: "${nextType}"`,
      gateType: "character",
    };

    // الخطورة أعلى إذا كان يتبعها action أو scene_header
    const isHighSeverityFollower =
      nextType === "action" ||
      nextType === "scene_header_1" ||
      nextType === "scene_header_2" ||
      nextType === "scene_header_3";

    signals.push(
      createSignal<GateBreakEvidence>({
        lineIndex,
        family: "gate-break",
        signalType: "gate-break",
        score: isHighSeverityFollower ? 0.8 : 0.6,
        reasonCode: "CHARACTER_NOT_FOLLOWED_BY_DIALOGUE",
        message: `سطر شخصية لا يتبعه حوار — النوع التالي: "${nextType}"`,
        suggestedType: null,
        evidence,
        debug: {
          nextType,
          isHighSeverityFollower,
          lineIndex,
        },
      })
    );
  }

  return signals;
};
