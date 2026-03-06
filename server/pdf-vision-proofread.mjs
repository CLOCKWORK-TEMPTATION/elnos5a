/**
 * pdf-vision-proofread.mjs
 * ────────────────────────────────────────────────────────────
 * Post-OCR visual proofreading: sends the OCR-extracted text
 * together with the rendered page image to Gemini 2.5 Flash
 * and asks it to correct any misread characters / words.
 *
 * This is fundamentally different from the old vision-compare
 * pipeline which performed independent OCR on the image and
 * then diffed the two texts (producing thousands of false
 * patches because of layout differences).
 *
 * Here the model receives the *existing* OCR text as context
 * and only needs to spot and fix errors — much more accurate.
 *
 * Uses Gemini REST API directly (not OpenAI-compatible).
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * ────────────────────────────────────────────────────────────
 */

import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

// ── helpers ────────────────────────────────────────────────

const log = (tag, data) => {
  const ts = new Date().toISOString();
  console.warn(
    `[${ts}] [vision-proofread] ${tag}`,
    data != null ? JSON.stringify(data) : ""
  );
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 1_000;
const PROOFREAD_CONCURRENCY = 2; // conservative — each request is heavy

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const isRetryableStatus = (status) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const sanitizeRemoteErrorText = (text) => {
  const raw = String(text ?? "");
  if (!raw) return "";
  const withoutDataUrls = raw.replace(
    /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,
    "data:image/*;base64,[omitted]"
  );
  return withoutDataUrls.length <= 1200
    ? withoutDataUrls
    : `${withoutDataUrls.slice(0, 1200)}…[truncated]`;
};

const extractGeminiText = (payload) => {
  // Gemini response format:
  // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  const candidates = Array.isArray(payload?.candidates)
    ? payload.candidates
    : [];
  if (candidates.length === 0) return "";

  const parts = Array.isArray(candidates[0]?.content?.parts)
    ? candidates[0].content.parts
    : [];

  return parts
    .filter((p) => typeof p?.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
};

// ── prompt ─────────────────────────────────────────────────

const buildProofreadPrompt = (
  ocrText
) => `You are a pixel-perfect Arabic OCR verifier. Your ONLY job is to make the text match EXACTLY what appears in the image — nothing more, nothing less.

Below is text extracted by OCR from the attached page image.
Compare the OCR text against the actual page image CHARACTER BY CHARACTER.

CRITICAL RULES — READ CAREFULLY:

1. Your output must be a FAITHFUL TRANSCRIPT of what is written in the image.
2. Do NOT fix spelling mistakes that exist in the original image. If the image says "جني" do NOT change it to "جنيه". If the image says "ان" do NOT change it to "أن".
3. Do NOT add, remove, or change hamza (أ إ آ ؤ ئ). If the image shows "ا" without hamza, keep it as "ا". If the image shows "أ" with hamza, keep it as "أ". Copy EXACTLY what the image shows.
4. Do NOT normalize or correct Arabic grammar, spelling, or dialect. This is Egyptian colloquial Arabic — words like "ازاي" "ايه" "ابونا" "انا" are intentionally written WITHOUT hamza.
5. If the OCR misread a character (e.g., confused ب with ن, or ر with ز, or missed a dot), fix ONLY that specific misread to match what the image actually shows.
6. If the OCR added a character that does NOT exist in the image, remove it.
7. If the OCR missed a character that DOES exist in the image, add it.
8. Remove any kashida (ـ tatweel) that does not appear in the original image.
9. Preserve EXACT line breaks from the OCR text. Do NOT merge or split lines.
10. Do NOT add markdown fences, commentary, headers, or explanations.
11. Do NOT change the layout, reformat, add bullets, or restructure.
12. Return the FULL text — every line, not just changed parts.
13. Return plain text only.

Examples of what NOT to do:
- "ان" in image → do NOT change to "أن" (hamza addition = WRONG)
- "انتي" in image → do NOT change to "أنتي" (hamza addition = WRONG)
- "جني" in image → do NOT change to "جنيه" (spelling correction = WRONG)
- "ايه" in image → do NOT change to "إيه" (hamza addition = WRONG)
- "الى" in image → do NOT change to "إلى" (hamza addition = WRONG)
- "جتة" in image → do NOT change to "جثة" (dialect word = keep as-is)

Examples of what TO do:
- OCR says "رينا" but image shows "ربنا" → fix to "ربنا" (dot misread)
- OCR says "اختلفشاش" but image shows "اختلفناش" → fix to "اختلفناش" (character misread)
- OCR says "الضياع" but image shows "الضباع" → fix to "الضباع" (character misread)

─── OCR TEXT START ───
${ocrText}
─── OCR TEXT END ───`;

// ── API call ──────────────────────────────────────────────

const requestProofread = async ({
  apiKey,
  model,
  imageBase64,
  imageMimeType,
  ocrText,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_MS,
  _pageLabel = "?",
}) => {
  const endpoint = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;
  const prompt = buildProofreadPrompt(ocrText);

  let attempt = 0;
  let lastError;

  log("api-call-start", {
    page: _pageLabel,
    model,
    ocrTextLen: ocrText.length,
  });
  const t0 = Date.now();

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Gemini generateContent request body
      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: imageMimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16384,
        },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const resText = await res.text();
      let payload = {};
      try {
        payload = resText ? JSON.parse(resText) : {};
      } catch {
        payload = {};
      }

      if (!res.ok) {
        const safe = sanitizeRemoteErrorText(resText);
        const err = new Error(
          `vision-proofread failed: ${res.status} ${res.statusText} ${safe}`
        );
        if (isRetryableStatus(res.status) && attempt < maxRetries) {
          attempt += 1;
          const backoff = retryBaseDelayMs * 2 ** Math.max(0, attempt - 1);
          log("api-retry", {
            page: _pageLabel,
            attempt,
            backoffMs: backoff,
            status: res.status,
          });
          await sleep(backoff);
          continue;
        }
        throw err;
      }

      const text = extractGeminiText(payload);
      if (!text) {
        // Check for safety block or other issues
        const blockReason = payload?.candidates?.[0]?.finishReason;
        const safetyRatings = payload?.candidates?.[0]?.safetyRatings;
        log("api-empty-response", {
          page: _pageLabel,
          blockReason,
          safetyRatings,
        });
        throw new Error(
          `vision-proofread returned empty text for page ${_pageLabel} (finishReason: ${blockReason ?? "unknown"})`
        );
      }

      log("api-call-done", {
        page: _pageLabel,
        ms: Date.now() - t0,
        attempt,
        correctedLen: text.length,
      });
      return text;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      attempt += 1;
      const backoff = retryBaseDelayMs * 2 ** Math.max(0, attempt - 1);
      log("api-retry-on-error", {
        page: _pageLabel,
        attempt,
        backoffMs: backoff,
        error: error?.message,
      });
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }

  log("api-call-failed", {
    page: _pageLabel,
    ms: Date.now() - t0,
    error: lastError?.message ?? String(lastError),
  });
  throw new Error(
    `vision-proofread failed after retries (page ${_pageLabel}): ${
      lastError?.message ?? lastError
    }`
  );
};

// ── per-page processing ───────────────────────────────────

const proofreadPage = async ({
  pageIndex,
  imagePath,
  ocrPageText,
  apiKey,
  model,
  timeoutMs,
}) => {
  const pageNumber = pageIndex + 1;
  log("page-start", { page: pageNumber });
  const t0 = Date.now();

  const imageBuffer = await readFile(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const imageMimeType = "image/png";

  log("page-image-loaded", {
    page: pageNumber,
    sizeKb: Math.round(imageBuffer.length / 1024),
  });

  const correctedText = await requestProofread({
    apiKey,
    model,
    imageBase64,
    imageMimeType,
    ocrText: ocrPageText,
    timeoutMs,
    _pageLabel: pageNumber,
  });

  log("page-done", {
    page: pageNumber,
    originalLen: ocrPageText.length,
    correctedLen: correctedText.length,
    ms: Date.now() - t0,
  });

  return { page: pageNumber, text: correctedText };
};

// ── batch runner (parallel with concurrency cap) ──────────

const runParallelBatches = async (items, concurrency, fn) => {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
};

// ── public API ─────────────────────────────────────────────

/**
 * Run visual proofreading on all pages using Gemini 2.5 Flash.
 *
 * @param {Object} opts
 * @param {string}   opts.apiKey      – Gemini API key
 * @param {string}   opts.model       – Gemini model (e.g. gemini-2.5-flash)
 * @param {string[]} opts.pageImages  – paths to rendered page PNG images
 * @param {Array<{index:number, text:string}>} opts.ocrPages – OCR pages (sorted by index)
 * @param {number}  [opts.timeoutMs]  – per-request timeout
 *
 * @returns {{ pages: Array<{page:number, text:string}>, durationMs: number }}
 */
export const runVisionProofread = async ({
  apiKey,
  model,
  pageImages,
  ocrPages,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  if (!apiKey) {
    throw new Error("vision-proofread requires GEMINI_API_KEY.");
  }
  if (!Array.isArray(pageImages) || pageImages.length === 0) {
    throw new Error("vision proofread requires rendered page images.");
  }
  if (!Array.isArray(ocrPages) || ocrPages.length === 0) {
    throw new Error("vision proofread requires OCR pages.");
  }

  log("run-start", {
    pages: pageImages.length,
    model,
  });
  const t0 = Date.now();

  const items = pageImages.map((imagePath, idx) => ({
    pageIndex: idx,
    imagePath,
    ocrPageText: ocrPages[idx]?.text ?? "",
  }));

  const results = await runParallelBatches(
    items,
    PROOFREAD_CONCURRENCY,
    (item) =>
      proofreadPage({
        pageIndex: item.pageIndex,
        imagePath: item.imagePath,
        ocrPageText: item.ocrPageText,
        apiKey,
        model,
        timeoutMs,
      })
  );

  const durationMs = Date.now() - t0;
  log("run-done", {
    pages: results.length,
    durationMs,
  });

  return { pages: results, durationMs };
};
