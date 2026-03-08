import { createReviewModel } from "./langchain-model-factory.mjs";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 3_000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toMessage = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value.message === "string" && value.message.trim()) {
    return value.message.trim();
  }
  if (typeof value.error === "string" && value.error.trim()) {
    return value.error.trim();
  }
  return "";
};

const getProviderStatusCode = (error) => {
  if (!error || typeof error !== "object") return null;
  if (typeof error.status === "number") return error.status;
  if (typeof error.statusCode === "number") return error.statusCode;
  if (typeof error.code === "number") return error.code;
  if (typeof error.response?.status === "number") return error.response.status;
  if (typeof error.cause?.status === "number") return error.cause.status;
  return null;
};

const getProviderRequestId = (error) => {
  if (!error || typeof error !== "object") return null;

  const candidates = [
    error.request_id,
    error.requestId,
    error.requestID,
    error.response?.headers?.["request-id"],
    error.response?.headers?.["x-request-id"],
    error.cause?.request_id,
    error.cause?.requestId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
};

/**
 * @param {unknown} error
 * @returns {{ status: number | null, requestId: string | null, message: string, temporary: boolean }}
 */
export const resolveProviderErrorInfo = (error) => {
  const status = getProviderStatusCode(error);
  const message =
    toMessage(error) ||
    toMessage(error?.error) ||
    toMessage(error?.response?.data) ||
    toMessage(error?.cause) ||
    "Provider request failed.";

  return {
    status,
    requestId: getProviderRequestId(error),
    message,
    temporary: isTemporaryProviderError(error),
  };
};

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export const isTemporaryProviderError = (error) => {
  const status = getProviderStatusCode(error);

  const message = [
    toMessage(error),
    toMessage(error?.error),
    toMessage(error?.response?.data),
    toMessage(error?.cause),
    typeof error?.code === "string" ? error.code : "",
  ]
    .join(" ")
    .toLowerCase();

  // ── Permanent errors: token-limit / context-length (FR-006-C) ──
  // These MUST NOT trigger fallback regardless of HTTP status.
  if (
    message.includes("too many tokens") ||
    message.includes("context_length_exceeded") ||
    message.includes("max_tokens") ||
    (message.includes("invalid_argument") && message.includes("token"))
  ) {
    return false;
  }

  // ── Permanent errors: Gemini INVALID_ARGUMENT for payload size (FR-006-B) ──
  if (message.includes("invalid_argument") && !message.includes("resource_exhausted")) {
    return false;
  }

  // ── Temporary: HTTP status codes (FR-006-A) ──
  if (status === 408 || status === 409 || status === 425) return true;
  if (status === 429 || status === 503 || status === 529) return true;
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return true;
  }

  // ── Temporary: Gemini RESOURCE_EXHAUSTED quota (FR-006-B) ──
  if (message.includes("resource_exhausted")) return true;

  // ── Temporary: message-based detection (FR-006-A) ──
  return (
    message.includes("overload") ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporar") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up")
  );
};

const extractUsageValue = (usageMetadata, keys) => {
  if (!usageMetadata || typeof usageMetadata !== "object") return null;

  for (const key of keys) {
    const value = usageMetadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
};

/**
 * @param {string | Array<string | { text?: string, content?: unknown[] } | unknown>} content
 * @returns {string}
 */
export const extractTextFromMessageContent = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      if (typeof block.text === "string") return block.text;
      if (Array.isArray(block.content)) {
        return extractTextFromMessageContent(block.content);
      }
      return "";
    })
    .join("");
};

const extractStopReason = (response) => {
  const metadata = response?.response_metadata;
  if (!metadata || typeof metadata !== "object") return null;

  const keys = ["stop_reason", "finish_reason", "stopReason", "finishReason"];
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const extractResolvedModel = (response, target) => {
  const metadata = response?.response_metadata;
  if (metadata && typeof metadata === "object") {
    const candidates = [
      metadata.model_name,
      metadata.modelName,
      metadata.model,
      metadata.model_id,
      metadata.modelId,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return target.model;
};

/**
 * @param {string} message
 * @param {{ status?: number | null, requestId?: string | null, provider?: string | null, model?: string | null, specifier?: string | null, temporary?: boolean, retryCount?: number }} [details]
 */
export class ReviewProviderInvocationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ReviewProviderInvocationError";
    Object.assign(this, details);
  }
}

/**
 * @param {{ channel: string, primaryTarget: object, fallbackTarget?: object | null, messages: import("@langchain/core/messages").BaseMessage[], temperature?: number, maxTokens?: number, timeoutMs?: number, logger?: { warn?: Function } | null, maxRetries?: number, baseDelayMs?: number, backoffMultiplier?: number, createModel?: Function }} options
 * @returns {Promise<{ channel: string, provider: string, requestedSpecifier: string, model: string, text: string, stopReason: string | null, retryCount: number, usedFallback: boolean, responseMetadata: object | null, usageMetadata: object | null, inputTokens: number | null, outputTokens: number | null }>}
 */
export const invokeWithFallback = async ({
  channel,
  primaryTarget,
  fallbackTarget = null,
  messages,
  temperature = 0,
  maxTokens,
  timeoutMs,
  logger = null,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
  createModel = createReviewModel,
}) => {
  const targets = [primaryTarget];
  if (fallbackTarget?.usable) {
    targets.push(fallbackTarget);
  }

  let retryCount = 0;
  let lastErrorInfo = null;

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const usedFallback = index > 0;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const model = createModel(target, {
          temperature,
          maxTokens,
          timeoutMs,
        });
        const response = await model.invoke(messages);
        const usageMetadata = response?.usage_metadata ?? null;

        return {
          channel,
          provider: target.provider,
          requestedSpecifier: target.specifier,
          model: extractResolvedModel(response, target),
          text: extractTextFromMessageContent(response?.content),
          stopReason: extractStopReason(response),
          retryCount,
          usedFallback,
          responseMetadata: response?.response_metadata ?? null,
          usageMetadata,
          inputTokens: extractUsageValue(usageMetadata, [
            "input_tokens",
            "inputTokens",
          ]),
          outputTokens: extractUsageValue(usageMetadata, [
            "output_tokens",
            "outputTokens",
          ]),
        };
      } catch (error) {
        const errorInfo = resolveProviderErrorInfo(error);
        lastErrorInfo = {
          ...errorInfo,
          provider: target.provider,
          model: target.model,
          specifier: target.specifier,
        };

        logger?.warn?.(
          {
            channel,
            provider: target.provider,
            model: target.model,
            attempt,
            maxRetries,
            usedFallback,
            status: errorInfo.status,
            temporary: errorInfo.temporary,
          },
          "review provider invocation failed"
        );

        if (errorInfo.temporary && attempt < maxRetries) {
          retryCount += 1;
          const delay =
            baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
          await sleep(delay);
          continue;
        }

        if (errorInfo.temporary && !usedFallback && fallbackTarget?.usable) {
          break;
        }

        throw new ReviewProviderInvocationError(errorInfo.message, {
          status: errorInfo.status,
          requestId: errorInfo.requestId,
          provider: target.provider,
          model: target.model,
          specifier: target.specifier,
          temporary: errorInfo.temporary,
          retryCount,
        });
      }
    }
  }

  throw new ReviewProviderInvocationError(
    lastErrorInfo?.message || "All review providers failed.",
    {
      status: lastErrorInfo?.status ?? null,
      requestId: lastErrorInfo?.requestId ?? null,
      provider: lastErrorInfo?.provider ?? null,
      model: lastErrorInfo?.model ?? null,
      specifier: lastErrorInfo?.specifier ?? null,
      temporary: lastErrorInfo?.temporary ?? false,
      retryCount,
    }
  );
};

