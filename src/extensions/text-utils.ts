/**
 * @module extensions/text-utils
 * @description
 * أدوات معالجة النصوص — تطبيع، تنظيف، واكتشاف أنماط الوصف والحوار.
 *
 * يُصدّر:
 * - {@link INVISIBLE_CHARS_RE} — نمط حذف الحروف غير المرئية
 * - {@link STARTS_WITH_BULLET_RE} — نمط كشف النقاط في بداية السطر
 * - {@link LEADING_BULLETS_RE} — نمط إزالة النقاط من بداية السطر
 * - {@link cleanInvisibleChars} — حذف الحروف غير المرئية (RTL/LTR marks, BOM)
 * - {@link normalizeLine} — تطبيع سطر: حذف غير مرئي + مسافات + trim
 * - {@link stripLeadingBullets} — إزالة النقاط والشرطات من بداية السطر
 * - {@link startsWithBullet} — هل يبدأ السطر بنقطة/شرطة؟
 * - {@link normalizeCharacterName} — تطبيع اسم شخصية: تطبيع + إزالة النقطتين
 * - {@link hasSentencePunctuation} — هل يحتوي النص على علامة ترقيم جملة؟
 * - {@link isActionWithDash} — هل يبدأ السطر بشرطة وصف؟
 * - {@link isActionCueLine} — هل السطر إشارة إخراجية (مبتسماً، بهدوء...)؟
 * - {@link isImperativeStart} — هل يبدأ بفعل أمر (ادخل، اخرج...)؟
 * - {@link matchesActionStartPattern} — هل يتطابق مع أي نمط بداية وصف؟
 * - {@link isActionVerbStart} — هل يبدأ بفعل وصف مشهد؟
 * - {@link hasActionVerbStructure} — هل يحتوي بنية فعل + ضمير + ربط؟
 * - {@link looksLikeNarrativeActionSyntax} — هل يشبه جملة سردية بروابط سردية؟
 * - {@link hasDirectDialogueMarkers} — هل يحتوي علامات حوار مباشرة؟
 *
 * يُستهلك في معظم ملفات extensions/ كأداة مساعدة أساسية.
 */
import {
  ACTION_CUE_RE,
  ACTION_START_PATTERNS,
  ACTION_VERB_FOLLOWED_BY_NAME_AND_VERB_RE,
  CONVERSATIONAL_MARKERS_RE,
  FULL_ACTION_VERB_SET,
  IMPERATIVE_VERB_SET,
  NEGATION_PLUS_VERB_RE,
  PRONOUN_ACTION_RE,
  THEN_ACTION_RE,
  VERB_WITH_PRONOUN_SUFFIX_RE,
} from "./arabic-patterns";

/** نمط regex لمطابقة الحروف غير المرئية: RTL mark، LTR mark، BOM */
export const INVISIBLE_CHARS_RE = /[\u200f\u200e\ufeff]/g;
/** نمط كشف بداية السطر بنقطة أو شرطة أو رمز نقطي (مع تجاهل المسافات وعلامات الاتجاه) */
export const STARTS_WITH_BULLET_RE =
  /^[\s\u200E\u200F\u061C\uFEFF]*[•·∙⋅●○◦■□▪▫◆◇\-–—−‒―‣⁃*+]/;

/** نمط إزالة النقاط والشرطات والرموز النقطية من بداية السطر */
export const LEADING_BULLETS_RE =
  /^[\s\u200E\u200F\u061C\uFEFF]*[•·∙⋅●○◦■□▪▫◆◇\-–—−‒―‣⁃*+]+\s*/;

/**
 * يحذف الحروف غير المرئية (RTL/LTR marks + BOM) من النص.
 *
 * @param text - النص الخام
 * @returns النص بدون حروف غير مرئية
 */
export function cleanInvisibleChars(text: string): string {
  return (text ?? "").replace(INVISIBLE_CHARS_RE, "");
}

/**
 * يُطبّع سطراً: يحذف الحروف غير المرئية، يستبدل NBSP بمسافة عادية،
 * يدمج المسافات المتعددة، ويقص الأطراف.
 *
 * @param text - النص الخام
 * @returns النص المُطبّع
 */
export function normalizeLine(text: string): string {
  return cleanInvisibleChars(text)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * يزيل النقاط والشرطات والرموز النقطية من بداية السطر.
 *
 * @param text - النص الخام
 * @returns النص بدون نقاط بادئة
 */
export function stripLeadingBullets(text: string): string {
  return (text ?? "").replace(LEADING_BULLETS_RE, "");
}

/**
 * يتحقق إذا كان السطر يبدأ بنقطة أو شرطة أو رمز نقطي.
 *
 * @param text - النص الخام
 * @returns `true` إذا يبدأ بنقطة/شرطة
 */
export function startsWithBullet(text: string): boolean {
  return STARTS_WITH_BULLET_RE.test(text ?? "");
}

/**
 * يُطبّع اسم شخصية: {@link normalizeLine} ثم يزيل النقطتين الختامية.
 *
 * @param text - النص الخام (قد يحتوي `:` في النهاية)
 * @returns الاسم المُطبّع بدون نقطتين
 *
 * @example
 * ```ts
 * normalizeCharacterName('  أحمد:  ') // 'أحمد'
 * ```
 */
export function normalizeCharacterName(text: string): string {
  return normalizeLine(text)
    .replace(/[:：]+\s*$/, "")
    .trim();
}

/**
 * يتحقق إذا كان النص يحتوي على أي علامة ترقيم جملة (نقطة، تعجب، استفهام، فاصلة...).
 *
 * @param text - النص
 * @returns `true` إذا يحتوي علامة ترقيم
 */
export function hasSentencePunctuation(text: string): boolean {
  return /[.!?؟،,؛;]/.test(normalizeLine(text));
}

/**
 * يتحقق إذا كان السطر يبدأ بشرطة وصف (— أو – أو -) متبوعة بنص.
 *
 * @param line - السطر الخام
 * @returns `true` إذا يبدأ بشرطة وصف
 */
export function isActionWithDash(line: string): boolean {
  const normalized = normalizeLine(line);
  if (!normalized) return false;
  return /^[-–—]\s+.+/.test(normalized);
}

/**
 * يتحقق إذا كان النص إشارة إخراجية (مبتسماً، بهدوء، بغضب...).
 * يُستخدم لكشف الإشارات الإخراجية في بداية أسطر الحوار المُضمّن.
 *
 * @param text - النص
 * @returns `true` إذا يتطابق مع {@link ACTION_CUE_RE}
 */
export function isActionCueLine(text: string): boolean {
  const normalized = normalizeLine(text);
  return ACTION_CUE_RE.test(normalized);
}

/**
 * يتحقق إذا كانت أول كلمة فعل أمر (ادخل، اخرج، انظر...).
 *
 * @param text - النص
 * @returns `true` إذا يبدأ بفعل أمر من {@link IMPERATIVE_VERB_SET}
 */
export function isImperativeStart(text: string): boolean {
  const normalized = normalizeLine(text);
  const firstWord = normalized.split(/\s+/)[0] ?? "";
  return IMPERATIVE_VERB_SET.has(firstWord);
}

/**
 * يتحقق إذا كان النص يتطابق مع أي نمط بداية وصف مشهد
 * من {@link ACTION_START_PATTERNS} (ضمير+فعل، نرى/نسمع، أمر، نفي+فعل).
 *
 * @param text - النص
 * @returns `true` إذا يتطابق مع أي نمط
 */
export function matchesActionStartPattern(text: string): boolean {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  return ACTION_START_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * يتحقق إذا كان السطر يبدأ بفعل وصف مشهد — عبر ثلاث طرق:
 * 1. الكلمة الأولى في {@link FULL_ACTION_VERB_SET} (يدخل، يخرج، ينظر...)
 * 2. نمط فعل مضارع عربي `[وف]?[يتنأ]...`
 * 3. نفي + فعل عبر {@link NEGATION_PLUS_VERB_RE}
 *
 * @param text - النص
 * @returns `true` إذا يبدأ بفعل وصف
 */
export function isActionVerbStart(text: string): boolean {
  const normalized = normalizeLine(text);
  if (!normalized) return false;

  const firstWord = normalized.split(/\s+/)[0] ?? "";
  const normalizedFirstWord = firstWord.replace(/[^\u0600-\u06FFA-Za-z]/g, "");

  if (FULL_ACTION_VERB_SET.has(normalizedFirstWord)) return true;
  if (/^(?:[وف]?)[يتنأ][\u0600-\u06FF]{2,}$/.test(normalizedFirstWord))
    return true;
  if (/^(?:[وف]?)ب[تيا][\u0600-\u06FF]{2,}$/.test(normalizedFirstWord))
    return true;
  if (NEGATION_PLUS_VERB_RE.test(normalized)) return true;

  return false;
}

/**
 * يتحقق من وجود بنية فعل وصف معقدة في النص — أربعة أنماط:
 * 1. ضمير + فعل ({@link PRONOUN_ACTION_RE})
 * 2. ثم + فعل ({@link THEN_ACTION_RE})
 * 3. فعل + اسم + و + فعل ({@link ACTION_VERB_FOLLOWED_BY_NAME_AND_VERB_RE})
 * 4. فعل + لاحقة ضمير ({@link VERB_WITH_PRONOUN_SUFFIX_RE})
 *
 * @param text - النص
 * @returns `true` إذا يحتوي بنية فعل وصف
 */
export function hasActionVerbStructure(text: string): boolean {
  const normalized = normalizeLine(text);
  if (!normalized) return false;

  if (PRONOUN_ACTION_RE.test(normalized)) return true;
  if (THEN_ACTION_RE.test(normalized)) return true;
  if (ACTION_VERB_FOLLOWED_BY_NAME_AND_VERB_RE.test(normalized)) return true;
  if (VERB_WITH_PRONOUN_SUFFIX_RE.test(normalized)) return true;

  return false;
}

/**
 * يتحقق إذا كان النص يشبه جملة سردية وصفية — شروط مركبة:
 * 1. لا ينتهي بنقطتين ولا يحتوي علامات استفهام/تعجب
 * 2. ≥ 3 كلمات
 * 3. يبدأ بفعل أو (ثم/و/ف) + فعل
 * 4. يحتوي روابط سردية (و، ثم، بينما، أمام...) أو ≥ 5 كلمات
 *
 * @param text - النص
 * @returns `true` إذا يشبه سرداً وصفياً
 */
export function looksLikeNarrativeActionSyntax(text: string): boolean {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (/[:：]\s*$/.test(normalized)) return false;
  if (/[؟?!]/.test(normalized)) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return false;

  const isVerbLikeToken = (token: string): boolean => {
    const cleaned = token.replace(/[^\u0600-\u06FF]/g, "");
    return /^(?:[وف]?)[يتنأ][\u0600-\u06FF]{2,}$/.test(cleaned);
  };

  const first = tokens[0] ?? "";
  const second = tokens[1] ?? "";
  const startsWithVerbLike =
    isVerbLikeToken(first) ||
    ((first === "ثم" || first === "و" || first === "ف") &&
      isVerbLikeToken(second));

  if (!startsWithVerbLike) return false;

  const hasNarrativeConnectors =
    /\s+(?:و|ثم|بينما|وقد|حتى|بجوار|أمام|خلف|داخل|خارج|الى|إلى|نحو)\b/.test(
      normalized
    );

  return hasNarrativeConnectors || tokens.length >= 5;
}

/**
 * يتحقق إذا كان النص يحتوي علامات حوار مباشرة:
 * 1. علامات عامية ({@link CONVERSATIONAL_MARKERS_RE})
 * 2. علامات ترقيم حوارية (؟، !، …)
 * 3. يبدأ بعلامة اقتباس ("، «، ')
 *
 * @param text - النص
 * @returns `true` إذا يحتوي علامات حوار
 */
export function hasDirectDialogueMarkers(text: string): boolean {
  const normalized = normalizeLine(text);
  if (!normalized) return false;

  if (CONVERSATIONAL_MARKERS_RE.test(normalized)) return true;
  if (/[؟?!…]/.test(normalized)) return true;
  if (/^(?:"|«|').+/.test(normalized)) return true;

  return false;
}
