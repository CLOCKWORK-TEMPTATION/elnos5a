import type { DetectorFn } from "@/suspicion-engine/detectors/detector-interface";
import type { GateBreakEvidence } from "@/suspicion-engine/types";
import { createSignal } from "@/suspicion-engine/helpers";

/**
 * @module gate-break/dialogue-gate.detector
 * @description
 * كاشف بوابة الحوار — يرصد أسطر الحوار التي تظهر بدون شخصية سابقة (حوار يتيم).
 *
 * القاعدة: أي سطر `dialogue` يجب أن يسبقه سطر `character` أو `parenthetical`
 * ضمن نافذة بحث مكونة من 1-3 جيران سابقين.
 *
 * - نافذة 1 جار: شدة عالية (0.7) — لا يوجد شيء مباشر قبل الحوار
 * - نافذة 3 جيران: شدة متوسطة (0.5) — الشخصية بعيدة
 */

// أنواع مقبولة تسبق الحوار ضمن نافذة البحث
const VALID_PRECEDING_TYPES = new Set([
  "character",
  "parenthetical",
  "dialogue",
]);

export const detectDialogueGateBreak: DetectorFn = (trace, line, context) => {
  // الكاشف يعمل فقط على أسطر الحوار
  if (line.type !== "dialogue") return [];

  const { lineIndex } = trace;

  // نجمع الجيران السابقين فقط، مرتبين من الأقرب للأبعد
  const precedingNeighborsSorted = context.neighbors
    .map((neighbor, idx) => ({
      neighbor,
      neighborLineIndex: context.neighborTraces[idx]?.lineIndex ?? -1,
    }))
    .filter(
      ({ neighborLineIndex }) =>
        neighborLineIndex < lineIndex && neighborLineIndex >= 0
    )
    .sort((a, b) => b.neighborLineIndex - a.neighborLineIndex); // الأحدث أولاً

  // إذا لم يكن هناك أي جار سابق فهذا هو السطر الأول — نتجاوز
  if (precedingNeighborsSorted.length === 0) return [];

  // نفحص هل يوجد شخصية أو parenthetical ضمن أقرب 3 جيران سابقين
  const windowSize = Math.min(3, precedingNeighborsSorted.length);
  const window = precedingNeighborsSorted.slice(0, windowSize);

  const hasValidAnchor = window.some(({ neighbor }) =>
    VALID_PRECEDING_TYPES.has(neighbor.type)
  );

  if (hasValidAnchor) return [];

  // لا يوجد مرساة صالحة — حوار يتيم
  const immediatelyPreviousType =
    precedingNeighborsSorted[0]?.neighbor.type ?? null;
  const actualWindowSize = window.length;

  // الشدة مرتبطة بحجم النافذة المفحوصة
  // نافذة 1: النوع المجاور مباشرة ليس شخصية → شدة عالية
  // نافذة 2-3: لم يُعثر على شخصية في نطاق أوسع → شدة متوسطة
  const score = actualWindowSize <= 1 ? 0.7 : 0.5;

  const evidence: GateBreakEvidence = {
    signalType: "gate-break",
    brokenGateRule: "dialogue-must-be-preceded-by-character",
    expectedPattern:
      "قبل سطر الحوار يجب أن يكون `character` أو `parenthetical` ضمن 3 أسطر",
    actualPattern:
      immediatelyPreviousType !== null
        ? `السطر السابق المباشر هو: "${immediatelyPreviousType}"`
        : "لا يوجد سطر سابق في النافذة",
    gateType: "dialogue",
  };

  return [
    createSignal<GateBreakEvidence>({
      lineIndex,
      family: "gate-break",
      signalType: "gate-break",
      score,
      reasonCode: "DIALOGUE_ORPHAN_NO_CHARACTER_ANCHOR",
      message: `حوار يتيم — لم يُعثر على شخصية في آخر ${actualWindowSize} سطر سابق`,
      suggestedType: null,
      evidence,
      debug: {
        windowSize: actualWindowSize,
        immediatelyPreviousType: immediatelyPreviousType ?? "none",
        lineIndex,
      },
    }),
  ];
};
