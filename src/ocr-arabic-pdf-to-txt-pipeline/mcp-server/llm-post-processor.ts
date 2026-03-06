/**
 * @description طبقة LLM لتحسين النصوص المستخرجة من OCR عبر Kimi Chat
 */

import { readFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import type { JsonRecord, LLMConfig } from "./types.js";
import { log } from "./ocr-logger.js";
import {
  CRITICAL_OCR_REPLACEMENTS,
  createTimeoutState,
  ensureKimiApiKey,
  ensureTrailingNewline,
  escapeRegExp,
  field,
  fileExists,
  getEnvOrRaise,
  isRetryableHttpStatus,
  isRetryableRequestError,
  normalizeHindiDigitsToWestern,
  normalizeSceneHeadersRobust,
  retryDelayMs,
  str,
} from "./text-helpers.js";
import { APP_NAME } from "./ocr-logger.js";
import { OCRPreprocessor } from "./ocr-preprocessor.js";

const DEFAULT_LLM_MODEL = "kimi-k2.5";

export class LLMPostProcessor {
  private static readonly SYSTEM_PROMPT = `أنت خبير في تصحيح نصوص السيناريو العربية. مهمتك:
1. مقارنة النص المدخل بالمرجع حرفياً
2. إصلاح الأخطاء الهيكلية: ترويسات المشاهد، أسماء المتكلمين، علامات الانتقال
3. إضافة كلمة "قطع" قبل كل مشهد جديد (باستثناء المشهد الأول)
4. الحفاظ على التشكيل والهمزات من المرجع
5. استخدام • لعلامات الكلام وليس -
6. الحفاظ على التنسيق الدقيق: "نهار \\-داخلي" وليس "نهار -داخلي"
7. إرجاع Markdown فقط بدون أي شرح`;

  private static readonly USER_TEMPLATE = `قم بتصحيح النص التالي ليتطابق 100% مع المرجع:

[النص المرجعي - استخدمه كحقيقة مطلقة]
{reference_text}

[النص المدخل - قم بتصحيحه]
{markdown_text}

[ملاحظات ما قبل المعالجة]
{preprocess_notes}

[تعليقات إضافية]
{feedback}

قواعد صارمة:
1. أضف "قطع" في سطر منفصل قبل كل مشهد جديد (بعد المشهد الأول)
2. استخدم • للكلام وليس -
3. الحفاظ على التشكيل والهمزات كما في المرجع
4. "إم إم" وليس "ام ام"
5. تنسيق المشهد: "مشهد1 نهار \\-داخلي"
6. لا تدمج السطور المستقلة
7. صحّح الكلمات الحرجة الشائعة مثل: رينا→ربنا، الضياع→الضباع، ينكي→بنكي
8. أخرج Markdown فقط`;

  private static readonly KIMI_BASE_URL = (
    process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1"
  ).replace(/\/+$/u, "");
  private static readonly KIMI_HTTP_TIMEOUT_MS = Math.max(
    30_000,
    Number.parseInt(process.env.KIMI_HTTP_TIMEOUT_MS ?? "180000", 10) || 180_000
  );
  private static readonly KIMI_HTTP_MAX_RETRIES = Math.max(
    0,
    Math.min(
      Number.parseInt(process.env.KIMI_HTTP_MAX_RETRIES ?? "3", 10) || 3,
      5
    )
  );
  private static readonly DEFAULT_KIMI_MODEL = "kimi-k2.5";

  private readonly config: LLMConfig;
  private referenceCache?: string;
  private readonly preprocessor: OCRPreprocessor;

  constructor(config: LLMConfig) {
    this.config = config;
    this.preprocessor = new OCRPreprocessor();
  }

  async getReferenceText(): Promise<string> {
    if (this.referenceCache !== undefined) {
      return this.referenceCache;
    }

    if (!this.config.referencePath) {
      this.referenceCache = "";
      return this.referenceCache;
    }

    if (!(await fileExists(this.config.referencePath))) {
      throw new Error(`الملف المرجعي غير موجود: ${this.config.referencePath}`);
    }

    this.referenceCache = await readFile(this.config.referencePath, "utf-8");
    return this.referenceCache;
  }

  async postprocess(
    markdownText: string,
    referenceText?: string,
    feedback = ""
  ): Promise<string> {
    const effectiveReference = referenceText ?? (await this.getReferenceText());
    const preprocessed = this.preprocessor.preprocess(markdownText);

    const userPrompt = LLMPostProcessor.USER_TEMPLATE.replace(
      "{reference_text}",
      effectiveReference || "N/A"
    )
      .replace("{markdown_text}", preprocessed.text)
      .replace(
        "{preprocess_notes}",
        preprocessed.detectedIssues.join("\n") || "لا توجد ملاحظات"
      )
      .replace("{feedback}", feedback || "N/A");

    const data = await this.callKimiChat(userPrompt);

    let out = this.extractOutputText(data).trim();
    if (!out) {
      throw new Error("الاستجابة من نموذج LLM كانت فارغة.");
    }

    out = this.stripMarkdownFences(out);
    out = this.finalValidation(out);
    return ensureTrailingNewline(out);
  }

  private finalValidation(output: string): string {
    let validated = output;

    validated = this.ensureCutsBetweenScenes(validated);
    validated = this.applyCriticalReplacements(validated);
    validated = this.normalizeSceneHeadersForValidation(validated);

    if (validated.match(/^-\s+/m) && !validated.match(/^•\s+/m)) {
      validated = validated.replace(/^-\s+/gm, "• ");
    }

    validated = normalizeHindiDigitsToWestern(validated);

    return validated;
  }

  private applyCriticalReplacements(text: string): string {
    let out = text;

    for (const replacement of CRITICAL_OCR_REPLACEMENTS) {
      if (!out.includes(replacement.wrong)) {
        continue;
      }
      out = out.replace(
        new RegExp(escapeRegExp(replacement.wrong), "g"),
        replacement.correct
      );
    }

    out = out.replace(/\bام إم\b/g, "إم إم");
    out = out.replace(/\bامام\b/g, "إم إم");
    return out;
  }

  private ensureCutsBetweenScenes(text: string): string {
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let seenScene = 0;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (/^\s*مشهد[0-9٠-٩]+/u.test(line)) {
        seenScene += 1;
        if (seenScene > 1) {
          const lastNonEmpty = [...out].reverse().find((entry) => entry.trim());
          if (lastNonEmpty?.trim() !== "قطع") {
            out.push("قطع");
          }
        }
      }
      out.push(line);
    }

    return out.join("\n");
  }

  private normalizeSceneHeadersForValidation(text: string): string {
    return normalizeSceneHeadersRobust(text);
  }

  private async callKimiChat(userPrompt: string): Promise<JsonRecord> {
    const apiKey = ensureKimiApiKey(getEnvOrRaise("MOONSHOT_API_KEY"));
    const url = `${LLMPostProcessor.KIMI_BASE_URL}/chat/completions`;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= LLMPostProcessor.KIMI_HTTP_MAX_RETRIES) {
      try {
        const timeoutState = createTimeoutState(
          LLMPostProcessor.KIMI_HTTP_TIMEOUT_MS
        );
        let response: Response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": `${APP_NAME}/1.0`,
            },
            body: JSON.stringify({
              model:
                this.config.model ||
                LLMPostProcessor.DEFAULT_KIMI_MODEL ||
                DEFAULT_LLM_MODEL,
              temperature: 0,
              extra_body: {
                thinking: { type: "disabled" },
              },
              messages: [
                { role: "system", content: LLMPostProcessor.SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
              ],
            }),
            signal: timeoutState.signal,
          });
        } finally {
          timeoutState.cleanup();
        }

        const raw = await response.text();
        let data: unknown = {};
        if (raw.trim()) {
          try {
            data = JSON.parse(raw);
          } catch {
            throw new Error("تعذر تحليل استجابة Kimi Chat كـ JSON.");
          }
        }

        if (!response.ok) {
          const dataObject =
            data && typeof data === "object" ? (data as JsonRecord) : {};
          const requestId = str(
            field(dataObject, "request_id", "") ||
              field(dataObject, "requestId", "") ||
              field(dataObject, "id", "")
          ).trim();

          if (
            isRetryableHttpStatus(response.status) &&
            attempt < LLMPostProcessor.KIMI_HTTP_MAX_RETRIES
          ) {
            attempt += 1;
            const delay = retryDelayMs(attempt);
            log(
              "WARN",
              "Kimi Chat returned %s. retry=%s delayMs=%s",
              response.status,
              attempt,
              delay
            );
            await sleep(delay);
            continue;
          }

          const requestSuffix = requestId ? ` request_id=${requestId}` : "";
          throw new Error(
            `فشل استدعاء Kimi Chat: ${response.status} ${response.statusText}${requestSuffix} - ${raw}`
          );
        }

        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("استجابة Kimi Chat ليست JSON object صالح.");
        }

        return data as JsonRecord;
      } catch (error) {
        lastError = error;
        if (
          isRetryableRequestError(error) &&
          attempt < LLMPostProcessor.KIMI_HTTP_MAX_RETRIES
        ) {
          attempt += 1;
          const delay = retryDelayMs(attempt);
          log(
            "WARN",
            "Kimi Chat request failed. retry=%s delayMs=%s error=%s",
            attempt,
            delay,
            String(error)
          );
          await sleep(delay);
          continue;
        }
        throw error;
      }
    }

    throw new Error(`فشل Kimi Chat بعد retries: ${String(lastError)}`);
  }

  private extractOutputText(data: JsonRecord): string {
    const choices = field<unknown[]>(data, "choices", []);
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0];
      const message = field<unknown>(first, "message", null);
      if (message && typeof message === "object") {
        const content = field<unknown>(message, "content", "");
        const extracted = this.extractContentText(content);
        if (extracted.trim()) {
          return extracted.trim();
        }
      }
    }

    const direct = field<string>(data, "output_text", "");
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }

    return "";
  }

  private extractContentText(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }
    if (!Array.isArray(content)) {
      return "";
    }

    const chunks: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = field<string>(part, "text", "");
      if (typeof text === "string" && text.trim()) {
        chunks.push(text);
      }
    }
    return chunks.join("\n").trim();
  }

  private stripMarkdownFences(text: string): string {
    return text
      .trim()
      .replace(/^```(?:markdown)?\s*/iu, "")
      .replace(/\s*```$/u, "")
      .trim();
  }
}

export class QualityChecker {
  static calculateSimilarity(text1: string, text2: string): number {
    const normalize = (s: string) =>
      s
        .replace(/\s+/g, " ")
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .trim();

    const n1 = normalize(text1);
    const n2 = normalize(text2);
    const distance = this.levenshteinDistance(n1, n2);
    const maxLen = Math.max(n1.length, n2.length);

    return maxLen === 0 ? 100 : Math.round((1 - distance / maxLen) * 100);
  }

  private static levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0)
    );

    for (let i = 0; i <= m; i += 1) dp[i][0] = i;
    for (let j = 0; j <= n; j += 1) dp[0][j] = j;

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + 1
          );
        }
      }
    }

    return dp[m][n];
  }
}
