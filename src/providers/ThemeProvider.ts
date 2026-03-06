export type Theme = "light" | "dark";

export interface ThemeProviderOptions {
  attribute?: "class" | "data-theme";
  defaultTheme?: Theme;
  storageKey?: string;
  enableSystem?: boolean;
}

const resolveSystemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/**
 * @description مزود السمة (Theme Provider) الذي يدير حالة المظهر (فاتح/داكن/نظام) ويطبقه على الواجهة.
 *
 * @complexity الزمنية: O(1) | المكانية: O(1)
 *
 * @sideEffects
 *   - يتفاعل مع `localStorage` لحفظ التفضيلات واستعادتها.
 *   - يعدل `document.documentElement` (`classList` أو `attributes`) لتطبيق السمة.
 *
 * @dependencies
 *   - واجهات المتصفح المدمجة (`window.matchMedia`, `localStorage`, `document.documentElement`).
 *
 * @usedBy
 *   - نقطة الدخول الرئيسية للتطبيق (`main.tsx` أو ما شابه) لتهيئة حالة السمة.
 *
 * @example الاستخدام الأساسي
 * ```typescript
 * const provider = new ThemeProvider({ defaultTheme: 'dark' });
 * provider.init();
 * provider.toggleTheme();
 * ```
 */
export class ThemeProvider {
  private readonly options: Required<ThemeProviderOptions>;
  private currentTheme: Theme;

  constructor(options: ThemeProviderOptions = {}) {
    this.options = {
      attribute: options.attribute ?? "class",
      defaultTheme: options.defaultTheme ?? "dark",
      storageKey: options.storageKey ?? "filmlane.theme",
      enableSystem: options.enableSystem ?? false,
    };

    this.currentTheme = this.options.defaultTheme;
  }

  init(): Theme {
    if (typeof window === "undefined") return this.currentTheme;

    const fromStorage = window.localStorage.getItem(this.options.storageKey);
    const initial =
      fromStorage === "light" || fromStorage === "dark"
        ? (fromStorage as Theme)
        : this.options.enableSystem
          ? resolveSystemTheme()
          : this.options.defaultTheme;

    this.setTheme(initial);
    return initial;
  }

  setTheme(theme: Theme): void {
    this.currentTheme = theme;

    if (typeof document === "undefined") return;

    const root = document.documentElement;
    if (this.options.attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(theme);
    } else {
      root.setAttribute("data-theme", theme);
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(this.options.storageKey, theme);
    }
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  toggleTheme(): Theme {
    const next = this.currentTheme === "dark" ? "light" : "dark";
    this.setTheme(next);
    return next;
  }
}

/**
 * @description دالة مساعدة (Factory Function) لإنشاء وضبط مزود السمة وتفعيله فوراً بخطوة واحدة.
 *
 * @param {ThemeProviderOptions} options - خيارات التهيئة لمزود السمة (اختيارية).
 *
 * @returns {ThemeProvider} كائن مزود السمة المُهيأ.
 *
 * @complexity الزمنية: O(1) | المكانية: O(1)
 *
 * @sideEffects
 *   - ينفذ دالة `init()` مما يسبب تأثيرات جانبية على `localStorage` والـ DOM.
 *
 * @usedBy
 *   - نقطة الدخول لبناء وتغليف حالة السمة بسرعة.
 *
 * @example بناء المزود
 * ```typescript
 * const themeProvider = createThemeProvider({ defaultTheme: 'light' });
 * ```
 */
export const createThemeProvider = (
  options: ThemeProviderOptions = {}
): ThemeProvider => {
  const provider = new ThemeProvider(options);
  provider.init();
  return provider;
};
