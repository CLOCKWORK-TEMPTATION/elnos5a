import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * @description تدمج هذه الدالة أصناف CSS (classes) مع دعم دمج أصناف Tailwind بشكل صحيح لتجنب التضارب.
 *
 * @param {ClassValue[]} inputs - مصفوفة من أصناف CSS أو تعبيرات قيم الأصناف.
 *
 * @returns {string} سلسلة نصية تمثل أصناف CSS المدمجة والنهائية.
 *
 * @complexity الزمنية: O(n) | المكانية: O(n) حيث n عدد الأصناف الممررة
 *
 * @sideEffects
 *   - لا يوجد
 *
 * @dependencies
 *   - `clsx`: لدمج الكلاسات المشروطة بسهولة وفي سياقات ديناميكية.
 *   - `twMerge` (من `tailwind-merge`): لحل تعارضات كلاسات Tailwind وضمان تطبيق الكلاس الأخير.
 *
 * @usedBy
 *   - تُستخدم بشكل واسع في غالبية مكونات الواجهة (UI components) لتسهيل تخصيص المظهر.
 *
 * @example الاستخدام الأساسي والمشروط
 * ```typescript
 * const isActive = true;
 * const className = cn('bg-blue-500 p-4', { 'opacity-50': !isActive });
 * ```
 *
 * @example حل تعارضات Tailwind
 * ```typescript
 * // "px-2 p-8" - p-8 يغطي على الكلاسات المتعارضة من p-4
 * const className = cn('p-4 px-2', 'p-8');
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
