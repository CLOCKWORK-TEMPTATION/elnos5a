/**
 * @file main.tsx
 * @description نقطة الدخول الرئيسية للتطبيق. يتولى:
 *   1. استيراد ملفات الأنماط (CSS) بترتيب محدد لضمان الأسبقية الصحيحة.
 *   2. تهيئة مزود السمة (ThemeProvider) بالوضع الداكن كافتراضي.
 *   3. إنشاء مكون الإشعارات (Toaster) وإلحاقه بجسم الصفحة.
 *   4. تركيب شجرة React على عنصر `#app` في وضع StrictMode.
 *
 * @sideEffects
 *   - يعدّل `document.documentElement` عبر ThemeProvider (إضافة صنف CSS للسمة).
 *   - يُلحق عنصر DOM للإشعارات بـ `document.body`.
 *   - يُركّب شجرة React على `#app`.
 *
 * @dependencies
 *   - {@link App} — المكون الجذري للتطبيق.
 *   - {@link createThemeProvider} — مزود السمة (class-based، ليس React context).
 *   - {@link createToaster} — مصنع مكون الإشعارات.
 */

/* نقطة الدخول - نظام أنماط موحد */
import "./styles/system.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createToaster } from "./components/ui/toaster";
import { createThemeProvider } from "./providers";

/**
 * تهيئة مزود السمة بالإعدادات الافتراضية.
 * يستخدم صنف CSS على عنصر `<html>` بدلاً من خاصية `data-theme`.
 * مفتاح التخزين المحلي: `filmlane.theme`.
 */
createThemeProvider({
  attribute: "class",
  defaultTheme: "dark",
  enableSystem: false,
  storageKey: "filmlane.theme",
});

/** إنشاء مكون الإشعارات وإلحاقه بجسم الصفحة */
const toaster = createToaster();
document.body.appendChild(toaster.element);

/** تركيب شجرة React على عنصر #app */
const root = document.getElementById("app");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} else {
  console.error("تعذر العثور على عنصر التطبيق #app");
}
