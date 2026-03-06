const loadJson = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const saveJson = <T>(key: string, value: T): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const timeoutMap = new Map<string, number>();

/**
 * @description تقوم بحفظ القيمة في `localStorage` تلقائياً بعد مرور فترة زمنية باستخدام مؤقت (Debounce).
 * تفيد في حالات الحفظ التلقائي للبيانات أثناء الكتابة.
 *
 * @param {string} key - مفتاح التخزين.
 * @param {T} value - القيمة المراد تخزينها.
 * @param {number} delay - فترة التأخير بالمللي ثانية (الافتراضي 3000).
 *
 * @complexity الزمنية: O(1) | المكانية: O(1)
 *
 * @sideEffects
 *   - تنشئ وتزيل مؤقتات (setTimeout/clearTimeout).
 *   - تكتب في المتصفح `localStorage`.
 *
 * @example
 * ```typescript
 * useAutoSave('doc-draft', currentData);
 * ```
 */
export const useAutoSave = <T>(key: string, value: T, delay = 3000): void => {
  if (typeof window === "undefined") return;

  const pending = timeoutMap.get(key);
  if (pending !== undefined) {
    window.clearTimeout(pending);
  }

  const timeoutId = window.setTimeout(() => {
    saveJson(key, value);
    timeoutMap.delete(key);
  }, delay);

  timeoutMap.set(key, timeoutId);
};

/**
 * @description دالة سريعة لاسترجاع قيمة مخزنة بصيغة JSON. تُرجع القيمة الافتراضية في حال الفشل أو عدم الوجود.
 *
 * @param {string} key - مفتاح التخزين.
 * @param {T} defaultValue - القيمة الافتراضية.
 *
 * @returns {T} القيمة المُسترجعة أو القيمة الافتراضية.
 */
export const loadFromStorage = <T>(key: string, defaultValue: T): T =>
  loadJson<T>(key, defaultValue);

/**
 * @description دالة مباشرة لحفظ القيمة في `localStorage` بصيغة JSON دون تأخير.
 *
 * @param {string} key - مفتاح التخزين.
 * @param {T} value - القيمة المراد حفظها.
 */
export const saveToStorage = <T>(key: string, value: T): void =>
  saveJson(key, value);
