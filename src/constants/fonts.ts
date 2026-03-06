/**
 * @module constants/fonts
 * @description خيارات الخطوط وأحجام النص المتاحة في المحرر.
 * حالياً مقفلة على خط واحد وحجم واحد (AzarMehrMonospaced-San / 12pt).
 */

/** خيار خط في قائمة الخطوط */
export interface FontOption {
  /** قيمة CSS لـ font-family */
  value: string;
  /** التسمية بالعربية في واجهة المستخدم */
  label: string;
}

/** خيار حجم نص في قائمة الأحجام */
export interface TextSizeOption {
  /** قيمة CSS لـ font-size (مثل '12pt') */
  value: string;
  /** التسمية الرقمية في واجهة المستخدم */
  label: string;
}

/** الخطوط المتاحة — مقفلة حالياً على AzarMehrMonospaced-San */
export const fonts: readonly FontOption[] = [
  { value: "AzarMehrMonospaced-San", label: "أزار مهر أحادي" },
];

/** أحجام النص المتاحة — مقفلة حالياً على 12pt */
export const textSizes: readonly TextSizeOption[] = [
  { value: "12pt", label: "12" },
];
