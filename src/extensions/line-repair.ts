/**
 * @module extensions/line-repair
 * @description
 * أدوات إصلاح النصوص الملصوقة — تنظيف HTML وعلامات الترقيم ودمج الأسطر المكسورة.
 *
 * يُصدّر:
 * - {@link extractPlainTextFromHtmlLikeLine} — استخراج نص عادي من سطر يحتوي وسوم HTML
 * - {@link parseBulletLine} — تنظيف سطر من HTML + علامات نقطية + تطبيع
 * - {@link shouldMergeWrappedLines} — يحدد إذا كان سطران حوار متتاليان يجب دمجهما
 * - {@link mergeBrokenCharacterName} — يدمج اسم شخصية مقسوم على سطرين (شائع في Word/PDF)
 *
 * يُستهلك في {@link PasteClassifier} أثناء المعالجة المسبقة للنص الملصوق.
 */
import type { ElementType } from "./classification-types";
import { CHARACTER_RE } from "./arabic-patterns";
import {
  hasActionVerbStructure,
  isActionVerbStart,
  matchesActionStartPattern,
  normalizeLine,
  stripLeadingBullets,
} from "./text-utils";

/** نمط regex لمطابقة وسوم HTML */
const HTML_TAG_RE = /<[^>]+>/g;

/**
 * يستخرج نصاً عادياً من سطر يحتوي وسوم HTML.
 *
 * يستبدل كل وسم بمسافة ثم يطبّع المسافات المتعددة.
 * إذا لم يحتوِ السطر على `<` أو `>` يُعيده كما هو.
 *
 * @param line - السطر الخام (قد يحتوي HTML)
 * @returns النص العادي بدون وسوم
 */
export const extractPlainTextFromHtmlLikeLine = (line: string): string => {
  const raw = (line ?? "").trim();
  if (!raw || !/[<>]/.test(raw)) return raw;

  return raw
    .replace(HTML_TAG_RE, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * ينظّف سطراً من HTML ثم يزيل العلامات النقطية ويطبّعه.
 *
 * سلسلة المعالجة: HTML → نص عادي → إزالة نقاط → تطبيع.
 *
 * @param line - السطر الخام
 * @returns النص المُنظّف والمُطبّع
 */
export const parseBulletLine = (line: string): string => {
  const plain = extractPlainTextFromHtmlLikeLine(line);
  return normalizeLine(stripLeadingBullets(plain));
};

/**
 * أفعال وصفية/حركية تمنع دمج السطر في حوار عند ظهورها بعد "ثم".
 * القائمة قابلة للتوسيع حسب الحاجة.
 */
const ACTION_VERBS_AFTER_THUMMA: readonly string[] = [
  "يخرج",
  "يدخل",
  "ينهض",
  "يلتفت",
  "يرفع",
  "يفتح",
  "يغلق",
  "يمشي",
  "يجلس",
  "يقف",
  "ينظر",
  "يشير",
  "يضع",
  "يسحب",
  "يمسك",
  "يأخذ",
  "يرمي",
  "يركض",
  "يقفز",
  "يسقط",
  "يصعد",
  "ينزل",
  "يتحرك",
  "يتوقف",
  "يبتعد",
  "يقترب",
  "يتراجع",
  "يهرب",
  "يعود",
  "يتقدم",
  "يدور",
  "يستدير",
  "يتجه",
  "تخرج",
  "تدخل",
  "تنهض",
  "تلتفت",
  "ترفع",
  "تفتح",
  "تغلق",
  "تمشي",
  "تجلس",
  "تقف",
  "تنظر",
  "تشير",
  "تضع",
  "تسحب",
];

const THUMMA_ACTION_RE = new RegExp(
  `^ثم\\s+(?:${ACTION_VERBS_AFTER_THUMMA.join("|")})`,
  "u"
);

/**
 * دمج التفاف السطر للحوار فقط عندما يبدو استكمالًا لنفس الجملة.
 */
/**
 * يحدد إذا كان سطرا حوار متتاليان يجب دمجهما كاستمرار لنفس الجملة.
 *
 * شروط الدمج:
 * 1. السطر السابق كان `dialogue`
 * 2. لا يبدأ أي منهما بشرطة أو نقطة
 * 3. السطر الحالي لا ينتهي بنقطتين (ليس اسم شخصية)
 * 4. السطر الحالي يبدأ بعلامة استمرار (`…`، `،`، `و`، `ثم`)
 * 5. السطر السابق لم ينتهِ بعلامة نهاية جملة
 *
 * @param previousLine - السطر السابق
 * @param currentLine - السطر الحالي
 * @param previousType - نوع السطر السابق
 * @returns `true` إذا يجب دمج السطرين
 */
export const shouldMergeWrappedLines = (
  previousLine: string,
  currentLine: string,
  previousType?: ElementType
): boolean => {
  const prev = normalizeLine(previousLine);
  const curr = normalizeLine(currentLine);
  if (!prev || !curr) return false;
  if (previousType !== "dialogue") return false;
  if (/^[-–—•●○]/.test(prev) || /^[-–—•●○]/.test(curr)) return false;
  if (/[:：]\s*$/.test(curr)) return false;

  const prevEndsSentence = /[.!؟?!…»"]\s*$/.test(prev);
  const startsAsContinuation = /^(?:\.{3}|…|،|(?:و|ثم)\s+)/.test(curr);
  if (!startsAsContinuation || prevEndsSentence) return false;

  // منع الدمج إذا كان "ثم" متبوعاً بفعل وصفي/حركي — هذا أكشن وليس استكمال حوار
  if (THUMMA_ACTION_RE.test(curr)) return false;

  return true;
};

/**
 * يحاول دمج اسم شخصية منقسم على سطرين (حالة شائعة في نسخ Word/PDF).
 */
/**
 * يدمج اسم شخصية مقسوم على سطرين — حالة شائعة في نسخ Word/PDF.
 *
 * شروط الدمج:
 * 1. السطر السابق لا ينتهي بعلامة نهاية جملة
 * 2. السطر الحالي ينتهي بنقطتين
 * 3. كل جزء ≤ 25 حرفاً والمجموع ≤ 32
 * 4. الاسم المدمج يتطابق مع {@link CHARACTER_RE}
 * 5. لا يحتوي على علامات ترقيم غير مسموحة
 *
 * @param previousLine - السطر السابق (الجزء الأول من الاسم)
 * @param currentLine - السطر الحالي (الجزء الثاني + النقطتين)
 * @returns الاسم المدمج مع النقطتين، أو `null` إذا فشل الدمج
 *
 * @example
 * ```ts
 * mergeBrokenCharacterName('عبد', 'الرحمن:')  // 'عبد الرحمن:'
 * mergeBrokenCharacterName('جملة طويلة.', 'أحمد:') // null
 * ```
 */
export const mergeBrokenCharacterName = (
  previousLine: string,
  currentLine: string
): string | null => {
  const prevRaw = parseBulletLine(previousLine);
  const currRaw = parseBulletLine(currentLine);

  if (!prevRaw || !currRaw) return null;
  if (/[.!؟"]$/.test(prevRaw)) return null;
  if (!/[:：]\s*$/.test(currRaw)) return null;

  const prevNamePart = prevRaw.replace(/[:：]+\s*$/, "").trim();
  const currNamePart = currRaw.replace(/[:：]+\s*$/, "").trim();
  if (!prevNamePart || !currNamePart) return null;

  // اسم شخصية مقسوم مستحيل يكون أكثر من 3 كلمات في الجزء الأول
  if (prevNamePart.split(/\s+/).filter(Boolean).length > 3) return null;
  if (currNamePart.split(/\s+/).filter(Boolean).length > 3) return null;

  // لو الجزء الأول فيه أفعال أو بنية سردية → ده نص سردي مش اسم
  if (
    isActionVerbStart(prevNamePart) ||
    matchesActionStartPattern(prevNamePart) ||
    hasActionVerbStructure(prevNamePart)
  ) {
    return null;
  }

  if (prevNamePart.length > 25) return null;
  if (prevNamePart.length + currNamePart.length > 32) return null;

  const directMerge = `${prevNamePart}${currNamePart}`;
  const spaceMerge = `${prevNamePart} ${currNamePart}`;

  if (CHARACTER_RE.test(`${directMerge}:`) && !/[.!؟,،"«»]/.test(directMerge)) {
    return `${directMerge}:`;
  }

  if (CHARACTER_RE.test(`${spaceMerge}:`) && !/[.!؟,،"«»]/.test(spaceMerge)) {
    return `${spaceMerge}:`;
  }

  return null;
};
