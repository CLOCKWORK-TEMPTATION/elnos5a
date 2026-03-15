import { resolveReviewChannelConfig } from "./provider-config.mjs";

const CANONICAL_MISTRAL_BASE_URL = "https://api.mistral.ai";
export const CANONICAL_MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";
export const CANONICAL_MISTRAL_CHAT_COMPLETIONS_ENDPOINT =
  "https://api.mistral.ai/v1/chat/completions";
export const CANONICAL_MISTRAL_CONVERSATIONS_ENDPOINT =
  "https://api.mistral.ai/v1/conversations";
export const CANONICAL_MISTRAL_AGENTS_ENDPOINT =
  "https://api.mistral.ai/v1/agents";
export const CANONICAL_MISTRAL_AGENTS_COMPLETIONS_ENDPOINT =
  "https://api.mistral.ai/v1/agents/completions";
const DEFAULT_MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_API_VERSION = "2023-06-01";
const reviewRuntimeSnapshots = new Map();

const toOptionalTrimmedString = (value, maxLength = 256) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const normalizeBaseUrl = (value, fallback) => {
  const normalized = toOptionalTrimmedString(value);
  if (!normalized) return fallback;
  return normalized.replace(/\/+$/u, "");
};

const withVersionedPath = (baseUrl, pathAfterV1) => {
  if (/\/v\d+$/iu.test(baseUrl)) {
    return `${baseUrl}${pathAfterV1}`;
  }
  return `${baseUrl}/v1${pathAfterV1}`;
};

export const resolveMistralOcrRuntime = (_env = process.env) => {
  return {
    baseUrl: CANONICAL_MISTRAL_BASE_URL,
    ocrEndpoint: CANONICAL_MISTRAL_OCR_ENDPOINT,
    endpointSource: "hard-locked-canonical",
  };
};

export const resolveMistralChatRuntime = (_env = process.env) => {
  return {
    baseUrl: CANONICAL_MISTRAL_BASE_URL,
    chatCompletionsEndpoint: CANONICAL_MISTRAL_CHAT_COMPLETIONS_ENDPOINT,
    endpointSource: "hard-locked-canonical",
  };
};

export const resolveMistralConversationsRuntime = (_env = process.env) => {
  return {
    baseUrl: CANONICAL_MISTRAL_BASE_URL,
    conversationsEndpoint: CANONICAL_MISTRAL_CONVERSATIONS_ENDPOINT,
    endpointSource: "hard-locked-canonical",
  };
};

export const resolveMistralAgentsRuntime = (_env = process.env) => {
  return {
    baseUrl: CANONICAL_MISTRAL_BASE_URL,
    agentsEndpoint: CANONICAL_MISTRAL_AGENTS_ENDPOINT,
    agentsCompletionsEndpoint: CANONICAL_MISTRAL_AGENTS_COMPLETIONS_ENDPOINT,
    endpointSource: "hard-locked-canonical",
  };
};

export const resolveMoonshotChatRuntime = (env = process.env) => {
  const baseUrl = normalizeBaseUrl(
    env.MOONSHOT_BASE_URL ?? env.KIMI_BASE_URL,
    DEFAULT_MOONSHOT_BASE_URL
  );

  return {
    baseUrl,
    chatCompletionsEndpoint: withVersionedPath(baseUrl, "/chat/completions"),
  };
};

export const resolveAnthropicApiRuntime = (env = process.env) => {
  const baseUrl = normalizeBaseUrl(
    env.ANTHROPIC_BASE_URL,
    DEFAULT_ANTHROPIC_BASE_URL
  );
  const apiVersion =
    toOptionalTrimmedString(env.ANTHROPIC_API_VERSION, 64).toLowerCase() ||
    DEFAULT_ANTHROPIC_API_VERSION;

  return {
    baseUrl,
    apiVersion,
    messagesEndpoint: withVersionedPath(baseUrl, "/messages"),
  };
};

const cloneReviewRuntimeSnapshot = (snapshot) => ({
  ...snapshot,
  credentialWarnings: [...snapshot.credentialWarnings],
});

const buildConfiguredReviewSnapshot = (channel, env = process.env) => {
  const config = resolveReviewChannelConfig(channel, env);

  return {
    channel,
    requestedModel: config.requestedModel,
    resolvedProvider: config.resolvedProvider,
    resolvedModel: config.resolvedModel,
    resolvedSpecifier: config.resolvedSpecifier,
    fallbackRequestedModel: config.requestedFallbackModel,
    fallbackProvider: config.fallback?.valid ? config.fallback.provider : null,
    fallbackModel: config.fallback?.valid ? config.fallback.model : null,
    fallbackSpecifier: config.fallback?.valid
      ? config.fallback.specifier
      : null,
    fallbackConfigured: Boolean(config.fallbackConfigured),
    configured: Boolean(config.configured),
    credentialWarnings: [...config.warnings],
    apiBaseUrl: config.primary?.baseUrl ?? null,
    apiVersion: config.primary?.apiVersion ?? null,
    activeProvider: config.resolvedProvider,
    activeModel: config.resolvedModel,
    activeSpecifier: config.resolvedSpecifier,
    usedFallback: false,
    fallbackReason: null,
    lastStatus: "idle",
    lastErrorClass: null,
    lastErrorMessage: null,
    lastProviderStatusCode: null,
    retryCount: 0,
    latencyMs: null,
    lastInvocationAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastUpdatedAt: null,
  };
};

export const getReviewRuntimeSnapshot = (channel, env = process.env) => {
  const baseSnapshot = buildConfiguredReviewSnapshot(channel, env);
  const existingSnapshot = reviewRuntimeSnapshots.get(channel);

  if (!existingSnapshot) {
    return cloneReviewRuntimeSnapshot(baseSnapshot);
  }

  const configChanged =
    existingSnapshot.requestedModel !== baseSnapshot.requestedModel ||
    existingSnapshot.fallbackRequestedModel !==
      baseSnapshot.fallbackRequestedModel ||
    existingSnapshot.resolvedSpecifier !== baseSnapshot.resolvedSpecifier ||
    existingSnapshot.fallbackSpecifier !== baseSnapshot.fallbackSpecifier;

  return cloneReviewRuntimeSnapshot({
    ...existingSnapshot,
    requestedModel: baseSnapshot.requestedModel,
    resolvedProvider: baseSnapshot.resolvedProvider,
    resolvedModel: baseSnapshot.resolvedModel,
    resolvedSpecifier: baseSnapshot.resolvedSpecifier,
    fallbackRequestedModel: baseSnapshot.fallbackRequestedModel,
    fallbackProvider: baseSnapshot.fallbackProvider,
    fallbackModel: baseSnapshot.fallbackModel,
    fallbackSpecifier: baseSnapshot.fallbackSpecifier,
    fallbackConfigured: baseSnapshot.fallbackConfigured,
    configured: baseSnapshot.configured,
    credentialWarnings: baseSnapshot.credentialWarnings,
    apiBaseUrl: baseSnapshot.apiBaseUrl,
    apiVersion: baseSnapshot.apiVersion,
    activeProvider: configChanged
      ? baseSnapshot.resolvedProvider
      : existingSnapshot.activeProvider,
    activeModel: configChanged
      ? baseSnapshot.resolvedModel
      : existingSnapshot.activeModel,
    activeSpecifier: configChanged
      ? baseSnapshot.resolvedSpecifier
      : existingSnapshot.activeSpecifier,
    usedFallback: configChanged ? false : existingSnapshot.usedFallback,
    fallbackReason: configChanged ? null : existingSnapshot.fallbackReason,
    lastStatus: configChanged ? "idle" : existingSnapshot.lastStatus,
    lastErrorClass: configChanged ? null : existingSnapshot.lastErrorClass,
    lastErrorMessage: configChanged ? null : existingSnapshot.lastErrorMessage,
    lastProviderStatusCode: configChanged
      ? null
      : existingSnapshot.lastProviderStatusCode,
    retryCount: configChanged ? 0 : existingSnapshot.retryCount,
    latencyMs: configChanged ? null : existingSnapshot.latencyMs,
  });
};

export const updateReviewRuntimeSnapshot = (
  channel,
  patch,
  env = process.env
) => {
  const currentSnapshot = getReviewRuntimeSnapshot(channel, env);
  const nextSnapshot = {
    ...currentSnapshot,
    ...patch,
    lastUpdatedAt: Date.now(),
  };
  reviewRuntimeSnapshots.set(channel, nextSnapshot);
  return cloneReviewRuntimeSnapshot(nextSnapshot);
};

export const getAllReviewRuntimeSnapshots = (env = process.env) => ({
  finalReview: getReviewRuntimeSnapshot("final-review", env),
});
