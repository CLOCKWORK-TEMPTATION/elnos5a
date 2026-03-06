const MOBILE_BREAKPOINT = 768;

type MobileListener = (isMobile: boolean) => void;

/**
 * @description تفحص ما إذا كانت الشاشة الحالية ضمن نقطة كسر الجوال (أصغر من 768px). تُرجع قيمة ثابتة لحظة الاستدعاء.
 *
 * @returns {boolean} صحيح إذا كانت الشاشة بحجم جوال، عدا ذلك خطأ.
 *
 * @complexity الزمنية: O(1) | المكانية: O(1)
 *
 * @sideEffects
 *   - يقرأ `window.innerWidth`.
 *
 * @example
 * ```typescript
 * const isMobile = useIsMobile();
 * ```
 */
export const useIsMobile = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

/**
 * @description تشترك في استعلام الوسائط (Media Query) لمعرفة التغيرات في حالة الجوال وتنفذ الدالة الممررة عند كل تغيير خط عرض.
 *
 * @param {MobileListener} listener - الدالة المراد تنفيذها عند تغير الحالة.
 *
 * @returns {() => void} دالة لإلغاء الاشتراك (Cleanup/Unsubscribe).
 *
 * @complexity الزمنية: O(1) | المكانية: O(1)
 *
 * @sideEffects
 *   - يُراقب أحداث `change` على `matchMedia`.
 *
 * @example
 * ```typescript
 * const unsubscribe = subscribeIsMobile((isMobile) => console.log(isMobile));
 * // لاحقا
 * unsubscribe();
 * ```
 */
export const subscribeIsMobile = (listener: MobileListener): (() => void) => {
  if (typeof window === "undefined") {
    listener(false);
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(
    `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
  );
  const onChange = (): void => listener(window.innerWidth < MOBILE_BREAKPOINT);

  mediaQuery.addEventListener("change", onChange);
  onChange();

  return () => {
    mediaQuery.removeEventListener("change", onChange);
  };
};
