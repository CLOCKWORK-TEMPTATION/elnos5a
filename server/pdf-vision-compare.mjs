import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { resolveMistralChatRuntime } from "./provider-api-runtime.mjs";

const log = (tag, data) => {
  const ts = new Date().toISOString();
  console.warn(
    `[${ts}] [vision-compare] ${tag}`,
    data != null ? JSON.stringify(data) : ""
  );
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 500;
const CANONICAL_VISION_COMPARE_MODEL = "mistral-large-latest";
const VISION_COMPARE_REQUEST_SCHEMA = "messages-v1-chat-completions";
const COMPARE_CONCURRENCY = 3;

const toDataUrl = (buffer, mimeType) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`;

const tokenize = (line) => {
  const tokens = String(line ?? "").match(/[\p{L}\p{N}_]+|[^\s]/gu);
  return Array.isArray(tokens) ? tokens : [];
};

const parseLines = (text) =>
  String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim());

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error ?? "unknown error");

const isRetryableStatus = (status) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const sanitizeRemoteErrorText = (text) => {
  const raw = String(text ?? "");
  if (!raw) return "";

  const withoutDataUrls = raw.replace(
    /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,
    "data:image/*;base64,[omitted]"
  );
  if (withoutDataUrls.length <= 1200) {
    return withoutDataUrls;
  }
  return `${withoutDataUrls.slice(0, 1200)}…[truncated]`;
};

const toOptionalTrimmedString = (value, maxLength = 256) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const resolveCompareModel = (rawModel) => {
  const model = toOptionalTrimmedString(rawModel, 128);
  if (!model) {
    return CANONICAL_VISION_COMPARE_MODEL;
  }
  return model;
};

const resolveMistralCompareRuntime = ({ model }) => {
  const chatRuntime = resolveMistralChatRuntime(process.env);
  const resolvedModel = resolveCompareModel(model);

  return {
    model: resolvedModel,
    requestSchema: VISION_COMPARE_REQUEST_SCHEMA,
    api: "chat-completions",
    endpoint: chatRuntime.chatCompletionsEndpoint,
    baseUrl: chatRuntime.baseUrl,
    endpointSource: "hard-locked-canonical",
  };
};

const createTimeoutState = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
};

const extractAssistantMessageText = (payload) => {
  const firstChoice = Array.isArray(payload?.choices)
    ? payload.choices[0]
    : null;
  if (!firstChoice) return "";

  const choiceMessage = firstChoice?.message?.content;
  if (typeof choiceMessage === "string") {
    const text = choiceMessage.trim();
    if (text) return text;
  }
  if (Array.isArray(choiceMessage)) {
    const out = [];
    for (const chunk of choiceMessage) {
      if (!chunk || typeof chunk !== "object") continue;
      if (chunk.type === "text" && typeof chunk.text === "string") {
        out.push(chunk.text);
      }
    }
    const joined = out.join("").trim();
    if (joined) return joined;
  }

  return "";
};

const buildVisionTranscriptionPrompt = () =>
  [
    "Extract the visible text from this page image.",
    "Return plain UTF-8 text only.",
    "Do not summarize.",
    "Preserve line breaks and ordering as seen.",
    "Do not add markdown fences or explanations.",
  ].join("\n");

const requestMistralChatForImage = async ({
  apiKey,
  model,
  imageDataUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_MS,
  _pageLabel = "?",
}) => {
  const runtime = resolveMistralCompareRuntime({ model });
  const endpoint = runtime.endpoint;
  const prompt = buildVisionTranscriptionPrompt();
  let attempt = 0;
  let lastError;

  log("api-call-start", {
    page: _pageLabel,
    model: runtime.model,
    endpoint,
    timeoutMs,
  });
  const t0 = Date.now();

  while (attempt <= maxRetries) {
    const timeoutState = createTimeoutState(timeoutMs);
    try {
      const requestPayload = {
        model: runtime.model,
        messages: [
          {
            role: "system",
            content: "You are a strict visual OCR comparator.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        stream: false,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestPayload),
        signal: timeoutState.signal,
      });

      const responseText = await response.text();
      let payload = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = {};
      }

      if (!response.ok) {
        const safeResponseText = sanitizeRemoteErrorText(responseText);
        const error = new Error(
          `mistral-compare failed [schema=${VISION_COMPARE_REQUEST_SCHEMA}]: ${response.status} ${response.statusText} ${safeResponseText}`
        );
        if (isRetryableStatus(response.status) && attempt < maxRetries) {
          attempt += 1;
          await sleep(retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));
          continue;
        }
        throw error;
      }

      const text = extractAssistantMessageText(payload).trim();
      if (!text) {
        throw new Error(
          "mistral-compare returned empty assistant text for page image."
        );
      }
      log("api-call-done", {
        page: _pageLabel,
        ms: Date.now() - t0,
        attempt,
        textLen: text.length,
      });
      return text;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      attempt += 1;
      await sleep(retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));
    } finally {
      timeoutState.cleanup();
    }
  }

  log("api-call-failed", {
    page: _pageLabel,
    ms: Date.now() - t0,
    error: toErrorMessage(lastError),
  });
  throw new Error(
    `mistral-compare failed after retries: ${toErrorMessage(lastError)}`
  );
};

const buildProposedPatches = ({ page, currentText, referenceText }) => {
  const currentLines = parseLines(currentText);
  const referenceLines = parseLines(referenceText);
  const patches = [];
  let patchSeq = 0;

  const maxLines = Math.max(currentLines.length, referenceLines.length);
  for (let lineIndex = 0; lineIndex < maxLines; lineIndex += 1) {
    const currentLine = currentLines[lineIndex] ?? "";
    const referenceLine = referenceLines[lineIndex] ?? "";
    if (currentLine === referenceLine) {
      continue;
    }

    const currentTokens = tokenize(currentLine);
    const referenceTokens = tokenize(referenceLine);
    const maxTokens = Math.max(currentTokens.length, referenceTokens.length);

    for (let tokenIndex = 0; tokenIndex < maxTokens; tokenIndex += 1) {
      const actual = currentTokens[tokenIndex] ?? "";
      const expected = referenceTokens[tokenIndex] ?? "";
      if (actual === expected) {
        continue;
      }

      const operation =
        expected && actual ? "replace" : expected ? "insert" : "delete";
      patchSeq += 1;
      patches.push({
        id: `p${page}-l${lineIndex + 1}-t${tokenIndex + 1}-${patchSeq}`,
        page,
        line: lineIndex + 1,
        tokenIndex,
        operation,
        actual,
        expected,
        reason: "vision-comparator-diff",
        confidence: operation === "replace" ? 0.82 : 0.75,
      });
    }
  }

  return patches;
};

const processComparePage = async ({
  pageIndex,
  imagePath,
  ocrPage,
  apiKey,
  model,
  timeoutMs,
}) => {
  const pageNumber = pageIndex + 1;
  log("page-start", { page: pageNumber });
  const t0 = Date.now();
  const imageBuffer = await readFile(imagePath);
  const imageDataUrl = toDataUrl(imageBuffer, "image/png");
  log("page-image-loaded", {
    page: pageNumber,
    sizeKb: Math.round(imageBuffer.length / 1024),
  });
  const compareText = await requestMistralChatForImage({
    apiKey,
    model,
    imageDataUrl,
    timeoutMs,
    _pageLabel: pageNumber,
  });

  const sourcePage = ocrPage ?? { text: "" };
  const proposedPatches = buildProposedPatches({
    page: pageNumber,
    currentText: sourcePage.text,
    referenceText: compareText,
  });

  log("page-done", {
    page: pageNumber,
    patches: proposedPatches.length,
    ms: Date.now() - t0,
  });
  return {
    page: pageNumber,
    imagePath,
    currentPageText: sourcePage.text,
    referencePageText: compareText,
    proposedPatches,
  };
};

const runParallelBatches = async (items, concurrency, fn) => {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
};

export const runVisionCompare = async ({
  apiKey,
  model,
  pageImages,
  ocrPages,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  if (!Array.isArray(pageImages) || pageImages.length === 0) {
    throw new Error("vision compare requires rendered page images.");
  }
  if (!Array.isArray(ocrPages) || ocrPages.length === 0) {
    throw new Error("vision compare requires OCR pages.");
  }

  const pageItems = pageImages.map((imagePath, pageIndex) => ({
    pageIndex,
    imagePath,
    ocrPage: ocrPages[pageIndex],
  }));

  const resultPages = await runParallelBatches(
    pageItems,
    COMPARE_CONCURRENCY,
    (item) =>
      processComparePage({
        pageIndex: item.pageIndex,
        imagePath: item.imagePath,
        ocrPage: item.ocrPage,
        apiKey,
        model,
        timeoutMs,
      })
  );

  return {
    pages: resultPages,
    proposedPatchCount: resultPages.reduce(
      (sum, item) => sum + item.proposedPatches.length,
      0
    ),
  };
};

export const runVisionComparePreflight = async ({
  apiKey,
  model,
  imagePath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  if (typeof imagePath !== "string" || !imagePath.trim()) {
    throw new Error(
      "[PDF_OCR_VISION_COMPARE_PREFLIGHT_INVALID_INPUT] Vision compare preflight failed: first-page image path is required."
    );
  }

  try {
    const imageBuffer = await readFile(imagePath);
    const imageDataUrl = toDataUrl(imageBuffer, "image/png");
    await requestMistralChatForImage({
      apiKey,
      model,
      imageDataUrl,
      timeoutMs,
      maxRetries: 0,
    });
  } catch (error) {
    throw new Error(
      `[PDF_OCR_VISION_COMPARE_PREFLIGHT_FAILED] Vision compare preflight failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
};

export const getVisionCompareRuntime = ({ model }) =>
  resolveMistralCompareRuntime({ model });
