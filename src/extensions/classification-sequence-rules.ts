/**
 * @module extensions/classification-sequence-rules
 * @description
 * قواعد تسلسل التصنيف — يحدد التسلسلات الصالحة بين أنواع عناصر السيناريو
 * ودرجات خطورة الانتهاكات.
 *
 * يُصدّر:
 * - {@link SequenceSuggestionFeatures} — خصائص السطر المُستخدمة لاقتراح النوع
 * - {@link CLASSIFICATION_VALID_SEQUENCES} — خريطة التسلسلات الصالحة (نوع → أنواع تالية مسموحة)
 * - {@link CLASSIFICATION_SEQUENCE_VIOLATION_SEVERITY} — درجة خطورة كل انتهاك تسلسل
 * - {@link suggestTypeFromClassificationSequence} — يقترح النوع التالي بناءً على النوع السابق والخصائص
 *
 * يُستهلك في {@link PostClassificationReviewer} لكشف انتهاكات التسلسل.
 */
import type { ElementType } from "./classification-types";
export const CLASSIFICATION_VALID_SEQUENCES: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  ["character", new Set(["dialogue", "parenthetical"])],
  ["parenthetical", new Set(["dialogue"])],
  [
    "dialogue",
    new Set(["dialogue", "action", "character", "transition", "parenthetical"]),
  ],
  ["action", new Set(["action", "character", "transition", "scene_header_1"])],
  ["transition", new Set(["scene_header_1", "action"])],
  ["scene_header_1", new Set(["scene_header_2", "scene_header_3", "action"])],
  ["scene_header_2", new Set(["scene_header_3", "action", "character"])],
  ["scene_header_3", new Set(["action", "character"])],
  ["basmala", new Set(["scene_header_1", "action", "character"])],
]);

export const CLASSIFICATION_SEQUENCE_VIOLATION_SEVERITY: ReadonlyMap<
  string,
  number
> = new Map([
  ["character→character", 95],
  ["character→action", 80],
  ["character→transition", 80],
  ["parenthetical→action", 90],
  ["parenthetical→character", 90],
  ["parenthetical→transition", 90],
  ["transition→dialogue", 80],
  ["transition→character", 75],
  ["scene_header_1→dialogue", 70],
  ["scene_header_2→dialogue", 70],
  ["scene_header_3→dialogue", 70],
  ["scene_header_1→action", 75],
  ["scene_header_1→character", 75],
  ["scene_header_2→action", 75],
  ["scene_header_2→character", 75],
]);

export interface ClassificationSequenceSuggestionFeatures {
  isParenthetical: boolean;
  endsWithColon: boolean;
  wordCount: number;
  hasPunctuation: boolean;
  startsWithDash: boolean;
  hasActionIndicators: boolean;
}

export const suggestTypeFromClassificationSequence = (
  prevType: ElementType | string,
  features: ClassificationSequenceSuggestionFeatures
): ElementType | null => {
  if (prevType === "character") {
    return features.isParenthetical
      ? ("parenthetical" as ElementType)
      : ("dialogue" as ElementType);
  }

  if (prevType === "parenthetical") {
    return "dialogue" as ElementType;
  }

  if (prevType === "dialogue") {
    if (features.startsWithDash || features.hasActionIndicators) {
      return "action" as ElementType;
    }
    if (
      features.endsWithColon ||
      (features.wordCount <= 3 && !features.hasPunctuation)
    ) {
      return "character" as ElementType;
    }
    return "action" as ElementType;
  }

  if (prevType === "transition") {
    return "scene_header_1" as ElementType;
  }

  if (prevType === "scene_header_1") {
    return "scene_header_2" as ElementType;
  }

  if (prevType === "scene_header_2") {
    return "scene_header_3" as ElementType;
  }

  if (prevType === "scene_header_3") {
    return "action" as ElementType;
  }

  return null;
};
