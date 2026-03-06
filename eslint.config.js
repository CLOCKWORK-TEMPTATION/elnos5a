import js from "@eslint/js";

import globals from "globals";

import tseslint from "typescript-eslint";

import reactHooks from "eslint-plugin-react-hooks";

import reactRefresh from "eslint-plugin-react-refresh";

// تصدير إعدادات ESLint باستخدام التنسيق المسطح (Flat Config) المتوافق مع الإصدارات الحديثة

export default tseslint.config(
  {
    // تجاهل المجلدات والملفات التي لا تتطلب فحص المنطق

    ignores: [
      "dist",

      "build",

      "node_modules",

      "coverage",

      "scripts",

      ".tools",

      ".next",

      "next-env.d.ts",

      "src/ocr-arabic-pdf-to-txt-pipeline/mcp-server",

      "src/ocr-arabic-pdf-to-txt-pipeline/skill-scripts",
    ],
  },

  {
    // تطبيق الإعدادات القياسية لـ JavaScript و TypeScript

    extends: [js.configs.recommended, ...tseslint.configs.recommended],

    // تحديد الملفات المستهدفة بالفحص

    files: ["**/*.{ts,tsx,js,jsx,mjs}"],

    languageOptions: {
      // تحديد إصدار بيئة تشغيل ECMAScript

      ecmaVersion: 2023,

      // تحديد المتغيرات العامة لبيئة المتصفح

      globals: globals.browser,
    },

    plugins: {
      "react-hooks": reactHooks,

      "react-refresh": reactRefresh,
    },

    rules: {
      // تفعيل القواعد القياسية لخطافات React

      ...reactHooks.configs.recommended.rules,

      // تحذير عند تصدير عناصر غير مكونات React لتجنب مشاكل التحديث السريع

      "react-refresh/only-export-components": [
        "warn",

        { allowConstantExport: true },
      ],

      // قواعد هندسية صارمة لضمان جودة الكود

      // تقييد استخدام النوع (any) لتشجيع التحديد الدقيق للأنواع في TypeScript

      "@typescript-eslint/no-explicit-any": "warn",

      // منع ترك متغيرات غير مستخدمة للحفاظ على نظافة الكود، مع السماح بتلك التي تبدأ بشرطة سفلية

      "@typescript-eslint/no-unused-vars": [
        "error",

        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // منع استخدام أوامر الطباعة (console.log) لتشجيع استخدام أدوات التسجيل (Logging) الاحترافية

      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  }
);
