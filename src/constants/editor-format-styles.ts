/**
 * @module constants/editor-format-styles
 * @description أنماط CSS لعناصر السيناريو العشرة داخل محرر Tiptap.
 *
 * يُصدّر:
 * - {@link EDITOR_STYLE_FORMAT_IDS} — المعرّفات العشرة لأنواع العناصر
 * - {@link EditorStyleFormatId} — نوع TypeScript مشتق من المصفوفة
 * - ثوابت الخط المقفل: {@link LOCKED_EDITOR_FONT_FAMILY}, {@link LOCKED_EDITOR_FONT_SIZE}, {@link LOCKED_EDITOR_LINE_HEIGHT}
 * - {@link getFormatStyles} — مولّد أنماط CSS لكل نوع عنصر
 * - {@link getSpacingMarginTop} — حاسب التباعد العمودي بين عنصرين متتاليين
 * - {@link applyEditorFormatStyleVariables} — يكتب متغيرات CSS المخصصة على عنصر DOM
 */
import type { CSSProperties } from "react";

/**
 * المعرّفات العشرة لأنواع عناصر السيناريو المدعومة في المحرر.
 * تُستخدم كمفاتيح في أنماط CSS وفي خريطة التنسيقات.
 */
export const EDITOR_STYLE_FORMAT_IDS = [
  "basmala",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "scene_header_top_line",
] as const;

/** نوع TypeScript مشتق من {@link EDITOR_STYLE_FORMAT_IDS}، يمثل أي معرّف تنسيق صالح */
export type EditorStyleFormatId = (typeof EDITOR_STYLE_FORMAT_IDS)[number];

/** عائلة الخط المقفلة للمحرر (AzarMehrMonospaced-San مع احتياطي monospace) */
export const LOCKED_EDITOR_FONT_FAMILY = "'AzarMehrMonospaced-San', monospace";
/** حجم الخط المقفل للمحرر: 12 نقطة */
export const LOCKED_EDITOR_FONT_SIZE = "12pt";
/** ارتفاع السطر المقفل للمحرر: 15 نقطة */
export const LOCKED_EDITOR_LINE_HEIGHT = "15pt";

/**
 * يُرجع كائن {@link CSSProperties} يحتوي الأنماط المناسبة لنوع عنصر سيناريو معيّن.
 *
 * يدمج أنماطاً أساسية مشتركة (خط، اتجاه RTL، ارتفاع سطر) مع أنماط خاصة بكل نوع:
 * - `basmala`: محاذاة يسار، وزن عادي
 * - `scene_header_top_line`: عرض flex مع توزيع المسافات
 * - `dialogue`: عرض 4.1 بوصة، وسط، حشوات مخصصة
 * - `action`: محاذاة مبررة (justify) مع آخر سطر لليمين
 *
 * @param formatType - معرّف نوع العنصر (مثل `'action'`، `'dialogue'`)
 * @param selectedSize - حجم الخط (مقفل حالياً على `'12pt'`)
 * @param selectedFont - عائلة الخط (مقفلة حالياً على `'AzarMehrMonospaced-San'`)
 * @returns كائن أنماط CSS جاهز للتطبيق على عنصر DOM أو مكوّن React
 */
export const getFormatStyles = (
  formatType: EditorStyleFormatId | string,
  selectedSize: string = LOCKED_EDITOR_FONT_SIZE,
  selectedFont: string = "AzarMehrMonospaced-San"
): CSSProperties => {
  const normalizedSize =
    selectedSize === LOCKED_EDITOR_FONT_SIZE
      ? selectedSize
      : LOCKED_EDITOR_FONT_SIZE;
  const normalizedLineHeight = LOCKED_EDITOR_LINE_HEIGHT;

  const baseStyles: CSSProperties = {
    fontFamily: selectedFont,
    fontSize: normalizedSize,
    direction: "rtl",
    lineHeight: normalizedLineHeight,
    minHeight: normalizedLineHeight,
    fontWeight: "bold",
  };

  const formatStyles: Record<string, CSSProperties> = {
    basmala: {
      textAlign: "left",
      direction: "rtl",
      width: "100%",
      fontWeight: "normal",
      margin: "0 0 0 0",
    },
    scene_header_top_line: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      width: "100%",
      fontWeight: "bold",
    },
    scene_header_1: {
      fontWeight: "bold",
      textTransform: "uppercase",
    },
    scene_header_2: {
      fontWeight: "bold",
    },
    scene_header_3: {
      textAlign: "center",
      fontWeight: "bold",
    },
    action: {
      textAlign: "justify",
      textAlignLast: "right",
      textJustify: "inter-word",
      width: "100%",
      margin: "0",
    },
    character: {
      textAlign: "center",
      margin: "0 auto",
    },
    parenthetical: {
      textAlign: "center",
      margin: "0 auto",
    },
    dialogue: {
      width: "4.1in",
      textAlign: "center",
      margin: "0 auto",
      fontWeight: "normal",
      paddingLeft: "1.5em",
      paddingRight: "1em",
      paddingTop: "0.25em",
      paddingBottom: "0",
    },
    transition: {
      textAlign: "center",
      margin: "0 auto",
    },
  };

  return { ...baseStyles, ...formatStyles[formatType] };
};

/**
 * =========================
 *  Spacing Rules (قواعد التباعد بين العناصر)
 * =========================
 *
 * القواعد:
 * - basmala → أي عنصر: لا سطر فارغ
 * - scene_header_2 → scene_header_3: سطر فارغ
 * - scene_header_3 → action: سطر فارغ
 * - action → action/character/transition: سطر فارغ
 * - character → dialogue/parenthetical: لا سطر فارغ (ممنوع!)
 * - dialogue → character/action/transition: سطر فارغ
 * - parenthetical → يتبع نفس قواعد dialogue
 * - transition → scene_header_1/scene_header_top_line: سطر فارغ
 */
/**
 * يحسب الهامش العلوي (margin-top) بين عنصرين متتاليين وفق قواعد التباعد المعيارية.
 *
 * @param previousFormat - معرّف نوع العنصر السابق
 * @param currentFormat - معرّف نوع العنصر الحالي
 * @returns قيمة CSS للهامش: `'12pt'` لسطر فارغ، `'0'` لعدم تباعد، `''` للافتراضي
 */
export const getSpacingMarginTop = (
  previousFormat: string,
  currentFormat: string
): string => {
  if (
    previousFormat === "basmala" &&
    currentFormat === "scene_header_top_line"
  ) {
    return "12pt";
  }

  if (previousFormat === "basmala") {
    return "0";
  }

  if (previousFormat === "character") {
    if (currentFormat === "dialogue" || currentFormat === "parenthetical") {
      return "0";
    }
  }

  if (previousFormat === "parenthetical" && currentFormat === "dialogue") {
    return "0";
  }

  if (
    previousFormat === "scene_header_2" &&
    currentFormat === "scene_header_3"
  ) {
    return "0";
  }

  if (previousFormat === "scene_header_3" && currentFormat === "action") {
    return "12pt";
  }

  if (previousFormat === "action") {
    if (
      currentFormat === "action" ||
      currentFormat === "character" ||
      currentFormat === "transition"
    ) {
      return "12pt";
    }
  }

  if (previousFormat === "dialogue") {
    if (
      currentFormat === "character" ||
      currentFormat === "action" ||
      currentFormat === "transition"
    ) {
      return "12pt";
    }
  }

  if (previousFormat === "parenthetical") {
    if (
      currentFormat === "character" ||
      currentFormat === "action" ||
      currentFormat === "transition"
    ) {
      return "0";
    }
  }

  if (previousFormat === "transition") {
    if (
      currentFormat === "scene_header_1" ||
      currentFormat === "scene_header_top_line"
    ) {
      return "12pt";
    }
  }

  return "";
};

/**
 * @internal يحوّل قيمة CSS إلى سلسلة نصية مع قيمة احتياطية.
 * @param value - القيمة المُستخرجة من كائن CSSProperties
 * @param fallback - القيمة الاحتياطية عند `undefined` أو `null` (افتراضي: `'0'`)
 */
const cssValue = (
  value: CSSProperties[keyof CSSProperties] | undefined,
  fallback = "0"
): string => {
  if (value === undefined || value === null) return fallback;
  return typeof value === "number" ? `${value}` : String(value);
};

/**
 * يكتب متغيرات CSS المخصصة (`--fmt-*` و `--editor-*`) على كائن {@link CSSStyleDeclaration}.
 *
 * يُستدعى عادةً على `document.documentElement.style` لجعل الأنماط متاحة
 * لكل عناصر المحرر عبر `var(--fmt-dialogue-width)` وما شابه.
 *
 * المتغيرات المكتوبة تشمل: الخط، الحجم، ارتفاع السطر، والهوامش/الحشوات لكل نوع عنصر.
 *
 * @param style - كائن CSSStyleDeclaration المُستهدَف (عادةً `document.documentElement.style`)
 */
export const applyEditorFormatStyleVariables = (
  style: CSSStyleDeclaration
): void => {
  const stylesByFormat: Record<EditorStyleFormatId, CSSProperties> = {
    basmala: getFormatStyles("basmala"),
    scene_header_1: getFormatStyles("scene_header_1"),
    scene_header_2: getFormatStyles("scene_header_2"),
    scene_header_3: getFormatStyles("scene_header_3"),
    action: getFormatStyles("action"),
    character: getFormatStyles("character"),
    dialogue: getFormatStyles("dialogue"),
    parenthetical: getFormatStyles("parenthetical"),
    transition: getFormatStyles("transition"),
    scene_header_top_line: getFormatStyles("scene_header_top_line"),
  };

  style.setProperty("--editor-font-family", LOCKED_EDITOR_FONT_FAMILY);
  style.setProperty("--editor-font-size", LOCKED_EDITOR_FONT_SIZE);
  style.setProperty("--editor-line-height", LOCKED_EDITOR_LINE_HEIGHT);

  style.setProperty(
    "--fmt-basmala-margin",
    cssValue(stylesByFormat.basmala.margin, "0")
  );
  style.setProperty(
    "--fmt-basmala-padding",
    cssValue(stylesByFormat.basmala.padding, "0")
  );

  style.setProperty(
    "--fmt-scene_header_top_line-margin-top",
    cssValue(stylesByFormat["scene_header_top_line"].marginTop, "0")
  );
  style.setProperty(
    "--fmt-scene_header_top_line-padding",
    cssValue(stylesByFormat["scene_header_top_line"].padding, "0")
  );

  style.setProperty(
    "--fmt-scene_header_3-padding",
    cssValue(stylesByFormat["scene_header_3"].padding, "0")
  );
  style.setProperty(
    "--fmt-scene_header_3-margin-bottom",
    cssValue(stylesByFormat["scene_header_3"].marginBottom, "0")
  );

  style.setProperty(
    "--fmt-action-margin",
    cssValue(stylesByFormat.action.margin, "0")
  );
  style.setProperty(
    "--fmt-action-padding",
    cssValue(stylesByFormat.action.padding, "0")
  );

  style.setProperty(
    "--fmt-character-margin",
    cssValue(stylesByFormat.character.margin, "0 auto")
  );
  style.setProperty(
    "--fmt-character-padding",
    cssValue(stylesByFormat.character.padding, "0")
  );

  style.setProperty(
    "--fmt-parenthetical-margin",
    cssValue(stylesByFormat.parenthetical.margin, "0 auto")
  );
  style.setProperty(
    "--fmt-parenthetical-padding",
    cssValue(stylesByFormat.parenthetical.padding, "0")
  );

  style.setProperty(
    "--fmt-dialogue-width",
    cssValue(stylesByFormat.dialogue.width, "4.1in")
  );
  style.setProperty(
    "--fmt-dialogue-margin",
    cssValue(stylesByFormat.dialogue.margin, "0 auto")
  );
  style.setProperty(
    "--fmt-dialogue-padding-left",
    cssValue(stylesByFormat.dialogue.paddingLeft, "1.5em")
  );
  style.setProperty(
    "--fmt-dialogue-padding-right",
    cssValue(stylesByFormat.dialogue.paddingRight, "1em")
  );
  style.setProperty(
    "--fmt-dialogue-padding-top",
    cssValue(stylesByFormat.dialogue.paddingTop, "0.25em")
  );
  style.setProperty(
    "--fmt-dialogue-padding-bottom",
    cssValue(stylesByFormat.dialogue.paddingBottom, "0")
  );

  style.setProperty(
    "--fmt-transition-margin",
    cssValue(stylesByFormat.transition.margin, "0 auto")
  );
  style.setProperty(
    "--fmt-transition-padding",
    cssValue(stylesByFormat.transition.padding, "0")
  );
};
