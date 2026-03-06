import type { ExtractedLine } from "../types";

const SCENE_HINT_RE = /(داخلي|خارجي|ليل|نهار|فجر|مساء|صباح)/;
const TRANSITION_RE = /^(قطع|إظلام|مزج|انتقال|قطع إلى)\s*$/;

export function validateArabicScreenplayLine(line: ExtractedLine): string[] {
  const t = line.text.trim();
  const flags: string[] = [];

  if (!t) return flags;

  // Header/footer-like remains
  if (/^\d+$/.test(t)) flags.push("screenplay_artifact_page_number");

  // حوار ناقص
  if (/^[^:]{1,40}\s*[:：]\s*$/.test(t))
    flags.push("screenplay_incomplete_dialogue");

  // انتقالات صحيحة غالبًا يجب أن تكون مستقلة
  if (TRANSITION_RE.test(t) && t.includes(" ")) {
    // okay
  }

  // سطر يحتوي مؤشرات مشهد + كلام كثير جدًا بدون فواصل قد يكون دمجًا خاطئًا
  if (SCENE_HINT_RE.test(t) && t.length > 140 && /[:：]/.test(t)) {
    flags.push("possible_merged_scene_and_dialogue");
  }

  // إذا السطر فيه "اسم :" لكن بعده فعل وصفي واضح جدًا قد يكون دمج حوار + أكشن
  if (
    /^[^:]{1,40}\s*[:：]\s+.*(يدخل|يخرج|ينهض|يجلس|تقف|تجلس|ينظر|يمشي)(\s|$)/.test(
      t
    )
  ) {
    flags.push("possible_dialogue_action_merge");
  }

  // سطر قصير جدًا غير مفهوم
  if (t.length <= 2 && !TRANSITION_RE.test(t)) {
    flags.push("too_short_unclassified");
  }

  return flags;
}

export function applyScreenplayValidation(
  lines: ExtractedLine[]
): ExtractedLine[] {
  for (const l of lines) {
    const f = validateArabicScreenplayLine(l);
    for (const flag of f) {
      if (!l.flags.includes(flag)) l.flags.push(flag);
    }
    if (f.length > 0 && !l.flags.includes("suspicious")) {
      l.flags.push("suspicious");
      l.quality.score = Math.min(l.quality.score, 0.6);
      l.quality.reasons.push(...f);
    }
  }
  return lines;
}
