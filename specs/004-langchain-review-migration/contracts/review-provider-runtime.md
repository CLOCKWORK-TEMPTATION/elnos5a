# Contract: Review Provider Runtime

## Purpose

واجهة داخلية مشتركة بين
`server/agent-review.mjs`
و
`server/final-review.mjs`
لتجريد
`LangChain`
عن منطق المنتج الحالي، مع الحفاظ على
`provider-api-runtime.mjs`
كمخزن
runtime snapshots
لمسار
`/health`
.

## Planned Modules

```text
server/
├── provider-config.mjs
├── langchain-model-factory.mjs
├── langchain-fallback-chain.mjs
└── provider-api-runtime.mjs
```

## Config Contract

### `resolveReviewChannelConfig(channel, env?)`

**Input**

- `channel`: `"agent-review"` أو `"final-review"`

**Output**

```ts
type ReviewChannelConfig = {
  channel: "agent-review" | "final-review";
  primary: ProviderModelSpec;
  fallback: ProviderModelSpec | null;
  mockMode: "success" | "error" | null;
  timeoutMs: number;
  maxRetries: number;
};
```

**Rules**

- `AGENT_REVIEW_MODEL` و `FINAL_REVIEW_MODEL` هما المصدران الأساسيان.
- إذا كانت القيمة بلا prefix، يتم افتراض `anthropic`.
- fallback اختياري، لكنه إذا وجد يمر عبر نفس parser ونفس validation.

### `getProviderCredentialWarnings(channelConfig, env?)`

**Output**

```ts
type ProviderCredentialWarning = {
  provider: "anthropic" | "openai" | "google-genai" | "deepseek";
  envName: string;
  message: string;
  target: "primary" | "fallback";
};
```

## Model Factory Contract

### `createReviewModel(spec, env?)`

**Input**

- `spec: ProviderModelSpec`
- `env: process.env`

**Output**

```ts
type ReviewModelHandle = {
  provider: ProviderModelSpec["provider"];
  model: string;
  invoke(
    messages: readonly unknown[],
    options: { timeoutMs: number }
  ): Promise<ProviderInvocationResult>;
};
```

**Provider mapping**

- `anthropic` -> LangChain Anthropic adapter
- `openai` -> LangChain OpenAI adapter
- `google-genai` -> LangChain Google adapter مع تمرير `GEMINI_API_KEY`
- `deepseek` -> OpenAI-compatible adapter مع `DEEPSEEK_BASE_URL`

## Fallback Execution Contract

### `executeReviewInvocation(channelConfig, messages, context)`

**Input**

```ts
type ReviewExecutionContext = {
  requestId: string;
  importOpId: string;
  channel: "agent-review" | "final-review";
};
```

**Output**

```ts
type ReviewExecutionResult = {
  text: string;
  provider: "anthropic" | "openai" | "google-genai" | "deepseek";
  model: string;
  usedFallback: boolean;
  retryCount: number;
  latencyMs: number;
  providerStatusCode: number | null;
  usage: { inputTokens?: number; outputTokens?: number } | null;
};
```

**Behavior rules**

- retry على الأخطاء المؤقتة فقط
- fallback فقط بعد فشل مؤقت للمزود الأساسي
- لا fallback على `401`, `403`, `404`, أو validation/configuration errors
- عند فشل الأساسي والبديل، تعود معلومات الخطأ بطريقة صريحة للمسار الأعلى

### `classifyProviderError(error)`

**Output**

```ts
type ProviderErrorClass =
  | { kind: "temporary"; statusCode: number | null; retryable: true }
  | { kind: "permanent"; statusCode: number | null; retryable: false };
```

## Runtime Snapshot Contract

### `seedReviewRuntimeSnapshot(channelConfig)`

تهيئة
snapshot
من التكوين قبل أول طلب.

### `recordReviewRuntimeEvent(event)`

تحديث
snapshot
بعد كل success أو failure.

### `getReviewRuntimeSnapshot(channel)`

**Output**

```ts
type ReviewRuntimeSnapshot = {
  channel: "agent-review" | "final-review";
  configuredProvider: string;
  configuredModel: string;
  fallbackConfigured: boolean;
  activeProvider: string;
  activeModel: string;
  fallbackStatus: "idle" | "configured" | "active" | "failed";
  lastErrorClass: "temporary" | "permanent" | null;
  lastUpdatedAt: number | null;
};
```

**Note**

`provider-api-runtime.mjs`
يبقى أيضًا مسؤولًا عن
exports
الأخرى غير المتعلقة بالمراجعة، ولا يجوز كسرها ضمن هذه الميزة.
