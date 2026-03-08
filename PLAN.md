# تحويل وكيل المراجعة من Anthropic SDK إلى LangChain Deep Agents SDK

تحويل طبقة المراجعة (agent-review + final-review) من الاعتماد المباشر على `@anthropic-ai/sdk` إلى استخدام LangChain SDK مع دعم التبديل بين عدة مزودين (Anthropic, OpenAI, Google Gemini, DeepSeek).

---

## الوضع الحالي

| ملف | الدور | الاعتماد الحالي |
|------|-------|-----------------|
| `server/agent-review.mjs` (1502 سطر) | مراجعة الوكيل — الطبقة 4 في pipeline التصنيف | `@anthropic-ai/sdk` مباشرة + REST fallback عبر axios |
| `server/final-review.mjs` (1258 سطر) | المراجعة النهائية — تحسين على agent-review | نفس النمط |
| `server/provider-api-runtime.mjs` | حل عناوين الـ API endpoints | Anthropic-specific |
| `server/controllers/*-controller.mjs` | HTTP controllers | يستورد من الملفات أعلاه |
| `server/routes/index.mjs` | الراوتر + health endpoint | يستخدم `getAnthropicReviewModel/Runtime` |
| `src/final-review/payload-builder.ts` | بناء حزمة الطلب (frontend) | **لا يتصل بـ AI — لا يتغير** |

### المشاكل في الوضع الحالي
- مقفل على Anthropic فقط (مفتاح `sk-ant-` مطلوب)
- لا يمكن التبديل لـ OpenAI/Gemini/DeepSeek
- كود مكرر كبير بين `agent-review.mjs` و `final-review.mjs`

---

## الخطة

### 1. تثبيت الحزم المطلوبة

```bash
pnpm add langchain @langchain/core @langchain/anthropic @langchain/openai @langchain/google-genai
```

- `langchain` — يوفر `initChatModel` للتبديل بين المزودين بصيغة `provider:model`
- `@langchain/anthropic` — Claude models
- `@langchain/openai` — GPT + DeepSeek (عبر OpenAI-compatible API)
- `@langchain/google-genai` — Gemini models

### 2. إنشاء `server/llm-provider.mjs` — مصنع النماذج الموحد (ملف جديد)

مسؤول عن:
- تحليل صيغة النموذج `provider:model` (مثال: `anthropic:claude-sonnet-4-6`, `openai:gpt-5`, `google-genai:gemini-2.5-flash`)
- إنشاء نموذج LangChain المناسب عبر `initChatModel`
- التحقق من وجود مفتاح API المناسب لكل مزود
- إرجاع معلومات الـ runtime (provider, model, etc.) للـ health endpoint
- دعم fallback model من مزود مختلف

صيغة متغيرات البيئة الجديدة:
```env
# الأساسي — صيغة provider:model
AGENT_REVIEW_MODEL=anthropic:claude-sonnet-4-6
FINAL_REVIEW_MODEL=anthropic:claude-sonnet-4-6

# البديل (fallback) — يمكن أن يكون مزود مختلف
AGENT_REVIEW_FALLBACK_MODEL=openai:gpt-4.1
FINAL_REVIEW_FALLBACK_MODEL=google-genai:gemini-2.5-flash

# مفاتيح API (كل مزود يحتاج مفتاحه)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

التوافق مع الخلف: لو المستخدم كتب `claude-sonnet-4-6` بدون prefix، يُعامل كـ `anthropic:claude-sonnet-4-6` تلقائياً.

### 3. تعديل `server/agent-review.mjs`

**ما يتغير:**
- استبدال `import Anthropic from "@anthropic-ai/sdk"` بـ `import { createReviewModel } from "./llm-provider.mjs"`
- استبدال `getAnthropicClient()` + `client.messages.create()` بـ `model.invoke([systemMsg, humanMsg])`
- استبدال `extractTextFromAnthropicBlocks()` بقراءة `response.content` مباشرة (LangChain يوحد الصيغة)
- تعديل `resolveAnthropicReviewRuntime()` → `resolveReviewRuntime()` (provider-agnostic)
- تعديل `validateAnthropicApiKey()` → `validateProviderApiKey(provider)` (يتحقق حسب المزود)
- تعديل `tryCallAnthropicOnce()` → `tryCallModelOnce()` (يستخدم LangChain)
- إزالة REST fallback عبر axios (LangChain يتعامل مع HTTP)

**ما لا يتغير:**
- System prompt (REVIEW_SYSTEM_PROMPT) — نفسه بالضبط
- `buildReviewUserPrompt()` — نفسه
- `parseReviewCommands()` — نفسه (يحلل JSON من النص)
- `normalizeCommandsAgainstRequest()` — نفسه
- `buildReviewCoverageMeta()` — نفسه
- `createReviewResponseWithCoverage()` — نفسه
- Retry logic + overload detection — يتم تكييفها لأخطاء LangChain
- Mock mode — نفسه
- كل منطق التحقق والتطبيع — نفسه

### 4. تعديل `server/final-review.mjs`

نفس التغييرات كـ agent-review:
- استبدال Anthropic SDK بـ LangChain
- `callAnthropicApi()` → `callReviewModel()`
- `resolveModel()` → يقرأ `FINAL_REVIEW_MODEL` بصيغة `provider:model`

### 5. تحديث `server/routes/index.mjs` و health endpoint

- `getAnthropicReviewModel()` → `getReviewModel()` (يرجع `provider:model`)
- `getAnthropicReviewRuntime()` → `getReviewRuntime()` (يرجع provider + model + status)

### 6. تحديث `server/provider-api-runtime.mjs`

- إضافة دوال لحل عناوين OpenAI و Gemini
- أو الاعتماد على LangChain لإدارة الـ endpoints (أبسط)

---

## الملفات التي لا تتغير

- `src/final-review/payload-builder.ts` — يبني الحزمة على الـ frontend، لا يتصل بـ AI
- `server/controllers/agent-review-controller.mjs` — يستورد `requestAnthropicReview` الذي سنحافظ على اسمه (أو ننشئ alias)
- `server/controllers/final-review-controller.mjs` — نفس الشيء

---

## المزودين المدعومين بعد التحويل

| الصيغة | المزود | أمثلة |
|--------|--------|-------|
| `anthropic:MODEL` | Anthropic | `anthropic:claude-sonnet-4-6`, `anthropic:claude-haiku-4-5-20251001` |
| `openai:MODEL` | OpenAI | `openai:gpt-5`, `openai:gpt-4.1`, `openai:gpt-4o` |
| `google-genai:MODEL` | Google Gemini | `google-genai:gemini-2.5-flash`, `google-genai:gemini-2.5-pro` |
| `MODEL` (بدون prefix) | Anthropic (افتراضي) | `claude-sonnet-4-6` → `anthropic:claude-sonnet-4-6` |

---

## المخاطر والتخفيفات

| المخاطر | التخفيف |
|---------|---------|
| LangChain قد يتعامل مع token limits بشكل مختلف | نحتفظ بمنطق `maxTokens` ونمرره كـ `maxOutputTokens` |
| Retry logic مختلفة | نحتفظ بالـ retry loop الخاص بنا ونستخدم LangChain للاستدعاء فقط |
| بعض النماذج لا تدعم system prompt بنفس الطريقة | LangChain يوحد هذا تلقائياً |
| أخطاء مختلفة من مزودين مختلفين | نكتب `isOverloadError` عام يغطي كل المزودين |

---

## ملاحظات

- **Deep Agents (`createDeepAgent`)** مصمم لمهام متعددة الخطوات مع أدوات. مهمة المراجعة هنا هي **single-shot** (system prompt + user message → JSON). لذلك `initChatModel` من `langchain` هو الأنسب — يوفر نفس ميزة التبديل بين المزودين بدون التعقيد الزائد.
- لو في المستقبل عايز تضيف أدوات أو خطوات متعددة للوكيل، يمكن الترقية لـ `createDeepAgent` بسهولة لأن `initChatModel` متوافق معاه.
