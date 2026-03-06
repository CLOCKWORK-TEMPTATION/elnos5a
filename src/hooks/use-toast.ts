import type { ToastActionElement, ToastProps } from "../components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

/**
 * @description واجهة بيانات الإشعار الممتدة التي تحتوي على الخصائص الإضافية.
 */
export interface ToasterToast extends ToastProps {
  id: string;
  title?: string;
  description?: string;
  action?: ToastActionElement;
}

interface State {
  toasts: ToasterToast[];
}

type Listener = (state: State) => void;

const listeners: Listener[] = [];
let state: State = { toasts: [] };
let counter = 0;

const notify = (): void => {
  for (const listener of listeners) {
    listener(state);
  }
};

const genId = (): string => {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return counter.toString();
};

const removeToast = (toastId: string): void => {
  state = {
    ...state,
    toasts: state.toasts.filter((toastItem) => toastItem.id !== toastId),
  };
  notify();
};

/**
 * @description إخفاء إشعار معين أو جميع الإشعارات. يبدأ عملية تنظيف وإزالة من الحالة.
 *
 * @param {string} [toastId] - معرف الإشعار. إذا لم يُمرر، سيتم إخفاء جميع الإشعارات.
 */
export const dismissToast = (toastId?: string): void => {
  if (!toastId) {
    const ids = state.toasts.map((item) => item.id);
    for (const id of ids) {
      window.setTimeout(() => removeToast(id), 0);
    }
    return;
  }

  window.setTimeout(() => removeToast(toastId), 0);
};

/**
 * @description دالة رئيسية لإنشاء وإظهار إشعار جديد. يعيش لفترة محددة ثم يختفي تلقائياً. المجموع الكلي محكوم بحد أقصى.
 *
 * @param {Omit<ToasterToast, 'id'>} props - خصائص الإشعار (العنوان، الوصف، الحركة...).
 *
 * @returns { id: string; dismiss: () => void } كائن يحتوي على معرف الإشعار ودالة لإخفائه فوراً.
 *
 * @complexity الزمنية: O(1) | المكانية: O(k) حيث k عدد الإشعارات العظمى (TOAST_LIMIT).
 *
 * @sideEffects
 *   - يعدل حالة الإشعارات المركزية ويُبلغ المشتركين المربوطين في الواجهة.
 *   - يستخدم `setTimeout` لتنظيف ذاتي.
 *
 * @usedBy
 *   - تُستخدم من قِبَل أي ملف بالمشروع (سواء مكون أو خدمة) لعرض رسائل للمستخدم.
 *
 * @example
 * ```typescript
 * toast({ title: "تم الحفظ", description: "تم حفظ الملف بنجاح" });
 * ```
 */
export const toast = (
  props: Omit<ToasterToast, "id">
): { id: string; dismiss: () => void } => {
  const id = genId();
  const next: ToasterToast = {
    ...props,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        dismissToast(id);
      }
    },
  };

  state = {
    ...state,
    toasts: [next, ...state.toasts].slice(0, TOAST_LIMIT),
  };
  notify();

  window.setTimeout(() => {
    removeToast(id);
  }, props.duration ?? TOAST_REMOVE_DELAY);

  return {
    id,
    dismiss: () => dismissToast(id),
  };
};

/**
 * @description تشترك في التغيرات على حالة الإشعارات (لغرض إعادة التصيير في طبقة العرض).
 *
 * @param {Listener} listener - الدالة المنفذة عند كل تغيير في الإشعارات.
 *
 * @returns {() => void} دالة إلغاء الاشتراك من الإشعارات.
 */
export const subscribeToastState = (listener: Listener): (() => void) => {
  listeners.push(listener);
  listener(state);

  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
};

/**
 * @description كائن الوصول المركز لمنظومة الإشعارات، لتسهيل التصدير والاستخدام.
 *
 * @returns {Object} دوال التحكم وقراءة الإشعارات.
 */
export const useToast = () => ({
  getState: (): State => state,
  subscribe: subscribeToastState,
  toast,
  dismiss: dismissToast,
});
