import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import type { AlternativePullEvidence } from "@/suspicion-engine/types";
import { createSignal } from "@/suspicion-engine/helpers";

/**
 * @module gate-break/action-gate.detector
 * @description
 * كاشف بوابة الحدث — يرصد أسطر `action` تحمل أنماط شخصية أو حوار مضمنة:
 *
 * 1. سطر action يطابق نمط شخصية:
 *    - قصير + ينتهي بنقطتين + matchesCharacterPattern → مرشح قوي لـ `character`
 *
 * 2. سطر action يحتوي على مؤشرات حوار قوية:
 *    - matchesCharacterPattern = false، لكن النص طويل ومتواصل بدون علامات وصف
 *    - يُشير للنوع `dialogue` بقوة سحب منخفضة نسبياً
 *
 * يعيد إشارات AlternativePull لأن المشكلة هي جذب نوع بديل وليس خرق قاعدة بنيوية.
 */

// الحد الأقصى لطول سطر الشخصية (بالأحرف)
const CHARACTER_MAX_LENGTH = 40;

// أنماط الوصف/الحدث الشائعة في النص العربي — وجودها يُثبت أن السطر ليس حواراً
const ACTION_INDICATOR_PATTERNS: readonly RegExp[] = [
  /يدخل|يخرج|يُغلق|يفتح|يجلس|يقف|ينظر|يتجه|يمشي|يركض/u,
  /المشهد|الغرفة|الشارع|الباب|النافذة/u,
  /فجأة|ببطء|بسرعة|بهدوء|بحذر/u,
];

export const detectActionGateBreak: DetectorFn = (trace, line, context) => {
  // الكاشف يعمل فقط على أسطر الحدث
  if (line.type !== "action") return [];

  const signals = [];
  const { lineIndex } = trace;
  const { gate, competition } = context.features;

  // ── فحص 1: سطر action يشبه شخصية ────────────────────────────────────────
  // الشروط المجتمعة: قصير + نقطتان في النهاية + matchesCharacterPattern
  const looksLikeCharacter =
    gate.endsWithColon &&
    gate.lineLength <= CHARACTER_MAX_LENGTH &&
    gate.matchesCharacterPattern;

  if (looksLikeCharacter) {
    // نحسب قوة السحب — نبدأ من قيمة مسبقة ونرفع إذا كانت competition تدعمها
    const basePullStrength = 0.65;
    const pullStrength =
      competition.strongestAlternativeType === "character"
        ? Math.min(1.0, basePullStrength + competition.pullStrength * 0.3)
        : basePullStrength;

    // نجمع مراحل التصويت التي دعمت النوع البديل من passVotes
    const contributingStages = trace.passVotes
      .filter((v) => v.suggestedType === "character")
      .map((v) => v.stage);

    const evidence: AlternativePullEvidence = {
      signalType: "alternative-pull",
      suggestedType: "character",
      pullStrength,
      contributingStages:
        contributingStages.length > 0 ? contributingStages : ["gate-pattern"],
      keyPattern: "endsWithColon + short + matchesCharacterPattern",
    };

    signals.push(
      createSignal<AlternativePullEvidence>({
        lineIndex,
        family: "gate-break",
        signalType: "alternative-pull",
        score: 0.6,
        reasonCode: "ACTION_MATCHES_CHARACTER_PATTERN",
        message: `سطر action يطابق نمط الشخصية (قصير + ينتهي بـ \`:\`): "${line.text}"`,
        suggestedType: "character",
        evidence,
        debug: {
          lineLength: gate.lineLength,
          endsWithColon: gate.endsWithColon,
          matchesCharacterPattern: gate.matchesCharacterPattern,
          pullStrength,
        },
      })
    );
  }

  // ── فحص 2: سطر action يشبه حواراً ───────────────────────────────────────
  // الشروط: لا ينتهي بنقطتين + لا يطابق نمط الشخصية + لا يحتوي مؤشرات حدث
  // + النص طويل نسبياً (أكثر من 15 حرفاً) — مميزات الجملة الحوارية
  const isLongEnoughForDialogue = gate.lineLength > 15;
  const hasNoCharacterMarkers =
    !gate.endsWithColon && !gate.matchesCharacterPattern;
  const hasNoActionIndicators = !ACTION_INDICATOR_PATTERNS.some((pattern) =>
    pattern.test(line.text)
  );

  if (
    isLongEnoughForDialogue &&
    hasNoCharacterMarkers &&
    hasNoActionIndicators
  ) {
    // قوة سحب منخفضة لأن الدليل أقل وضوحاً من الفحص الأول
    const pullStrength =
      competition.strongestAlternativeType === "dialogue"
        ? Math.min(1.0, 0.4 + competition.pullStrength * 0.25)
        : 0.4;

    const contributingStages = trace.passVotes
      .filter((v) => v.suggestedType === "dialogue")
      .map((v) => v.stage);

    const evidence: AlternativePullEvidence = {
      signalType: "alternative-pull",
      suggestedType: "dialogue",
      pullStrength,
      contributingStages:
        contributingStages.length > 0 ? contributingStages : ["gate-pattern"],
      keyPattern: "long-line + no-action-indicators + no-colon",
    };

    signals.push(
      createSignal<AlternativePullEvidence>({
        lineIndex,
        family: "gate-break",
        signalType: "alternative-pull",
        score: 0.4,
        reasonCode: "ACTION_MATCHES_DIALOGUE_PATTERN",
        message: `سطر action يحمل مؤشرات حوار (طويل، بدون علامات وصف): "${line.text.slice(0, 40)}…"`,
        suggestedType: "dialogue",
        evidence,
        debug: {
          lineLength: gate.lineLength,
          hasNoCharacterMarkers,
          hasNoActionIndicators,
          pullStrength,
        },
      })
    );
  }

  return signals;
};
