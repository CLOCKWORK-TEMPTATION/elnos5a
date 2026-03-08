# Data Model: LangChain Review Provider Migration

## Overview

الفيتشر لا يضيف تخزينًا دائمًا، لكنه يضيف نموذج تشغيل واضح لطبقة المزوّدات
المشتركة بين `agent-review` و`final-review`.

## Entities

### 1. ProviderModelSpec

يمثل قيمة `provider:model` بعد التطبيع.

| Field | Type | Description |
| --- | --- | --- |
| `raw` | `string` | القيمة الأصلية من env |
| `provider` | `"anthropic" \| "openai" \| "google-genai" \| "deepseek"` | المزود بعد التطبيع |
| `model` | `string` | اسم النموذج بدون prefix |
| `implicitProvider` | `boolean` | `true` إذا كانت القيمة بلا prefix وتم افتراض `anthropic` |
| `sourceEnv` | `string` | اسم متغير البيئة الذي أتى منه التكوين |

**Validation rules**

- إذا كانت القيمة فارغة تُستخدم القيمة الافتراضية للقناة.
- إذا كان prefix غير مدعوم، ينتج خطأ تكوين واضح.
- إذا كان `model` فارغًا بعد التطبيع، ينتج خطأ تكوين واضح.

### 2. ProviderCredentialRequirement

يمثل متطلبات الاعتماد الخاصة بكل مزود.

| Field | Type | Description |
| --- | --- | --- |
| `provider` | provider enum | المزود المعني |
| `apiKeyEnv` | `string` | اسم متغير المفتاح المطلوب |
| `baseUrlEnv` | `string \| null` | اسم base URL إن وُجد |
| `apiKeyPresent` | `boolean` | هل المفتاح موجود |
| `apiKeyValid` | `boolean` | هل المفتاح صالح شكليًا |
| `warningMessage` | `string \| null` | رسالة التحذير عند startup |

**Validation rules**

- `anthropic` يتطلب `ANTHROPIC_API_KEY`.
- `openai` يتطلب `OPENAI_API_KEY`.
- `google-genai` يتطلب `GEMINI_API_KEY`.
- `deepseek` يتطلب `DEEPSEEK_API_KEY` ويقرأ `DEEPSEEK_BASE_URL` إن وُجد.

### 3. ReviewChannelConfig

يمثل التكوين التشغيلي لقناة مراجعة واحدة.

| Field | Type | Description |
| --- | --- | --- |
| `channel` | `"agent-review" \| "final-review"` | اسم القناة |
| `primary` | `ProviderModelSpec` | المزود/النموذج الأساسي |
| `fallback` | `ProviderModelSpec \| null` | المزود/النموذج البديل |
| `mockMode` | `"success" \| "error" \| null` | وضع الاختبار الوهمي |
| `timeoutMs` | `number` | مهلة القناة |
| `maxRetries` | `number` | عدد retries قبل إعلان الفشل |

**Invariants**

- `primary` دائمًا موجود.
- `fallback` اختياري لكنه إن وُجد يجب أن يكون ProviderModelSpec صالحًا.
- `agent-review` و`final-review` مستقلان بالكامل في التكوين.

### 4. ReviewModelHandle

مقبض تنفيذ موحّد فوق LangChain.

| Field | Type | Description |
| --- | --- | --- |
| `provider` | provider enum | المزود الفعلي |
| `model` | `string` | النموذج الفعلي |
| `invoke` | `(messages, options) => Promise<ProviderInvocationResult>` | واجهة الاستدعاء الموحدة |
| `supportsFallback` | `boolean` | هل هذا المقبض جزء من chain قابلة للبديل |

**Notes**

- هذه الكينونة لا تحتوي business rules.
- يتم إنشاؤها من `ReviewChannelConfig + ProviderCredentialRequirement`.

### 5. ProviderInvocationResult

يمثل نتيجة الاستدعاء الخام قبل parsing.

| Field | Type | Description |
| --- | --- | --- |
| `text` | `string` | النص الموحد المستخرج من LangChain response |
| `provider` | provider enum | المزود الذي أجاب فعليًا |
| `model` | `string` | النموذج الذي أجاب فعليًا |
| `latencyMs` | `number` | زمن الاستجابة |
| `providerStatusCode` | `number \| null` | كود الحالة إن أمكن استخراجه |
| `usage` | `{ inputTokens?: number, outputTokens?: number } \| null` | استهلاك التوكنز إن توفر |

### 6. ReviewExecutionState

يمثل مسار التنفيذ الفعلي لطلب مراجعة واحد.

| Field | Type | Description |
| --- | --- | --- |
| `requestId` | `string` | معرف الطلب |
| `channel` | channel enum | القناة الحالية |
| `attempt` | `number` | رقم المحاولة الحالية |
| `activeProvider` | provider enum | المزود الجاري استخدامه |
| `usedFallback` | `boolean` | هل تم التحويل للبديل |
| `failureClass` | `"temporary" \| "permanent" \| null` | تصنيف آخر خطأ |
| `errors` | `readonly string[]` | ملخص الأخطاء التي حدثت |
| `completed` | `boolean` | هل انتهى التنفيذ |

**State transitions**

1. `configured` → `invoking-primary`
2. `invoking-primary` → `completed`
3. `invoking-primary` → `retrying-primary`
4. `retrying-primary` → `invoking-fallback`
5. `invoking-fallback` → `completed`
6. أي حالة invoke → `failed`

### 7. ReviewRuntimeSnapshot

حالة health المختصرة المخزنة في الذاكرة لكل قناة.

| Field | Type | Description |
| --- | --- | --- |
| `channel` | channel enum | اسم القناة |
| `configuredProvider` | provider enum | المزود المهيأ من env |
| `configuredModel` | `string` | النموذج المهيأ |
| `fallbackConfigured` | `boolean` | هل يوجد fallback config |
| `activeProvider` | provider enum | آخر مزود استخدم فعليًا |
| `activeModel` | `string` | آخر نموذج استخدم فعليًا |
| `fallbackStatus` | `"idle" \| "configured" \| "active" \| "failed"` | حالة fallback الحالية |
| `lastErrorClass` | `"temporary" \| "permanent" \| null` | آخر تصنيف خطأ |
| `lastUpdatedAt` | `number \| null` | آخر تحديث للحالة |

### 8. ReviewAuditLogEntry

سجل لوج واحد لكل طلب مراجعة.

| Field | Type | Description |
| --- | --- | --- |
| `requestId` | `string` | معرف الطلب |
| `importOpId` | `string` | معرف العملية |
| `channel` | channel enum | agent/final |
| `provider` | provider enum | المزود الفعلي |
| `model` | `string` | النموذج الفعلي |
| `usedFallback` | `boolean` | هل فُعّل fallback |
| `latencyMs` | `number` | زمن الاستجابة |
| `status` | `"applied" \| "partial" \| "skipped" \| "error"` | الحالة النهائية |

## Relationships

- `ReviewChannelConfig.primary` → `ProviderModelSpec`
- `ReviewChannelConfig.fallback` → `ProviderModelSpec | null`
- `ProviderModelSpec.provider` → `ProviderCredentialRequirement.provider`
- `ReviewModelHandle` يُنشأ من `ReviewChannelConfig + ProviderCredentialRequirement`
- `ReviewExecutionState` يحدّث `ReviewRuntimeSnapshot`
- `ProviderInvocationResult.text` يدخل إلى parsers الحالية في `agent-review.mjs` و`final-review.mjs`
- `ReviewAuditLogEntry` يُشتق من `ReviewExecutionState + ProviderInvocationResult`

## Non-Goals

- لا يوجد تعديل على `AgentReviewRequestPayload` أو `FinalReviewRequestPayload`.
- لا يوجد تخزين دائم للـ runtime snapshot أو audit entries.
- لا يوجد تغيير على كيانات suspicion-engine أو command-engine.
