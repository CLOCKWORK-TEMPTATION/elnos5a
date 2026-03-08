const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export const DEFAULT_AGENT_REVIEW_MODEL_SPECIFIER =
  "anthropic:claude-sonnet-4-6";
export const DEFAULT_FINAL_REVIEW_MODEL_SPECIFIER =
  "anthropic:claude-sonnet-4-6";
export const REVIEW_PROVIDER_LIST = Object.freeze([
  "anthropic",
  "openai",
  "google-genai",
  "deepseek",
]);

const REVIEW_CHANNELS = Object.freeze({
  "agent-review": {
    primaryEnvKeys: ["AGENT_REVIEW_MODEL", "ANTHROPIC_REVIEW_MODEL"],
    fallbackEnvKeys: ["AGENT_REVIEW_FALLBACK_MODEL"],
    defaultModel: DEFAULT_AGENT_REVIEW_MODEL_SPECIFIER,
  },
  "final-review": {
    primaryEnvKeys: [
      "FINAL_REVIEW_MODEL",
      "ANTHROPIC_REVIEW_MODEL",
      "AGENT_REVIEW_MODEL",
    ],
    fallbackEnvKeys: ["FINAL_REVIEW_FALLBACK_MODEL"],
    defaultModel: DEFAULT_FINAL_REVIEW_MODEL_SPECIFIER,
  },
});

const PROVIDER_DEFINITIONS = Object.freeze({
  anthropic: {
    credentialEnvKey: "ANTHROPIC_API_KEY",
    defaultBaseUrl: DEFAULT_ANTHROPIC_BASE_URL,
    resolveApiVersion: (env) =>
      toTrimmedString(env.ANTHROPIC_API_VERSION, 64).toLowerCase() ||
      DEFAULT_ANTHROPIC_API_VERSION,
  },
  openai: {
    credentialEnvKey: "OPENAI_API_KEY",
    defaultBaseUrl: DEFAULT_OPENAI_BASE_URL,
    resolveApiVersion: () => null,
  },
  "google-genai": {
    credentialEnvKey: "GEMINI_API_KEY",
    defaultBaseUrl: DEFAULT_GOOGLE_BASE_URL,
    resolveApiVersion: () => null,
  },
  deepseek: {
    credentialEnvKey: "DEEPSEEK_API_KEY",
    defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    resolveApiVersion: () => null,
  },
});

const loggedStartupWarnings = new Set();

const toTrimmedString = (value, maxLength = 256) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const invalidBaseUrlWarnings = [];

const normalizeBaseUrl = (value, fallback) => {
  const normalized = toTrimmedString(value, 512);
  if (!normalized) return fallback;
  // FR-016: reject non-http(s) protocols and values with embedded whitespace
  if (!/^https?:\/\//i.test(normalized) || /\s/.test(normalized)) {
    invalidBaseUrlWarnings.push(
      `Base URL "${normalized}" is invalid (must start with http:// or https:// and contain no whitespace) — using default "${fallback}".`
    );
    return fallback;
  }
  return normalized.replace(/\/+$/u, "");
};

/** @returns {string[]} */
export const getBaseUrlWarnings = () => [...invalidBaseUrlWarnings];

const firstConfiguredValue = (envKeys, env) => {
  for (const envKey of envKeys) {
    const value = toTrimmedString(env[envKey], 256);
    if (value) {
      return {
        envKey,
        value,
      };
    }
  }
  return {
    envKey: null,
    value: "",
  };
};

const createInvalidModelResult = (raw, message) => ({
  valid: false,
  raw,
  provider: null,
  model: null,
  specifier: null,
  error: message,
});

const PROVIDER_PART_REGEX = /^[a-z0-9-]+$/;
const MAX_PROVIDER_LENGTH = 32;
const MAX_MODEL_LENGTH = 128;

/**
 * @param {string} rawValue
 * @returns {{ valid: boolean, raw: string, provider: string | null, model: string | null, specifier: string | null, implicitProvider?: boolean, error?: string }}
 */
export const parseProviderModelSpecifier = (rawValue) => {
  const raw = toTrimmedString(rawValue, 256);
  if (!raw) {
    return createInvalidModelResult(rawValue, "Model specifier is empty.");
  }

  if (!raw.includes(":")) {
    // FR-001-A(د): no colon → implicit anthropic (backward compat)
    const model = raw;
    if (model.length > MAX_MODEL_LENGTH) {
      return createInvalidModelResult(raw, `Model name exceeds ${MAX_MODEL_LENGTH} characters.`);
    }
    return {
      valid: true,
      raw,
      provider: "anthropic",
      model,
      specifier: `anthropic:${model}`,
      implicitProvider: true,
    };
  }

  const [providerPart, ...modelParts] = raw.split(":");
  const provider = providerPart.trim().toLowerCase();
  const model = modelParts.join(":").trim();

  // FR-001-A(أ): provider must match [a-z0-9-]+ and ≤32 chars
  if (!PROVIDER_PART_REGEX.test(provider)) {
    return createInvalidModelResult(
      raw,
      `Provider "${provider}" contains invalid characters. Expected format: provider:model (provider must match [a-z0-9-]+).`
    );
  }
  if (provider.length > MAX_PROVIDER_LENGTH) {
    return createInvalidModelResult(
      raw,
      `Provider name exceeds ${MAX_PROVIDER_LENGTH} characters.`
    );
  }

  if (!REVIEW_PROVIDER_LIST.includes(provider)) {
    return createInvalidModelResult(
      raw,
      `Unsupported provider "${provider}". Supported providers: ${REVIEW_PROVIDER_LIST.join(", ")}.`
    );
  }

  if (!model) {
    return createInvalidModelResult(
      raw,
      `Missing model name in "${raw}". Expected provider:model.`
    );
  }

  // FR-001-A(ب): model ≤128 chars
  if (model.length > MAX_MODEL_LENGTH) {
    return createInvalidModelResult(
      raw,
      `Model name exceeds ${MAX_MODEL_LENGTH} characters.`
    );
  }

  return {
    valid: true,
    raw,
    provider,
    model,
    specifier: `${provider}:${model}`,
    implicitProvider: false,
  };
};

/**
 * @param {string} provider
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ valid: boolean, absent: boolean, credentialEnvKey: string | null, message: string | null, apiKey: string | null }}
 */
export const validateProviderCredential = (
  provider,
  env = process.env
) => {
  const definition = PROVIDER_DEFINITIONS[provider];
  if (!definition) {
    return {
      valid: false,
      absent: false,
      credentialEnvKey: null,
      message: `Provider "${provider}" is not supported.`,
      apiKey: null,
    };
  }

  const credentialEnvKey = definition.credentialEnvKey;
  const apiKey = toTrimmedString(env[credentialEnvKey], 512);
  if (!apiKey) {
    return {
      valid: false,
      absent: true,
      credentialEnvKey,
      message: `${credentialEnvKey} is not set.`,
      apiKey: null,
    };
  }

  if (/\s/u.test(apiKey)) {
    return {
      valid: false,
      absent: false,
      credentialEnvKey,
      message: `${credentialEnvKey} contains invalid whitespace.`,
      apiKey: null,
    };
  }

  if (provider === "anthropic") {
    if (!apiKey.startsWith("sk-ant-")) {
      return {
        valid: false,
        absent: false,
        credentialEnvKey,
        message: `${credentialEnvKey} must start with sk-ant-.`,
        apiKey: null,
      };
    }

    if (apiKey.length < 20 || apiKey.length > 512) {
      return {
        valid: false,
        absent: false,
        credentialEnvKey,
        message: `${credentialEnvKey} has invalid length.`,
        apiKey: null,
      };
    }
  }

  return {
    valid: true,
    absent: false,
    credentialEnvKey,
    message: null,
    apiKey,
  };
};

const resolveProviderBaseUrl = (provider, env) => {
  if (provider === "anthropic") {
    return normalizeBaseUrl(env.ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL);
  }

  if (provider === "openai") {
    return normalizeBaseUrl(env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL);
  }

  if (provider === "deepseek") {
    return normalizeBaseUrl(env.DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_BASE_URL);
  }

  return PROVIDER_DEFINITIONS[provider]?.defaultBaseUrl ?? null;
};

const enrichResolvedTarget = (parsed, role, env) => {
  if (!parsed.valid) {
    return {
      role,
      ...parsed,
      requestedSpecifier: parsed.raw ?? null,
      credential: null,
      credentialEnvKey: null,
      baseUrl: null,
      apiVersion: null,
      usable: false,
    };
  }

  const credential = validateProviderCredential(parsed.provider, env);
  const definition = PROVIDER_DEFINITIONS[parsed.provider];

  return {
    role,
    ...parsed,
    requestedSpecifier: parsed.raw,
    credential,
    credentialEnvKey: definition.credentialEnvKey,
    baseUrl: resolveProviderBaseUrl(parsed.provider, env),
    apiVersion: definition.resolveApiVersion(env),
    usable: credential.valid,
  };
};

const createCredentialWarning = (target) => {
  if (!target || !target.valid || !target.credential || target.credential.valid) {
    return null;
  }

  return `${target.role} provider ${target.specifier} requires ${target.credential.credentialEnvKey}: ${target.credential.message}`;
};

const createConfigWarning = (target) => {
  if (!target || target.valid) return null;
  return `${target.role} model configuration is invalid: ${target.error}`;
};

/**
 * @param {"agent-review" | "final-review"} channel
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ channel: string, requestedModel: string | null, requestedFallbackModel: string | null, resolvedProvider: string | null, resolvedModel: string | null, resolvedSpecifier: string | null, primary: object, fallback: object | null, configured: boolean, fallbackConfigured: boolean, warnings: string[] }}
 */
export const resolveReviewChannelConfig = (
  channel,
  env = process.env
) => {
  const channelDefinition = REVIEW_CHANNELS[channel];
  if (!channelDefinition) {
    throw new Error(`Unsupported review channel: ${channel}`);
  }

  const requestedPrimary =
    firstConfiguredValue(channelDefinition.primaryEnvKeys, env).value ||
    channelDefinition.defaultModel;
  const requestedFallback = firstConfiguredValue(
    channelDefinition.fallbackEnvKeys,
    env
  ).value;

  const primary = enrichResolvedTarget(
    parseProviderModelSpecifier(requestedPrimary),
    "primary",
    env
  );
  const fallback = requestedFallback
    ? enrichResolvedTarget(
        parseProviderModelSpecifier(requestedFallback),
        "fallback",
        env
      )
    : null;

  // SC-011 / FR-003-A: warn once per channel when implicit provider (no prefix) is used
  const implicitWarnings = [];
  if (primary.implicitProvider) {
    implicitWarnings.push(
      `${channel} primary model "${primary.raw}" has no provider prefix — resolved as "${primary.specifier}". Add the provider prefix explicitly (e.g., anthropic:${primary.raw}).`
    );
  }
  if (fallback?.implicitProvider) {
    implicitWarnings.push(
      `${channel} fallback model "${fallback.raw}" has no provider prefix — resolved as "${fallback.specifier}". Add the provider prefix explicitly.`
    );
  }

  const warnings = [
    ...implicitWarnings,
    createConfigWarning(primary),
    createCredentialWarning(primary),
    createConfigWarning(fallback),
    createCredentialWarning(fallback),
  ].filter(Boolean);

  return {
    channel,
    requestedModel: requestedPrimary || null,
    requestedFallbackModel: requestedFallback || null,
    resolvedProvider: primary.valid ? primary.provider : null,
    resolvedModel: primary.valid ? primary.model : null,
    resolvedSpecifier: primary.valid ? primary.specifier : null,
    primary,
    fallback,
    configured: Boolean(primary.usable),
    fallbackConfigured: Boolean(fallback?.usable),
    warnings,
  };
};

/**
 * @param {"agent-review" | "final-review"} channel
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export const getReviewChannelWarnings = (channel, env = process.env) =>
  resolveReviewChannelConfig(channel, env).warnings;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export const getAllReviewChannelWarnings = (env = process.env) =>
  Object.keys(REVIEW_CHANNELS).flatMap((channel) =>
    getReviewChannelWarnings(channel, env)
  );

/**
 * @param {{ warn: (obj: object, msg: string) => void }} logger
 * @param {"agent-review" | "final-review"} channel
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ReturnType<typeof resolveReviewChannelConfig>}
 */
export const logReviewChannelStartupWarnings = (
  logger,
  channel,
  env = process.env
) => {
  const config = resolveReviewChannelConfig(channel, env);
  // FR-016: log base URL validation warnings
  for (const baseUrlWarning of getBaseUrlWarnings()) {
    const cacheKey = `baseurl:${baseUrlWarning}`;
    if (loggedStartupWarnings.has(cacheKey)) continue;
    loggedStartupWarnings.add(cacheKey);
    logger.warn({ channel, warning: baseUrlWarning }, "invalid base URL");
  }
  for (const warning of config.warnings) {
    const cacheKey = `${channel}:${warning}`;
    if (loggedStartupWarnings.has(cacheKey)) continue;
    loggedStartupWarnings.add(cacheKey);
    logger.warn(
      {
        channel,
        warning,
      },
      "review channel configuration warning"
    );
  }
  return config;
};

