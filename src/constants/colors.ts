/**
 * @module constants/colors
 * @description لوحة ألوان محرر السيناريو — إصدار Jungle Green.
 *
 * تُصدّر أربع مجموعات:
 * - {@link colors} — 19 لوناً أساسياً لمنتقي الألوان
 * - {@link brandColors} — ألوان العلامة التجارية (jungleGreen, teal, bronze, dark)
 * - {@link semanticColors} — ألوان دلالية (primary, error, warning, إلخ)
 * - {@link highlightColors} — 8 ألوان للتمييز النصي
 * - {@link gradients} — 8 تدرجات خطية جاهزة
 */

/** مصفوفة الألوان الأساسية (19 لوناً) لمنتقي الألوان في واجهة المحرر */
export const colors = [
  "#070100",
  "#029784",
  "#40A5B3",
  "#746842",
  "#e03131",
  "#c2255c",
  "#9c36b5",
  "#6741d9",
  "#3b5bdb",
  "#1b6ec2",
  "#0c8599",
  "#099268",
  "#2f9e44",
  "#66a80f",
  "#f08c00",
  "#e8590c",
  "#868e96",
  "#343a40",
  "#000000",
] as const;

/** ألوان العلامة التجارية لـ Filmlane */
export const brandColors = {
  jungleGreen: "#029784",
  teal: "#40A5B3",
  bronze: "#746842",
  dark: "#070100",
} as const;

/** ألوان دلالية مُعيَّنة حسب الغرض (نجاح، خطأ، تحذير، إلخ) */
export const semanticColors = {
  primary: "#029784",
  secondary: "#40A5B3",
  accent: "#746842",
  success: "#099268",
  warning: "#f08c00",
  error: "#e03131",
  info: "#1b6ec2",
  creative: "#c2255c",
  technical: "#3b5bdb",
} as const;

/** 8 ألوان للتمييز النصي (highlight) في المحرر */
export const highlightColors = [
  "#029784",
  "#40A5B3",
  "#099268",
  "#1b6ec2",
  "#f08c00",
  "#e03131",
  "#c2255c",
  "#9c36b5",
] as const;

/** تدرجات خطية (linear-gradient) جاهزة للاستخدام في خلفيات واجهة المستخدم */
export const gradients = {
  jungle: "linear-gradient(135deg, #029784, #40A5B3)",
  jungleFull: "linear-gradient(135deg, #029784, #40A5B3, #746842)",
  bronze: "linear-gradient(135deg, #746842, #40A5B3)",
  creative: "linear-gradient(135deg, #c2255c, #40A5B3)",
  success: "linear-gradient(135deg, #099268, #029784)",
  sunset: "linear-gradient(135deg, #f08c00, #e8590c)",
  ocean: "linear-gradient(135deg, #1b6ec2, #0c8599)",
  forest: "linear-gradient(135deg, #2f9e44, #099268)",
} as const;
