import type { ExtractedLine, LineQuality } from "../types";

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
const DIGIT_RE = /[0-9٠-٩]/g;
const PUNCT_RE = /[.,;:!?،؛()\x5B\x5D{}"'—–-]/g;

// أحرف غريبة شائعة في OCR/استخراج سيئ
const WEIRD_RE = /[�□■▪●◦◆◇¤§±©®™`~^_|\\]/g;

// أنماط تشير إلى كسر عربي/فصل غير طبيعي
const BROKEN_ARABIC_PATTERNS: RegExp[] = [
  /[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويى]\s+[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويى]\s+[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويى]\s+[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويى]/,
  /[:：]\s*$/, // سطر ينتهي بنقطتين غالبًا حوار ناقص
];

// أنماط حوار/عنصر سيناريو مشبوه
const SUSPICIOUS_DIALOGUE_PATTERNS: RegExp[] = [
  /^[^:]{1,40}\s*[:：]\s*$/, // اسم شخصية فقط بدون جملة
  /[:：].{0,2}$/, // حوار ناقص جدًا بعد النقطتين
];

export function scoreLine(text: string): LineQuality {
  const len = Math.max(text.length, 1);
  const arabicCount = (text.match(ARABIC_RE) || []).length;
  const digitCount = (text.match(DIGIT_RE) || []).length;
  const punctCount = (text.match(PUNCT_RE) || []).length;
  const weirdCount = (text.match(WEIRD_RE) || []).length;

  const arabicRatio = arabicCount / len;
  const digitRatio = digitCount / len;
  const punctuationRatio = punctCount / len;
  const weirdCharRatio = weirdCount / len;

  const hasBrokenArabicPattern = BROKEN_ARABIC_PATTERNS.some((rx) =>
    rx.test(text)
  );
  const suspiciousDialoguePattern = SUSPICIOUS_DIALOGUE_PATTERNS.some((rx) =>
    rx.test(text)
  );

  const probableArtifact =
    /^\s*\d+\s*$/.test(text) ||
    /^[-—–]{3,}$/.test(text) ||
    /^(page|footer|header)\b/i.test(text.trim());

  const reasons: string[] = [];
  let score = 1.0;

  if (weirdCharRatio > 0.12) {
    score -= 0.35;
    reasons.push("weird_char_ratio_high");
  }
  if (hasBrokenArabicPattern) {
    score -= 0.2;
    reasons.push("broken_arabic_pattern");
  }
  if (suspiciousDialoguePattern) {
    score -= 0.15;
    reasons.push("suspicious_dialogue_pattern");
  }
  if (probableArtifact) {
    score -= 0.4;
    reasons.push("probable_artifact");
  }
  if (text.trim().length === 0) {
    score -= 0.5;
    reasons.push("empty");
  }

  score = Math.max(0, Math.min(1, score));

  return {
    score,
    reasons,
    weirdCharRatio,
    arabicRatio,
    digitRatio,
    punctuationRatio,
    hasBrokenArabicPattern,
    suspiciousDialoguePattern,
    probableArtifact,
  };
}

export function applyQualityScoring(lines: ExtractedLine[]): ExtractedLine[] {
  for (const l of lines) {
    l.quality = scoreLine(l.text);
    if (l.quality.score < 0.62) l.flags.push("suspicious");
  }
  return lines;
}
