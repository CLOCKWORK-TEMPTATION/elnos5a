import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/App.tsx",
    "./src/components/**/*.{ts,tsx}",
    "./src/controllers/**/*.{ts,tsx}",
    "./src/hooks/**/*.{ts,tsx}",
    "./src/providers/**/*.{ts,tsx}",
    "./src/utils/**/*.{ts,tsx}",
    "./src/constants/**/*.{ts,tsx}",
    "./src/styles/**/*.css",
    "!./src/ocr-arabic-pdf-to-txt-pipeline/mcp-server/**",
  ],
  theme: {
    extend: {
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      fontFamily: {
        sans: ["var(--font-family-ui)"],
        mono: ["var(--font-family-editor)"],
      },
    },
  },
  plugins: [],
} satisfies Config;
