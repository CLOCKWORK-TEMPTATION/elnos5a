/**
 * @file env.d.ts
 * @description ملف إعلان أنماط بيئة Next.js. يوفّر تعريفات TypeScript
 *   لمتغيرات البيئة `NEXT_PUBLIC_*` المستخدمة في التطبيق.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL?: string;
    readonly NEXT_PUBLIC_AGENT_REVIEW_BACKEND_URL?: string;
    readonly NEXT_PUBLIC_AGENT_REVIEW_FAIL_OPEN?: string;
    readonly NEXT_PUBLIC_AI_CONTEXT_ENDPOINT?: string;
    readonly NEXT_PUBLIC_AI_CONTEXT_ENABLED?: string;
    readonly NEXT_PUBLIC_OCR_PROVIDER?: string;
    readonly NODE_ENV: "development" | "production" | "test";
  }
}
