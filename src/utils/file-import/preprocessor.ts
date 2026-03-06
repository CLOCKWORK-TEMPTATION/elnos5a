/**
 * @module utils/file-import/preprocessor
 * @description معالجة مسبقة للنصوص المستوردة قبل تمريرها لمُصنّف البنية.
 *
 * يُطبّق سلسلة تحويلات حسب نوع الملف:
 * - دمج الأسطر المكسورة (wrapped lines) عبر {@link mergeWrappedLines}
 * - إزالة رموز التعداد النقطي عبر {@link stripBulletPrefix}
 * - تطبيع مسافات ترويسات المشاهد عبر {@link normalizeSceneHeaderSpacing}
 * - تطبيع أسطر الحوار المُعلَّمة بنقاط عبر {@link normalizeDialogueBulletLine}
 * - حساب درجة جودة النص المستورد عبر {@link computeImportedTextQualityScore}
 *
 * كل دالة تُرجع {@link ImportPreprocessResult} مع قائمة الخطوات المُطبَّقة.
 */
import type { ImportedFileType } from "../../types/file-import";

/**
 * نتيجة المعالجة المسبقة للنص المستورد.
 * @property text - النص بعد المعالجة
 * @property applied - أسماء خطوات المعالجة المُطبَّقة
 */
export interface ImportPreprocessResult {
  text: string;
  applied: string[];
}

const normalizeNewlines = (value: string): string =>
  (value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const stripDirectionalMarks = (value: string): string =>
  (value ?? "").replace(/[\u200E\u200F\u061C\uFEFF]/g, "");

const SCENE_STATUS_TOKENS =
  "نهار|ليل|صباح|مساء|فجر|داخلي|خارجي|داخل\\s*[-/]\\s*خارجي|خارج\\s*[-/]\\s*داخلي";

/**
 * يُطبّع مسافات ترويسات المشاهد لضمان وجود فاصلة ` - ` بين
 * رقم المشهد وحالة الزمن/المكان (مثلاً: `مشهد 3 - نهار`).
 *
 * يعالج ثلاث حالات: أرقام ملتصقة، مسافة واحدة بدون فاصل، ومسافات متعددة.
 */
const normalizeSceneHeaderSpacing = (line: string): string => {
  let normalized = line;

  normalized = normalized.replace(
    /(^|\s)(مشهد|scene)\s*([0-9٠-٩]+)/giu,
    (_match, prefix: string, word: string, number: string) =>
      `${prefix}${word} ${number}`
  );

  normalized = normalized.replace(
    new RegExp(
      `^((?:مشهد|scene)\\s*[0-9٠-٩]+)\\s+(?=(?:${SCENE_STATUS_TOKENS})\\b)`,
      "iu"
    ),
    "$1 - "
  );

  normalized = normalized.replace(
    /^((?:مشهد|scene)\s*[0-9٠-٩]+)\s{2,}(.*)$/iu,
    (_match, firstPart: string, secondPart: string) =>
      `${firstPart.trim()} - ${secondPart.trim()}`
  );

  return normalized;
};

const looksLikeCharacterCue = (line: string): boolean =>
  /[:：]\s*$/.test(stripDirectionalMarks(line).trim()) &&
  stripDirectionalMarks(line).trim().length <= 48;

const BULLET_PREFIX_REGEX =
  /^[\s\u200E\u200F\u061C\uFEFF]*[•·∙⋅●○◦■□▪▫◆◇–—−‒―‣⁃*+-]+\s*/u;

/**
 * يزيل رمز التعداد النقطي من بداية السطر (•, ●, -, *, إلخ).
 * @returns كائن يحتوي السطر بعد الإزالة وعلامة تُشير إلى حدوث الإزالة
 */
const stripBulletPrefix = (
  line: string
): { line: string; stripped: boolean } => {
  const strippedLine = line.replace(BULLET_PREFIX_REGEX, "");
  return {
    line: strippedLine,
    stripped: strippedLine !== line,
  };
};

/**
 * يتحقق ممّا إذا كانت القيمة تبدو كاسم شخصية (متحدث).
 * الشروط: ≤28 حرفاً، ≤4 كلمات، أحرف وأرقام فقط، ليست كلمة مفتاحية محجوزة.
 */
const isLikelySpeakerName = (value: string): boolean => {
  const name = stripDirectionalMarks(value).replace(/\s+/g, " ").trim();
  if (!name || name.length > 28) return false;
  if (name.split(" ").length > 4) return false;
  if (!/^[\p{L}\p{N}\s]+$/u.test(name)) return false;
  if (/^(?:مشهد|scene|قطع|انتقال|داخلي|خارجي)$/iu.test(name)) return false;
  return true;
};

const hasLikelyNarrativeSignal = (line: string): boolean => {
  const normalized = stripDirectionalMarks(line).trim();
  if (!normalized) return false;
  return (
    /(?:^|\s)(?:وهو|وهي|ثم|بينما|بعد|قبل)(?:\s|$)/u.test(normalized) ||
    /(?:^|\s)[يتنأ][\u0600-\u06FF]{2,}(?:\s|$)/u.test(normalized)
  );
};

const endsWithLikelyActionTail = (value: string): boolean =>
  /(?:ا|اً|ان|ين|ه|ها|هم|ني|نا|ك|كم|كن)$/u.test((value ?? "").trim());

const isSafeStandaloneCue = (value: string): boolean => {
  const wordCount = stripDirectionalMarks(value)
    .split(/\s+/)
    .filter(Boolean).length;
  if (wordCount <= 2) return true;
  if (wordCount === 3 && !hasLikelyNarrativeSignal(value)) return true;
  return false;
};

/**
 * يُطبّع سطر حوار مُعلَّم بنقطة (bullet) إلى صيغة `اسم : حوار`.
 * يعالج حالتين: اسم فقط مع نقطتين، واسم + حوار في نفس السطر.
 * @returns مصفوفة بسطر واحد أو أكثر بعد التطبيع
 */
const normalizeDialogueBulletLine = (line: string): string[] => {
  const cueOnlyMatch = line.match(/^([^:：]{1,42})\s*[:：]\s*$/u);
  if (cueOnlyMatch) {
    const speaker = cueOnlyMatch[1]?.trim() ?? "";
    if (speaker && isLikelySpeakerName(speaker)) {
      if (isSafeStandaloneCue(speaker)) {
        return [`${speaker}:`];
      }
    }
  }

  const inlineMatch = line.match(/^([^:：]{1,42})\s*[:：]\s*(.+)$/u);
  if (!inlineMatch) return [line];

  const speaker = inlineMatch[1]?.trim() ?? "";
  const dialogue = inlineMatch[2]?.trim() ?? "";
  if (!speaker || !dialogue || !isLikelySpeakerName(speaker)) return [line];

  return [`${speaker} : ${dialogue}`];
};

/**
 * يفصل اسم شخصية ملتصق بنهاية سطر سرد (مثل: "يرفع يده معترضامحمود:")
 * إلى سطرين مستقلين: "يرفع يده معترضا" ثم "محمود:"
 * حتى لا يُصنف السطر كاملًا كـ character.
 */
const splitAttachedSpeakerCueLine = (line: string): string[] => {
  const normalizedLine = stripDirectionalMarks(line)
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedLine) return [line];
  if (!/[:：]\s*$/.test(normalizedLine)) return [line];

  const withoutColon = normalizedLine.replace(/[:：]\s*$/u, "").trim();
  if (!withoutColon) return [line];
  if (isLikelySpeakerName(withoutColon)) {
    if (isSafeStandaloneCue(withoutColon)) {
      return [`${withoutColon}:`];
    }
  }

  const words = withoutColon.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [line];

  // حالة التصاق اسم الشخصية بآخر كلمة: "... معترضامحمود:"
  const lastToken = words[words.length - 1] ?? "";
  const basePrefix = words.slice(0, -1).join(" ").trim();
  if (
    lastToken.length >= 6 &&
    basePrefix.split(/\s+/).filter(Boolean).length >= 2
  ) {
    const minSpeakerLength = 4;
    const maxSpeakerLength = Math.min(8, lastToken.length - 2);
    for (
      let speakerLength = minSpeakerLength;
      speakerLength <= maxSpeakerLength;
      speakerLength += 1
    ) {
      const tokenPrefix = lastToken.slice(0, -speakerLength);
      const speaker = lastToken.slice(-speakerLength);
      if (!tokenPrefix || !speaker) continue;
      if (!isLikelySpeakerName(speaker)) continue;
      if (!endsWithLikelyActionTail(tokenPrefix)) continue;

      const narrativePrefix = `${basePrefix} ${tokenPrefix}`.trim();
      if (narrativePrefix.split(/\s+/).filter(Boolean).length < 3) continue;
      if (!hasLikelyNarrativeSignal(narrativePrefix)) continue;

      return [narrativePrefix, `${speaker}:`];
    }
  }

  return [line];
};

/**
 * يتحقق ممّا إذا كان السطر حدّاً بنيوياً (سطر فارغ، انتقال، ترويسة مشهد، أو إشارة متحدث).
 * يُستخدم في {@link shouldJoinWrappedLine} لمنع دمج الأسطر عبر حدود البنية.
 */
const looksLikeBoundaryLine = (line: string): boolean => {
  const trimmed = stripDirectionalMarks(line).trim();
  if (!trimmed) return true;
  if (/^(?:قطع|cut\s+to|انتقال)/iu.test(trimmed)) return true;
  if (/^(?:مشهد|scene)\s*[0-9٠-٩]+/iu.test(trimmed)) return true;
  const inlineCueMatch = trimmed.match(/^([^:：]{1,30})\s*[:：]\s+\S+/u);
  if (inlineCueMatch && isLikelySpeakerName(inlineCueMatch[1] ?? ""))
    return true;
  if (looksLikeCharacterCue(trimmed)) return true;
  return false;
};

const endsWithStrongPunctuation = (line: string): boolean =>
  /[.!؟?!…:：]\s*$/u.test(stripDirectionalMarks(line).trim());

/**
 * يُقرر ما إذا كان يجب دمج سطرين متتاليين (السطر الحالي مع السابق).
 * يعتمد على: علامات الترقيم القوية، حدود البنية، طول الأسطر، والأقواس المفتوحة.
 */
const shouldJoinWrappedLine = (previous: string, current: string): boolean => {
  const prev = previous.trim();
  const curr = current.trim();
  if (!prev || !curr) return false;
  if (looksLikeBoundaryLine(prev) || looksLikeBoundaryLine(curr)) return false;
  if (endsWithStrongPunctuation(prev)) return false;
  if (/^(?:\.{3}|…|،|و|ثم)/u.test(curr)) return true;
  if (curr.length <= 16) return true;
  if (prev.length >= 90 && curr.length <= 90) return true;
  if ((prev.match(/\(/g) ?? []).length > (prev.match(/\)/g) ?? []).length)
    return true;
  return false;
};

/**
 * يدمج الأسطر المكسورة (wrapped) في نص خام إلى أسطر منطقية كاملة.
 * يُطبّق تسلسل: إزالة علامات الاتجاه → تطبيع المسافات → تطبيع ترويسات المشاهد
 * → إزالة التعداد النقطي → تطبيع أسطر الحوار → دمج الأسطر المتتالية.
 *
 * @param rawText - النص الخام المستورد
 * @returns النص بعد دمج الأسطر المكسورة
 */
const mergeWrappedLines = (rawText: string): string => {
  const inputLines = normalizeNewlines(rawText).split("\n");
  const output: string[] = [];

  for (const sourceLine of inputLines) {
    const cleanedLine = stripDirectionalMarks(sourceLine)
      .replace(/\t+/g, "    ")
      .trim();
    const sceneNormalizedLine = normalizeSceneHeaderSpacing(cleanedLine);
    const collapsedLine = sceneNormalizedLine.replace(/\s+/g, " ").trim();
    const { line: withoutBullet } = stripBulletPrefix(collapsedLine);
    const normalizedSegments = normalizeDialogueBulletLine(
      withoutBullet
    ).flatMap(splitAttachedSpeakerCueLine);

    if (normalizedSegments.every((segment) => !segment.trim())) {
      if (output.length > 0 && output[output.length - 1] !== "") {
        output.push("");
      }
      continue;
    }

    for (const segment of normalizedSegments) {
      const normalizedLine = segment.trim();
      if (!normalizedLine) continue;

      const lastIndex = output.length - 1;
      if (
        lastIndex >= 0 &&
        output[lastIndex] &&
        shouldJoinWrappedLine(output[lastIndex], normalizedLine)
      ) {
        output[lastIndex] =
          `${output[lastIndex].trim()} ${normalizedLine}`.trim();
        continue;
      }

      output.push(normalizedLine);
    }
  }

  while (output.length > 0 && output[output.length - 1] === "") {
    output.pop();
  }

  return output.join("\n");
};

/**
 * يُطبّع نص DOC المستخرج عبر أداة Antiword في Backend.
 * يُطبّق دمج الأسطر المكسورة وتطبيع مسافات ترويسات المشاهد.
 *
 * @param text - النص الخام من Antiword
 * @returns نتيجة المعالجة مع خطوات التطبيع المُطبَّقة
 */
export const normalizeDocTextFromAntiword = (
  text: string
): ImportPreprocessResult => {
  const merged = mergeWrappedLines(text);
  const hasSceneFixes =
    /\b(?:مشهد|scene)\s*[0-9٠-٩]+/iu.test(text) &&
    !/\b(?:مشهد|scene)\s+[0-9٠-٩]+/iu.test(text);

  return {
    text: merged.trim(),
    applied: [
      "antiword-tab-normalization",
      "antiword-wrapped-lines-normalized",
      ...(hasSceneFixes ? ["antiword-scene-header-spacing"] : []),
    ],
  };
};

/**
 * نقطة الدخول الرئيسية للمعالجة المسبقة. يختار استراتيجية التطبيع
 * حسب نوع الملف:
 * - `doc` → {@link normalizeDocTextFromAntiword}
 * - أخرى → تطبيع فواصل الأسطر فقط
 *
 * @param text - النص المستخرج من الملف
 * @param fileType - نوع الملف المصدر
 * @returns نتيجة المعالجة مع خطوات التطبيع المُطبَّقة
 */
export const preprocessImportedTextForClassifier = (
  text: string,
  fileType: ImportedFileType
): ImportPreprocessResult => {
  switch (fileType) {
    case "doc":
      return normalizeDocTextFromAntiword(text);
    case "docx": {
      const merged = mergeWrappedLines(text);
      const applied =
        merged !== text
          ? ["docx-tab-spacing-normalization", "docx-wrapped-lines-normalized"]
          : ["docx-tab-spacing-normalization"];
      return { text: merged.trim(), applied };
    }
    default:
      return { text: normalizeNewlines(text).trim(), applied: [] };
  }
};

/**
 * يحسب درجة جودة النص المستورد (0–1). كلما ارتفعت الدرجة كان النص أنظف.
 *
 * يرصد الشذوذات: أرقام مشاهد ملتصقة (وزن 2)، رموز تعداد (1.2)،
 * أسطر قصيرة جداً (1)، وأسطر بدون علامة ترقيم نهائية (0.7).
 *
 * المعادلة: `max(0, 1 - anomalies / (lines * 2.2))`
 *
 * @param text - النص المُعالَج مسبقاً
 * @returns درجة الجودة مقرّبة لثلاثة أرقام عشرية
 */
export const computeImportedTextQualityScore = (text: string): number => {
  const lines = normalizeNewlines(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return 0;

  let anomalies = 0;
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1] ?? "";

    if (/مشهد[0-9٠-٩]/u.test(current)) anomalies += 2;
    if (BULLET_PREFIX_REGEX.test(current)) anomalies += 1.2;
    if (current.length <= 8 && !looksLikeCharacterCue(current)) anomalies += 1;
    if (
      i < lines.length - 1 &&
      !endsWithStrongPunctuation(current) &&
      !looksLikeBoundaryLine(current) &&
      !looksLikeBoundaryLine(next)
    ) {
      anomalies += 0.7;
    }
  }

  const denominator = Math.max(1, lines.length * 2.2);
  const score = Math.max(0, 1 - anomalies / denominator);
  return Number(score.toFixed(3));
};
