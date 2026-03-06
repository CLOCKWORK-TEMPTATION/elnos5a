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
