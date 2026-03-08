import type {
  ClassificationTrace,
  GateFeatures,
} from "@/suspicion-engine/types";

const COLON_PATTERN = /[:：]$/;
const ARABIC_UPPER_START = /^[\u0600-\u06FF]/;
const TRANSITION_PATTERN = /^(قطع|مزج|ذوبان|CUT|FADE|DISSOLVE)/i;
const SCENE_HEADER_PATTERN = /^(داخلي|خارجي|INT|EXT)[.\s\-/]/i;
const CHARACTER_PATTERN = /^[\u0600-\u06FF\s]+[:：]$/;

export function extractGateFeatures(trace: ClassificationTrace): GateFeatures {
  const text = trace.normalizedText.trim();
  return {
    hasColon: text.includes(":") || text.includes("："),
    lineLength: text.length,
    startsWithUpperArabic: ARABIC_UPPER_START.test(text),
    endsWithColon: COLON_PATTERN.test(text),
    matchesCharacterPattern: CHARACTER_PATTERN.test(text),
    matchesTransitionPattern: TRANSITION_PATTERN.test(text),
    matchesSceneHeaderPattern: SCENE_HEADER_PATTERN.test(text),
  };
}
