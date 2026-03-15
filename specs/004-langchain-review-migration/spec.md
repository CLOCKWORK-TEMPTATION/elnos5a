# Feature Specification: تحويل وكيل المراجعة من Anthropic SDK إلى LangChain SDK

**Feature Branch**: `004-langchain-review-migration`
**Created**: 2025-03-08
**Status**: Clarified
**Input**: User description: "تحويل وكيل المراجعة من Anthropic SDK إلى LangChain SDK مع دعم التبديل بين عدة مزودين (Anthropic, OpenAI, Google Gemini, DeepSeek)"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - تبديل مزود AI للمراجعة عبر متغير بيئة (Priority: P1)

المطور يريد تغيير مزود AI المستخدم في طبقة المراجعة (agent-review) بدون تعديل أي كود. يكتب في `.env` صيغة `provider:model` (مثلاً `anthropic:claude-sonnet-4-6` أو `openai:gpt-5`) ويعيد تشغيل السيرفر، فيستخدم النظام المزود الجديد تلقائياً.

**Why this priority**: هذه هي القيمة الأساسية للفيتشر — فك الارتباط بـ Anthropic والسماح بالتبديل بين مزودين متعددين. بدون هذا لا قيمة لأي تغيير آخر.

**Independent Test**: يمكن اختباره بتشغيل السيرفر مع `AGENT_REVIEW_MODEL=openai:gpt-4.1` وإرسال طلب مراجعة والتحقق من أن الاستجابة تأتي من OpenAI بنفس الصيغة المتوقعة.

**Acceptance Scenarios**:

1. **Given** متغير البيئة `AGENT_REVIEW_MODEL=anthropic:claude-sonnet-4-6`, **When** يُرسل طلب مراجعة عبر `POST /api/agent/review`, **Then** يستخدم النظام Anthropic Claude ويعيد استجابة مراجعة صالحة بنفس صيغة JSON الحالية.
2. **Given** متغير البيئة `AGENT_REVIEW_MODEL=openai:gpt-4.1`, **When** يُرسل طلب مراجعة عبر `POST /api/agent/review`, **Then** يستخدم النظام OpenAI ويعيد استجابة مراجعة بنفس الصيغة.
3. **Given** متغير البيئة `AGENT_REVIEW_MODEL=google-genai:gemini-2.5-flash`, **When** يُرسل طلب مراجعة, **Then** يستخدم النظام Google Gemini ويعيد استجابة صالحة.
4. **Given** متغير البيئة `AGENT_REVIEW_MODEL=claude-sonnet-4-6` (بدون prefix), **When** يُرسل طلب مراجعة, **Then** يُعامل تلقائياً كـ `anthropic:claude-sonnet-4-6` (توافق خلفي).
5. **Given** متغير البيئة `AGENT_REVIEW_MODEL=""` (قيمة فارغة أو whitespace فقط), **When** يبدأ السيرفر, **Then** يُستخدم تلقائياً الـ default: `anthropic:claude-sonnet-4-6` مع تسجيل تحذير في اللوج يوضح الـ fallback.
6. **Given** متغير البيئة `AGENT_REVIEW_MODEL=openai:` (prefix صالح لكن اسم النموذج فارغ), **When** يبدأ السيرفر, **Then** يُسجَّل خطأ تكوين واضح يوضح غياب اسم النموذج ويُرفض الطلب الأول بـ HTTP 400 مع رسالة تصف الخطأ.
7. **Given** متغير البيئة `AGENT_REVIEW_MODEL=azure:gpt-4` (مزود غير مدعوم), **When** يبدأ السيرفر, **Then** يُسجَّل خطأ تكوين يُدرج فيه المزودون المدعومون (`anthropic`, `openai`, `google-genai`, `deepseek`) ويُرفض كل طلب مراجعة بـ HTTP 400 بدون محاولة أي اتصال خارجي.
8. **Given** أي مزود مُكوَّن بشكل صحيح, **When** يُرسل طلب مراجعة, **Then** يجب أن تحقق الاستجابة شرطَين معاً: (أ) **صحة هيكلية**: حقول `apiVersion`, `mode`, `importOpId`, `requestId`, `status`, `commands`, `message`, `latencyMs` موجودة بأنواعها الصحيحة. (ب) **صحة دلالية**: كل عنصر في `commands[]` يحتوي على `op` من القيم المسموحة (`relabel`|`split`)، و`itemId` سلسلة نصية غير فارغة، و`confidence` رقم بين 0 و1. استجابة تحقق (أ) فقط دون (ب) تُعدّ فشلاً في الاختبار.

---

### User Story 2 - آلية الـ Fallback التلقائية بين المزودين (Priority: P2)

عند فشل المزود الأساسي (overload، خطأ شبكة، مفتاح غير صالح)، ينتقل النظام تلقائياً للمزود البديل المحدد في `AGENT_REVIEW_FALLBACK_MODEL` — حتى لو كان من مزود مختلف تماماً.

**Why this priority**: يضمن استمرارية الخدمة. لو Anthropic واقع، يقدر النظام يستخدم OpenAI أو Gemini كبديل بدون تدخل يدوي.

**Independent Test**: يمكن اختباره بتعيين مفتاح API غير صالح للمزود الأساسي مع مفتاح صالح للبديل، وإرسال طلب مراجعة والتحقق من نجاح الاستجابة من المزود البديل.

**Acceptance Scenarios**:

1. **Given** المزود الأساسي `anthropic:claude-sonnet-4-6` غير متاح (overload/529) والبديل `openai:gpt-4.1`, **When** يُرسل طلب مراجعة, **Then** ينتقل النظام للبديل ويعيد استجابة صالحة تحتوي حقل `"fallbackApplied": true` في جسم JSON، ويُسجّل سطر لوج بمستوى info، ويعكس `/health` قيمة `"active"` للـ `reviewFallbackStatus` (راجع FR-020).
2. **Given** لا يوجد مزود بديل مُعرّف (المتغير فارغ), **When** يفشل المزود الأساسي, **Then** يعيد النظام خطأ واضح يوضح سبب الفشل بدون محاولة fallback.
3. **Given** كلا المزودين (الأساسي والبديل) غير متاحين, **When** يُرسل طلب مراجعة, **Then** يعيد النظام خطأ شامل يوضح فشل كلا المزودين.

---

### User Story 3 - طبقة المراجعة النهائية (final-review) بنفس قدرات التبديل (Priority: P2)

نفس سيناريو التبديل بين المزودين ينطبق على طبقة المراجعة النهائية (`POST /api/final-review`) عبر متغيرات `FINAL_REVIEW_MODEL` و `FINAL_REVIEW_FALLBACK_MODEL`، بشكل مستقل عن agent-review.

**Why this priority**: المراجعة النهائية طبقة موازية لـ agent-review وتحتاج نفس المرونة. لكنها ثانوية لأن agent-review هو نقطة الدخول الأساسية.

**Independent Test**: يمكن اختباره بتعيين `FINAL_REVIEW_MODEL=google-genai:gemini-2.5-pro` وإرسال طلب مراجعة نهائية والتحقق من النتيجة.

**Acceptance Scenarios**:

1. **Given** `FINAL_REVIEW_MODEL=google-genai:gemini-2.5-flash`, **When** يُرسل طلب عبر `POST /api/final-review`, **Then** يستخدم Gemini ويعيد استجابة بنفس صيغة المراجعة النهائية الحالية.
2. **Given** `FINAL_REVIEW_MODEL` غير معرّف, **When** يُرسل طلب, **Then** يستخدم القيمة الافتراضية `anthropic:claude-sonnet-4-6`.
3. **Given** كلا `FINAL_REVIEW_MODEL` و `FINAL_REVIEW_FALLBACK_MODEL` فشلا بأخطاء مؤقتة أو غير متاحين, **When** يُرسل طلب عبر `POST /api/final-review`, **Then** يعيد الـ endpoint استجابة JSON بـ `status: "error"` و HTTP 200، تحتوي على `message` يوضح فشل كلا المزودين، و `commands: []`، و `meta.coverage.status: "uncovered"` — بدون إلقاء exception غير معالج أو إعادة HTTP 5xx.

---

### User Story 4 - تقرير صحة النظام (Health Endpoint) محدّث (Priority: P3)

الـ health endpoint (`GET /health`) يعرض معلومات المزود الحالي بصيغة provider-agnostic بدلاً من المعلومات الخاصة بـ Anthropic فقط، بحيث يوضح المزود النشط والنموذج وحالة الـ fallback.

**Why this priority**: مهم للمراقبة والتشخيص لكنه لا يؤثر على الوظيفة الأساسية.

**Independent Test**: يمكن اختباره بإرسال `GET /health` والتحقق من وجود حقول `reviewProvider`، `reviewModel`، `reviewFallbackStatus`.

**Acceptance Scenarios**:

1. **Given** `AGENT_REVIEW_MODEL=openai:gpt-5`, **When** يُطلب `/health`, **Then** يعرض `reviewProvider: "openai"` و `reviewModel: "gpt-5"`.
2. **Given** المزود الأساسي فشل وتم التبديل للبديل, **When** يُطلب `/health`, **Then** يعرض حالة الـ fallback النشطة.
3. **Given** لم يُرسَل أي طلب مراجعة منذ بدء تشغيل السيرفر (الحالة الأولية), **When** يُطلب `/health`, **Then** يعرض `reviewFallbackStatus: "idle"` (لا `"unknown"` ولا `null`) — الحالة الافتراضية قبل أي طلب هي `"idle"`.

---

### User Story 5 - التحقق من مفتاح API حسب المزود (Priority: P3)

عند بدء تشغيل السيرفر، يتحقق النظام من وجود مفتاح API المناسب للمزود المحدد (مثلاً `OPENAI_API_KEY` لـ OpenAI، `GEMINI_API_KEY` لـ Gemini) ويعطي تحذير واضح في حالة عدم وجوده.

**Why this priority**: يمنع أخطاء وقت التشغيل الغامضة بإبلاغ المطور مبكراً.

**Independent Test**: يمكن اختباره بتعيين `AGENT_REVIEW_MODEL=openai:gpt-5` بدون `OPENAI_API_KEY` وملاحظة رسالة التحذير عند بدء التشغيل.

**Acceptance Scenarios**:

1. **Given** `AGENT_REVIEW_MODEL=openai:gpt-5` و `OPENAI_API_KEY` غير موجود, **When** يبدأ السيرفر, **Then** يظهر تحذير واضح في اللوج يوضح أن المفتاح مطلوب.
2. **Given** `AGENT_REVIEW_MODEL=anthropic:claude-sonnet-4-6` و `ANTHROPIC_API_KEY` موجود وصالح, **When** يبدأ السيرفر, **Then** لا تظهر أي تحذيرات متعلقة بالمفاتيح.

---

### Edge Cases

- ماذا يحدث عند كتابة اسم مزود غير مدعوم في `AGENT_REVIEW_MODEL`؟ (مثلاً `azure:gpt-4`) — يجب أن يعيد خطأ واضح يحدد المزودين المدعومين.
- ماذا يحدث عند كتابة اسم نموذج غير موجود لمزود صالح؟ (مثلاً `openai:nonexistent-model`) — يجب أن يمرر الخطأ من المزود بوضوح.
- ماذا يحدث عند تجاوز حد الـ tokens لمزود مختلف عن Anthropic؟ — يجب أن يتعامل النظام مع حدود كل مزود بشكل مناسب.
- ماذا يحدث لو الاستجابة من مزود غير Anthropic لا تحتوي JSON صالح؟ — يجب أن تعمل آلية الـ parsing الحالية (`parseReviewCommands`) بنفس الطريقة.
- ماذا يحدث عند استخدام mock mode مع مزود غير Anthropic؟ — يجب أن يعمل mock mode بنفس الطريقة بغض النظر عن المزود.
- كيف يتعامل النظام مع اختلاف صيغ الأخطاء بين المزودين (429 vs 529 vs 503)؟ — يجب توحيد كشف أخطاء الـ overload/rate-limit لتغطي كل المزودين.

## Clarifications

### Session 2025-03-08

- Q: كيف يتم تكوين DeepSeek — كمزود مستقل أم عبر OpenAI؟ → A: مزود مستقل (`deepseek:model`) مع `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL` منفصلين عن OpenAI.
- Q: متى يتفعل الـ fallback — على كل الأخطاء أم المؤقتة فقط؟ → A: الأخطاء المؤقتة فقط (overload, rate-limit, timeout, 5xx). الأخطاء الدائمة (401, 403, 404) تفشل فوراً برسالة واضحة.
- Q: ما مستوى الـ observability لكل طلب مراجعة؟ → A: لوج لكل طلب: المزود المستخدم + حالة الـ fallback + زمن الاستجابة (عبر pino الموجود).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: النظام يجب أن يدعم صيغة `provider:model` في متغيرات البيئة لتحديد مزود AI والنموذج المطلوب.
- **FR-001-A**: صيغة `provider:model` يجب أن تلتزم بالقواعد التالية: (أ) جزء المزود (`provider`) يتكوّن من حروف لاتينية صغيرة وأرقام وشرطات فقط (نمط: `[a-z0-9-]+`)، بطول لا يتجاوز 32 محرفاً؛ (ب) جزء النموذج (`model`) يتكوّن من أي محرف مرئي غير فارغ بطول لا يتجاوز 128 محرفاً ويُسمح فيه بنقطتين إضافية (`:`) لأسماء نماذج تحتوي على namespace؛ (ج) الفراغات البادئة والتابعة تُزال قبل التحليل؛ (د) القيمة الفارغة أو الفراغ فقط تُعامل كغياب للتكوين فيُستخدم الافتراضي؛ (ه) أي قيمة لا تستوفي هذه القواعد تُعيد خطأ واضحاً يذكر التنسيق المطلوب.
- **FR-002**: النظام يجب أن يدعم أربعة مزودين على الأقل: Anthropic (`anthropic:`)، OpenAI (`openai:`)، Google Gemini (`google-genai:`)، وDeepSeek (`deepseek:`) — كل مزود مسجل بشكل مستقل مع متغيرات بيئة خاصة به (`DEEPSEEK_API_KEY`، `DEEPSEEK_BASE_URL`). DeepSeek يستخدم OpenAI-compatible protocol داخلياً لكنه مُكوّن بشكل منفصل تماماً عن مزود OpenAI. كل مزود يدعم تهيئة عنوان URL الأساسي عبر متغير بيئة مستقل: `ANTHROPIC_BASE_URL` (افتراضي: `https://api.anthropic.com`)، `OPENAI_BASE_URL` (افتراضي: `https://api.openai.com/v1`)، `DEEPSEEK_BASE_URL` (افتراضي: `https://api.deepseek.com/v1`). مزود `google-genai` لا يدعم تجاوز عنوان URL الأساسي.
- **FR-003**: النظام يجب أن يحافظ على التوافق الخلفي — كتابة اسم النموذج بدون prefix (مثل `claude-sonnet-4-6`) يجب أن يُعامل تلقائياً كـ `anthropic:claude-sonnet-4-6`.
- **FR-003-A**: قاعدة التوافق الخلفي (الـ implicit provider) تُطبَّق **فقط** عندما تكون القيمة خالية من النقطتين (`:`) تماماً. إذا احتوت القيمة على نقطتين لكن جزء المزود غير معترف به ضمن القائمة المدعومة، فإن النظام يعيد خطأ "unsupported provider" بدلاً من افتراض `anthropic:`. كل استخدام للـ implicit provider يُسجّل في اللوج بمستوى `warn` لتشجيع الانتقال للصيغة الصريحة — التحذير يظهر مرة واحدة عند بدء التشغيل لكل قناة.
- **FR-004**: النظام يجب أن يوفر آلية fallback تلقائية تنتقل لمزود بديل عند فشل المزود الأساسي بأخطاء مؤقتة فقط (overload/rate-limit/timeout/5xx). الأخطاء الدائمة (401 auth, 403 forbidden, 404 model not found) تُعيد خطأ فوري بدون محاولة fallback لمنع إخفاء مشاكل التكوين.
- **FR-004-A**: مهلة استدعاء المزود (`timeoutMs`) القيمة الافتراضية 180,000 ms (3 دقائق). أي استجابة تتجاوز هذه المهلة تُعدّ خطأً مؤقتاً (`temporary: true`) وتُطلق آلية الـ fallback إذا كانت مُفعّلة. انتهاء المهلة لا يُسبّب إعادة المحاولة على نفس المزود بعد استنفاذ `OVERLOAD_MAX_RETRIES`.
- **FR-005**: النظام يجب أن يحافظ على نفس بنية الاستجابة المشتركة لكلا الـ endpoint (`apiVersion`، `mode`، `importOpId`، `requestId`، `status`، `commands`، `message`، `latencyMs`، `model`، `meta`) بغض النظر عن المزود. **الفوارق المقصودة بين الـ endpoint-ين يجب أن تُحافَظ عليها**: (1) `agent-review` يقبل `totalSuspicion` (float 0–100) بينما `final-review` يقبل `suspicionScore` بنفس النطاق. (2) `final-review` يشترط `packetVersion` و `schemaVersion` و `routingBand` كحقول required بينما هي optional أو غائبة في `agent-review`. (3) `agent-review` يُطبّع `scene_header_top_line` → `scene_header_1` في قرارات الـ AI، بينما `final-review` يُطبّع `scene_header_1`/`scene_header_2` → `scene_header_top_line` قبل المعالجة — وكلا التطبيعَين يجب أن يبقيا دون تغيير بعد الترحيل.
- **FR-005-A**: عقد HTTP لنقطتَي المراجعة يجب أن يظل ثابتاً بعد التحويل — بالضبط: الطريقة والمسار `POST /api/agent/review` و `POST /api/final-review` بدون تغيير. رمز HTTP عند النجاح: `200 OK`. رموز HTTP عند الفشل: `400` للطلبات المشوهة، `500`/`503` لأخطاء المزود. نوع المحتوى: `Content-Type: application/json` في الاستجابة دائماً. لا يُضاف أي header إلزامي جديد في الطلب ولا في الاستجابة.
- **FR-005-B**: عقد الطلب لـ `POST /api/agent/review` يجب أن يحتوي على: `sessionId` (string, required, max 120)، `importOpId` (string, required, max 120)، `totalReviewed` (non-negative integer, required)، `suspiciousLines` (array, required) — كل عنصر يحتوي: `itemId` (string)، `lineIndex` (integer)، `text` (string, max 6000)، `assignedType` (ElementType)، `totalSuspicion` (number 0–100)، `routingBand` (`"agent-candidate"` | `"agent-forced"`)، `contextLines` (array, optional)، `fingerprint` (string, optional, max 256). عقد الطلب لـ `POST /api/final-review` يضاف إليه: `packetVersion` (string, required, max 64)، `schemaVersion` (string, required, max 64)، `schemaHints` (object, optional)، `reviewPacketText` (string, optional, max 160,000)، وفي كل سطر: `suspicionScore` (number 0–100)، `routingBand` (required)، `primarySuggestedType` (optional ElementType)، `reasonCodes` (array of strings, max 32)، `signalMessages` (array of strings, max 32). الاستجابة لكلا الـ endpoint تحتوي على: `apiVersion` (string)، `mode` (string)، `importOpId` (string)، `requestId` (UUID string)، `status` (`"applied"` | `"partial"` | `"skipped"` | `"error"`)، `commands` (array)، `message` (string)، `latencyMs` (number)، `model` (string)، `meta` (object).
- **FR-006**: النظام يجب أن يوحد كشف أخطاء الـ overload وrate-limit عبر كل المزودين (HTTP 429, 529, 503 + رسائل خطأ خاصة بكل مزود).
- **FR-006-A**: بالإضافة لرموز HTTP العامة (429, 503, 529)، يجب أن يُعامَل كخطأ مؤقت: HTTP 408 (Request Timeout)، HTTP 409 (Conflict)، HTTP 425 (Too Early)، وأي رمز 5xx بين 500–599. كذلك أي خطأ يحتوي نصياً على: `overload`، `rate_limit`، `rate limit`، `timeout`، `timed out`، `temporar`، `econnreset`، `etimedout`، `socket hang up`، `network`. هذه القائمة تُطبَّق بشكل موحد عبر كل المزودين.
- **FR-006-B**: خطأ استنفاد حصة Gemini (`RESOURCE_EXHAUSTED` / HTTP 429 مع رسالة quota) يُعامَل كخطأ مؤقت. خطأ تجاوز حد السياق لـ DeepSeek (`400` مع `context_length_exceeded` في رسالة الخطأ) يُعامَل كخطأ دائم ولا يُطلق fallback. خطأ Gemini `INVALID_ARGUMENT` (400) بسبب حجم الطلب يُعامَل كخطأ دائم.
- **FR-006-C**: تجاوز حد الـ tokens يُعامَل كخطأ دائم (لا fallback) لكل المزودين — بصرف النظر عن رمز HTTP: Anthropic: `400` + `{"error":{"type":"invalid_request_error"}}` يتضمن "too many tokens" أو "max_tokens". OpenAI: `400` + `{"error":{"code":"context_length_exceeded"}}`. Gemini: `400` + `INVALID_ARGUMENT` يتضمن "token". DeepSeek: `400` + رسالة تحتوي `context_length_exceeded`. في كل هذه الحالات يجب إعادة خطأ فوري بدلالة `temporary: false`.
- **FR-007**: النظام يجب أن يتحقق عند بدء التشغيل من وجود مفتاح API المناسب للمزود المحدد ويعطي تحذير واضح في حالة غيابه.
- **FR-007-A**: سلوك التحقق من مفتاح API عند بدء التشغيل: (أ) إذا كان المفتاح غائباً للمزود المُعرَّف كـ `primary`، يستمر السيرفر في التشغيل في وضع "degraded" مع تسجيل تحذير `warn` في كل بدء تشغيل، ويعيد كل طلب مراجعة خطأ HTTP 503 مع رسالة توضح غياب المفتاح؛ (ب) إذا كان المفتاح غائباً للمزود الـ `fallback` فقط، يستمر السيرفر بصحة كاملة مع `warn` واحد في اللوج؛ (ج) لا يُوقَف السيرفر (`process.exit`) بسبب غياب مفتاح API وحده — رفع الأخطاء يتأخر لوقت الطلب.
- **FR-008**: الـ health endpoint يجب أن يعرض معلومات المزود الحالي بصيغة provider-agnostic (المزود، النموذج، حالة الـ fallback).
- **FR-008-A**: استجابة `GET /health` يجب أن تحتوي على الحقول الإلزامية التالية بالأنواع المحددة: `status: "ok"` (string)، `agentReviewConfigured: boolean`، `finalReviewConfigured: boolean`، `reviewProvider: string|null`، `reviewModel: string|null`، `reviewFallbackStatus: "active"|"idle"`، `finalReviewProvider: string|null`، `finalReviewModel: string|null`، `finalReviewFallbackStatus: "active"|"idle"`. الحقل `reviewFallbackStatus` يعكس حالة آخر طلب فعلي، لا تخمين وقت التشغيل.
- **FR-009**: النظام يجب أن يحافظ على كل منطق الـ business logic الحالي: system prompts، بناء الـ user prompt، تحليل أوامر JSON، التطبيع، حساب التغطية — بدون أي تعديل.
- **FR-009-A**: "عدم التغيير في منطق الـ business logic" يعني تحديداً: (أ) محتوى system prompt ووحدات بناء user prompt يبقيان نصياً متطابقين — لا حذف، لا إضافة، لا إعادة ترتيب للفقرات؛ (ب) دالة `parseReviewCommands` وكل منطق تطبيع أنواع السطور وحساب التغطية تبقى بدون تعديل في سلوكها الخارجي؛ (ج) قيم `max_tokens` المحسوبة (بما فيها `BASE_OUTPUT_TOKENS` و `TOKENS_PER_SUSPICIOUS_LINE` والسقف المحسوب) تبقى مجمّدة وغير مرتبطة بالمزود المختار — أي مزود يستقبل نفس قيمة التوكن المحسوبة. الواجهات الداخلية المسموح بتغييرها هي فقط: كيفية إنشاء الـ model instance، وكيفية استدعاء الـ API، وكيفية استخراج النص من الاستجابة.
- **FR-009-B**: تعارض حد الـ tokens بين المزودين وFR-009 يُحسم كالتالي: النظام يحسب قيمة `max_tokens` المطلوبة بنفس الصيغة الحالية (provider-agnostic)، ثم **يُرسلها كما هي** لكل مزود. إذا رفض المزود الطلب بسبب تجاوز حده الأعلى، فإن النظام **يُعيد الخطأ مباشرة كخطأ دائم** (لا fallback، لا retry) مع رسالة توضح أن المشكلة في حد الـ tokens. لا يُعدّل النظام قيمة `max_tokens` تلقائياً بناءً على المزود. اختيار نموذج بسقف tokens أقل من الميزانية المحسوبة هو مسؤولية المشغّل وتُوثَّق في `.env.example`.
- **FR-010**: النظام يجب أن يدعم تكوين مستقل لكل طبقة — `AGENT_REVIEW_MODEL` منفصل عن `FINAL_REVIEW_MODEL` — بحيث يمكن استخدام مزودين مختلفين لكل طبقة.
- **FR-010-A**: قناتا المراجعة (`agent-review` و `final-review`) يجب أن تكونا معزولتين تماماً على مستوى المثيل — لا مشاركة لـ `ReviewModelHandle` أو `ReviewChannelConfig` أو module-level singletons بينهما. تعطّل أو إعادة بناء إحدى القناتين لا يؤثر على الأخرى. لا يُسمح بأن يُشغّل استدعاء على قناة `agent-review` قراءة أو تعديل حالة قناة `final-review` (وعكسه).
- **FR-011**: النظام يجب أن يوفر آلية retry لأخطاء LangChain المؤقتة بحد أقصى **3 محاولات** (بما في ذلك المحاولة الأولى) مع backoff أسي يبدأ بـ **3000 ms** ومضاعف **2** (3 ثوانٍ، 6 ثوانٍ، 12 ثانية). مهلة كل محاولة منفردة: **180,000 ms**. تُطبَّق هذه المعايير بشكل موحد على كلا قناتَي المراجعة (`agent-review` و `final-review`) وعلى كل المزودين المدعومين.
- **FR-012**: النظام يجب أن يزيل الاعتماد على `axios` لـ REST fallback في طبقة المراجعة. LangChain يتولى نقل HTTP بالكامل داخلياً. السلوكيات التالية **يجب الحفاظ عليها**: مهلة 180,000 ms لكل محاولة. السلوكيات التالية **مقبول التخلي عنها** بعد الإزالة: proxy support عبر `HTTP_PROXY` / `HTTPS_PROXY`، redirect handling يدوي، وأي TLS pinning مُهيَّأ عبر `axios` config — هذه المسؤوليات تنتقل لبيئة Node.js الافتراضية.
- **FR-013**: وضع mock يُفعَّل عبر متغيرات بيئة منفصلة لكل قناة: `AGENT_REVIEW_MOCK_MODE` و `FINAL_REVIEW_MOCK_MODE`. القيم المقبولة: `success` (يعيد استجابة ناجحة بتأكيد الأنواع الحالية) أو `error` (يعيد استجابة خطأ). Mock mode يعمل بغض النظر عن المزود المحدد — أي النظام يتجاهل المزود ويعيد الاستجابة المُصطنعة مباشرة بدون أي استدعاء لـ API خارجي. صيغة استجابة mock تطابق صيغة الاستجابة الحقيقية بالضبط بما في ذلك الحقل `model` الذي يحمل قيمة النموذج المُهيَّأ.
- **FR-014**: كل طلب مراجعة يجب أن يُسجّل في اللوج: المزود الذي استُخدم فعلياً، هل الـ fallback اتفعل، وزمن الاستجابة بالملي ثانية — عبر الـ logger الموجود (pino).
- **FR-015**: التنفيذ يجب أن يكون **شاملاً من أول ملف لآخر ملف** — كل الملفات المتأثرة بالتحويل يجب أن تُعدّل في نفس الـ feature branch بدون ترك أي ملف يعتمد على Anthropic SDK مباشرة. لا يُقبل تنفيذ جزئي يُعدّل طبقة السيرفر فقط ويترك الاختبارات أو التكوين أو التوثيق بدون تحديث.
- **FR-016**: أي متغير base URL يحتوي على مسافات أو بروتوكول غير `https://` أو `http://` يُتجاهل وتُستخدم القيمة الافتراضية — يجب أن يُسجَّل تحذير في اللوج يوضح أن القيمة المُقدَّمة كانت غير صالحة.
- **FR-020**: "الإشارة بأن الـ fallback فعّال" تعني تحديداً ثلاثة آثار مشتركة ومتزامنة: (أ) حقل `"fallbackApplied": true` في جسم استجابة JSON لطلب المراجعة؛ (ب) حقل `"reviewFallbackStatus": "active"` (أو `"finalReviewFallbackStatus": "active"`) في استجابة `GET /health` طالما أن آخر طلب ناجح استخدم المزود البديل؛ (ج) سطر لوج بمستوى `info` يحتوي على `channel`، `usedFallback: true`، `fallbackProvider`، `fallbackModel`، وسبب الانتقال.
- **FR-021**: معيار "لا Anthropic-specific logic" في ملفات الفرونت إند (الطبقة 5) يُعرَّف بثلاثة شروط قابلة للفحص الآلي: (أ) لا يوجد import أو require لـ `@anthropic-ai/sdk`؛ (ب) لا يوجد hardcoded model identifier بصيغة `claude-[a-z]+-[0-9]` مُسند كقيمة نهائية (string literal) — الأسماء الوصفية مثل `"claude-review"` كـ pipeline stage label مسموحة؛ (ج) لا يوجد استخدام لـ Anthropic-specific headers خارج ملفات السيرفر. الفحص الآلي: `grep -r "@anthropic-ai/sdk\|claude-sonnet\|claude-haiku\|claude-opus" src/extensions/ src/pipeline/ src/final-review/` يُرجع نتيجة فارغة.
- **FR-022**: في حالة الفشل المزدوج (primary + fallback كلاهما فاشلان)، السلوك الموحّد عبر طبقتي المراجعة: (أ) استجابة HTTP 200 بجسم JSON يحتوي: `"status": "error"`، `"commands": []`، `"message": "<رسالة واضحة تصف فشل كلا المزودين>"`، `"fallbackApplied": true`؛ (ب) حقل `reviewFallbackStatus` في `GET /health` يحتفظ بقيمة `"active"` (لأن الـ fallback جُرِّب)، وحقل `lastStatus` يُسجَّل كـ `"failed"`؛ (ج) هذا السلوك متطابق بين الطبقتين — لا يوجد حقل في استجابة الخطأ يختلف بين `/api/agent/review` و `/api/final-review`.
- **FR-023**: اسم مزود غير مدعوم يُعالَج على مستويين: (أ) **وقت التشغيل**: يُصدر تحذير في اللوج (`warn`) يذكر المزود غير المدعوم وقائمة المزودين المقبولين. السيرفر يبدأ ولا يتوقف. (ب) **وقت الطلب**: إذا استُدعيت نقطة المراجعة والمزود غير قابل للاستخدام (`usable: false`)، يُعاد `HTTP 503` مع رسالة خطأ واضحة. لا محاولة للاتصال بأي مزود.
- **FR-024**: إذا أعاد المزود نصاً لا يمكن تحليله كـ JSON صالح، يجب أن يحاول النظام استخراج JSON من داخل النص (JSON embedded في نص نثري) قبل اعتباره فاشلاً. إذا فشل الاستخراج، تُعاد استجابة بـ `status: "error"` و`commands: []` و`message` يصف فشل التحليل — بدون رفع استثناء غير معالَج. هذا السلوك متطابق بغض النظر عن المزود.

### Key Entities

- **LLM Provider Configuration**: يمثل تكوين مزود AI واحد — يتضمن اسم المزود، اسم النموذج، مفتاح API المطلوب، وأي إعدادات خاصة بالمزود.
- **Review Model Instance**: نموذج LangChain مُهيأ وجاهز للاستدعاء — ينشأ من تكوين المزود ويوفر واجهة موحدة (`invoke`) بغض النظر عن المزود الأصلي.
- **Fallback Chain**: سلسلة من مزودين (أساسي + بديل) مع منطق الانتقال التلقائي بينهم عند الفشل.
- **Provider Runtime Info**: معلومات وقت التشغيل عن المزود النشط — تُستخدم في الـ health endpoint وفي اللوج للمراقبة.

#### Review Model Instance Lifecycle

- كائن `ReviewModelHandle` يُنشأ مرة واحدة عند بدء تشغيل السيرفر لكل قناة مراجعة (agent-review و final-review) ويُعاد استخدامه عبر كل الطلبات — لا يُنشأ نموذج جديد لكل طلب.
- إعادة بناء `ReviewModelHandle` تحدث فقط عند تغيير متغيرات البيئة ذات الصلة — أي تستلزم إعادة تشغيل السيرفر. لا يوجد hot-reload أو dynamic refresh أثناء التشغيل.
- إذا فشل إنشاء `ReviewModelHandle` عند الـ startup (مثلاً: مزود غير مدعوم)، يُسجل الخطأ ويعمل السيرفر في وضع degraded — أي يُعيد خطأ واضح لكل طلب مراجعة يصل.

#### Entity Cardinality Constraints

- كل `ReviewChannelConfig` يحتوي على **دقيقاً واحد** `ProviderModelSpec` أساسي و**صفر أو واحد** `ProviderModelSpec` بديل.
- كل `ProviderModelSpec` يرتبط بـ**دقيقاً واحد** `ProviderCredentialRequirement` — أي مزود واحد لا يشارك credentials مع مزود آخر.
- كل قناة مراجعة (`agent-review`، `final-review`) تولد **دقيقاً واحد** `ReviewModelHandle` نشط في أي لحظة — إذا كان الـ fallback نشطاً فهو يحل محل الأساسي لا يُضاف إليه.
- `ReviewExecutionState` ينشأ لكل طلب ويُدمر فور اكتماله — لا يُخزن في الذاكرة بعد إنتاج `ReviewAuditLogEntry`.
- `ReviewRuntimeSnapshot` واحد لكل قناة ويُحدَّث in-place — لا يتراكم عبر الطلبات.

### Log Record Schema (FR-014 تفصيل)

كل طلب مراجعة ينتج سطر لوج واحد عند الاكتمال (نجاح أو فشل). يجب أن يحتوي على الحقول التالية:

| Field Name     | Type                                                      | Unit / Values              | Description                 |
| -------------- | --------------------------------------------------------- | -------------------------- | --------------------------- |
| `requestId`    | `string`                                                  | UUID v4                    | معرف الطلب الفريد           |
| `channel`      | `"agent-review" \| "final-review"`                        | enum                       | القناة التي نفّذت الطلب     |
| `provider`     | `"anthropic" \| "openai" \| "google-genai" \| "deepseek"` | enum                       | المزود الذي أجاب فعلياً     |
| `model`        | `string`                                                  | model identifier           | النموذج الذي أجاب فعلياً    |
| `usedFallback` | `boolean`                                                 | —                          | هل تم التحويل للمزود البديل |
| `latencyMs`    | `number`                                                  | milliseconds (integer ≥ 0) | زمن الاستجابة الكلي         |
| `status`       | `"applied" \| "partial" \| "skipped" \| "error"`          | enum                       | حالة نتيجة المراجعة         |
| `errorClass`   | `"temporary" \| "permanent" \| null`                      | enum or null               | تصنيف الخطأ إن وُجد         |

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: طلبات المراجعة عبر `POST /api/agent/review` و `POST /api/final-review` تعيد نفس صيغة JSON الحالية بالضبط بغض النظر عن المزود المستخدم — اختبارات التكامل الحالية تمر بدون تعديل.
- **SC-001-A**: "نفس صيغة JSON" تعني التوافق الكامل مع `AgentReviewResponsePayload` و`FinalReviewResponsePayload` المعرّفَين في `src/types/agent-review.ts` و`src/types/final-review.ts` — على الأقل الحقول الإلزامية: `apiVersion: "2.0"`, `mode: "auto-apply"`, `importOpId: string`, `requestId: string`, `status: "applied"|"partial"|"skipped"|"error"`, `commands: AgentCommand[]`, `message: string`, `latencyMs: number`. أي حقل اختياري مسموح بغيابه، وأي حقل إضافي لا يُعدّ كسراً للعقد.
- **SC-002**: التبديل بين المزودين يتم بتغيير متغير بيئة واحد فقط وإعادة تشغيل السيرفر — بدون تعديل كود.
- **SC-003**: عند فشل المزود الأساسي بخطأ مؤقت، ينتقل النظام للمزود البديل خلال **نفس استدعاء دالة `invokeWithFallback` الواحد** — أي داخل نفس حلقة المعالجة التي تشمل الـ primary وكل محاولات الـ retry الخاصة به، ثم الـ fallback وكل محاولات الـ retry الخاصة به. "نفس دورة الـ retry" تعني: لا طلب HTTP جديد من العميل، لا رد خطأ وسيط يصل للـ frontend، والانتقال يحدث تلقائياً قبل أن تُعيد الدالة أي قيمة. حد الجلسة الواحدة: كل الـ retry cycles لكلا المزودين تنتهي قبل انتهاء 180,000 ms.
- **SC-004**: الـ health endpoint يعرض المزود والنموذج النشط بشكل صحيح لكل المزودين المدعومين.
- **SC-005**: إزالة الاعتماد المباشر على `@anthropic-ai/sdk` و `axios` من ملفي المراجعة مع الحفاظ على كل السلوك الحالي.
- **SC-006**: لا تغيير في الـ API contract مع الـ frontend — `src/final-review/payload-builder.ts` والمكونات الأمامية لا تحتاج أي تعديل.
- **SC-007**: كل الاختبارات الحالية (unit + integration) تمر بنجاح بعد التحويل.
- **SC-008**: كل طلب مراجعة يُنتج سطر لوج يحتوي على الحقول الثمانية المحددة في Log Record Schema.
- **SC-009**: لا يوجد أي ملف في المشروع يستورد `@anthropic-ai/sdk` مباشرة بعد إتمام التنفيذ — يمكن التحقق بـ `grep -r "@anthropic-ai/sdk" server/ src/ tests/` ويجب أن يكون الناتج فارغاً.
- **SC-010**: كل الملفات المدرجة في قسم "نطاق التنفيذ الشامل" أدناه تم تحديثها أو مراجعتها — لا يوجد ملف متأثر لم يُلمس.
- **SC-011**: كل استخدام للصيغة بدون prefix (توافق خلفي — `implicitProvider: true`) يجب أن ينتج سطر لوج بمستوى `warn` يوضح: القيمة الأصلية، النتيجة المُستنتجة (`anthropic:…`)، وتوصية بإضافة الـ prefix صراحةً. هذا التحذير يظهر مرة واحدة فقط عند بدء التشغيل لكل قناة.
- **SC-012**: تشغيل `pnpm ls @langchain/core @langchain/anthropic @langchain/openai @langchain/google-genai` يُظهر الإصدارات المثبتة مطابقة لجدول Dependencies بدون أي نطاقات مفتوحة في `package.json`.
- **SC-013**: اختبار integration واحد على الأقل يتحقق بـ `expect(logEntry).toMatchObject({...})` من أن حقول Log Record Schema الثمانية موجودة بأنواعها الصحيحة.
- **SC-014**: لا يُضاف أي من حقول اللوج إلى `response body` الـ HTTP — هي حقول لوج فقط ولا تُكشف للـ frontend.
- **SC-015**: اختبار integration يُثبت أن استدعاء متزامن لـ `agent-review` و `final-review` بمزودين مختلفين (باستخدام mocks) يُنتج استجابتين مستقلتين صحيحتين بدون خلط بيانات.
- **SC-016**: تشغيل `pnpm test:integration` في بيئة CI بدون أي متغيرات API keys مُعيّنة يجب أن ينجح بالكامل — أي لا اختبار يحتاج مفتاحاً حقيقياً لينجح.

## Dependencies

### LangChain Package Versions

الحزم التالية مطلوبة بالحد الأدنى المحدد، ويجب تثبيت الإصدار الدقيق (exact pinning) في `package.json` — لا يُقبل استخدام `^` أو `~` لضمان استقرار السلوك عبر البيئات:

| Package                   | Minimum Version | Pinning Strategy |
| ------------------------- | --------------- | ---------------- |
| `@langchain/core`         | `1.1.31`        | exact            |
| `@langchain/anthropic`    | `1.3.22`        | exact            |
| `@langchain/openai`       | `1.2.12`        | exact            |
| `@langchain/google-genai` | `2.1.24`        | exact            |

- **DEP-001**: النظام يجب أن يعتمد على حزم LangChain بإصدارات محددة (exact versions) لا نطاقات، بحيث يكون `pnpm-lock.yaml` هو المصدر الوحيد للحقيقة في بيئة الإنتاج.

## Assumptions

- **ASM-001**: يُفترض أن حزم LangChain تتعامل مع HTTP transport داخلياً — بما في ذلك connection pooling وTLS وredirect handling — بما يكفي لاستبدال `axios` في طبقة المراجعة. هذا الافتراض غير مثبت بمواصفة رسمية من LangChain ويجب التحقق منه تجريبياً خلال التنفيذ.
- **ASM-002**: يُفترض أن LangChain لا يضيف proxy تلقائي ولا يعيد توجيه طلبات API عبر خوادم وسيطة خارجية — أي الاتصال يكون مباشراً بنقطة نهاية المزود المحدد فقط.
- **ASM-003**: إذا ثبت أثناء التنفيذ أن LangChain لا يوفر خاصية مطلوبة من `axios` (مثل proxy configurable أو timeout per-request)، يجب توثيق القيد وإضافة متطلب تعويضي — ولا يُقبل تجاهله بصمت.

## Non-Functional Requirements

### Latency

- **NFR-001**: الحمل الزمني الإضافي الناتج عن طبقة LangChain (مقارنةً بالاستدعاء المباشر لـ Anthropic SDK) يجب ألا يتجاوز **50ms** لكل طلب مراجعة، مقاساً في بيئة محلية على نفس الجهاز ونفس الشبكة.
- **NFR-002**: الحد الأقصى المقبول لزمن الاستجابة الكلي (end-to-end) لطلب مراجعة عادي (لا timeout، لا fallback) هو **30 ثانية** — وهو نفس الحد المستخدم حالياً. أي تراجع عن هذا الحد يُعدّ regression.

### Security

- **NFR-003**: مفاتيح API يجب ألا تظهر في أي مخرجات logging — لا في pino ولا في أي طبقة LangChain داخلية. إذا كتبت LangChain أي telemetry أو debug logging يتضمن request headers أو parameters، يجب تعطيل هذا السلوك صراحةً في التكوين.
- **NFR-004**: يجب التحقق من أن حزم LangChain المستخدمة لا ترسل بيانات telemetry إلى خوادم خارجية بشكل افتراضي. إذا وُجد هذا السلوك، يجب تعطيله عبر خيار تكوين رسمي.
- **NFR-005**: متغيرات البيئة الحاملة لمفاتيح API لا تُمرر كـ arguments في process أو query strings أو log messages في أي مسار تنفيذي — تُقرأ مرة واحدة عند startup وتُخزن في memory فقط.

### Concurrency

- **NFR-006**: النظام يجب أن يتعامل بشكل صحيح مع طلبات متزامنة لقناتين مختلفتين في نفس اللحظة — مثلاً طلب `agent-review` عبر Anthropic وطلب `final-review` عبر Gemini — بدون تداخل في الحالة أو تسرب بين الـ config لكل قناة.
- **NFR-007**: لا يُوجد حد أقصى افتراضي لعدد الطلبات المتزامنة المفروض من طبقة LangChain — إدارة التزامن تبقى مسؤولية Express وNode.js event loop كما كانت قبل الهجرة.

### Rollback

- **NFR-008**: إذا تبيّن أن حزمة LangChain معينة تسبب regression بعد النشر، يجب أن يكون الرجوع للإصدار السابق ممكناً بتحديث `package.json` و `pnpm-lock.yaml` وحدهما — بدون أي تعديل في كود التطبيق (بفضل التثبيت الدقيق المذكور في DEP-001).
- **NFR-009**: في حالة regression كامل يجعل الهجرة غير قابلة للاستخدام، يجب الحفاظ على إمكانية العودة لـ feature branch revert — بدون تأثير على بقية المشروع. هذا يستلزم أن الـ feature branch يُدمج كـ single squash commit أو سلسلة commits منطقية قابلة للـ revert.

## Test Strategy

### Multi-Provider CI Without Live API Keys

- **TST-001**: كل اختبارات unit وintegration الخاصة بطبقة المراجعة يجب أن تعمل بدون مفاتيح API حقيقية — باستخدام mocks لحزم LangChain.
- **TST-002**: الـ mocks يجب أن تحاكي سلوك LangChain `invoke()` — أي ترجع `AIMessage` أو ترمي `Error` بنفس بنية الأخطاء التي ترميها الحزمة الحقيقية. لا يُقبل mock يرمي خطأً بصيغة مختلفة عن الواقع.
- **TST-003**: متغيرات البيئة `AGENT_REVIEW_MOCK_MODE` و `FINAL_REVIEW_MOCK_MODE` (المعرّفة في FR-013) يجب أن تغطي كل المزودين الأربعة — أي تفعيل mock mode يتجاوز طبقة LangChain بالكامل بغض النظر عن المزود المحدد.

## نطاق التنفيذ الشامل (End-to-End Implementation Scope)

> **FR-015**: التنفيذ يغطي كل ملف متأثر من أوله لآخره. لا يُقبل تنفيذ جزئي.

### الطبقة 1: ملفات السيرفر الأساسية (تعديل مباشر)

| #   | الملف                             | نوع التعديل     | الوصف                                                                   |
| --- | --------------------------------- | --------------- | ----------------------------------------------------------------------- |
| 1   | `server/agent-review.mjs`         | **استبدال**     | إزالة import لـ `@anthropic-ai/sdk`، استبدال بـ LangChain model factory |
| 2   | `server/final-review.mjs`         | **استبدال**     | نفس التحويل + إزالة REST fallback عبر axios                             |
| 3   | `server/provider-api-runtime.mjs` | **استبدال/حذف** | تحويل لـ provider-agnostic runtime أو حذف كامل لصالح LangChain config   |

### الطبقة 2: Controllers و Routes (تعديل)

| #   | الملف                                            | نوع التعديل | الوصف                                                |
| --- | ------------------------------------------------ | ----------- | ---------------------------------------------------- |
| 4   | `server/controllers/agent-review-controller.mjs` | **تعديل**   | تحديث imports وأسماء الدوال المصدّرة                 |
| 5   | `server/controllers/final-review-controller.mjs` | **تعديل**   | تحديث imports وأسماء الدوال المصدّرة                 |
| 6   | `server/routes/index.mjs`                        | **تعديل**   | تحديث health endpoint لعرض معلومات provider-agnostic |

### الطبقة 3: ملفات جديدة (إضافة)

| #   | الملف                                 | نوع التعديل | الوصف                                                            |
| --- | ------------------------------------- | ----------- | ---------------------------------------------------------------- |
| 7   | `server/langchain-model-factory.mjs`  | **إنشاء**   | Factory function لإنشاء LangChain model من صيغة `provider:model` |
| 8   | `server/langchain-fallback-chain.mjs` | **إنشاء**   | منطق الـ fallback chain بين المزودين                             |
| 9   | `server/provider-config.mjs`          | **إنشاء**   | تحليل متغيرات البيئة وتكوين المزودين + validation                |

### الطبقة 4: أنواع TypeScript (تعديل/إضافة)

| #   | الملف                       | نوع التعديل | الوصف                                            |
| --- | --------------------------- | ----------- | ------------------------------------------------ |
| 10  | `src/types/agent-review.ts` | **مراجعة**  | التأكد من عدم وجود أنواع مرتبطة بـ Anthropic SDK |
| 11  | `src/types/final-review.ts` | **مراجعة**  | نفس المراجعة                                     |

### الطبقة 5: ملفات الفرونت إند (مراجعة — بدون تعديل متوقع)

| #   | الملف                                                  | نوع التعديل | الوصف                                        |
| --- | ------------------------------------------------------ | ----------- | -------------------------------------------- |
| 12  | `src/extensions/Arabic-Screenplay-Classifier-Agent.ts` | **مراجعة**  | إزالة أي إشارة مباشرة لـ Anthropic model IDs |
| 13  | `src/extensions/paste-classifier-config.ts`            | **مراجعة**  | التأكد من عدم وجود Anthropic-specific logic  |
| 14  | `src/extensions/paste-classifier.ts`                   | **مراجعة**  | لا تعديل متوقع (يتعامل مع endpoints فقط)     |
| 15  | `src/final-review/payload-builder.ts`                  | **مراجعة**  | لا تعديل متوقع (provider-agnostic بالفعل)    |
| 16  | `src/pipeline/command-engine.ts`                       | **مراجعة**  | لا تعديل متوقع                               |
| 17  | `src/pipeline/ingestion-orchestrator.ts`               | **مراجعة**  | لا تعديل متوقع                               |

### الطبقة 6: الاختبارات (تعديل مباشر)

| #   | الملف                                                       | نوع التعديل | الوصف                                      |
| --- | ----------------------------------------------------------- | ----------- | ------------------------------------------ |
| 18  | `tests/unit/server/agent-review.contract.test.ts`           | **تعديل**   | تحديث mocks لـ LangChain بدل Anthropic SDK |
| 19  | `tests/unit/server/final-review-command-parser.test.ts`     | **تعديل**   | تحديث mocks وتوقعات الاستجابة              |
| 20  | `tests/unit/final-review-validation.test.ts`                | **مراجعة**  | التأكد من التوافق                          |
| 21  | `tests/unit/final-review-payload-builder.test.ts`           | **مراجعة**  | لا تعديل متوقع                             |
| 22  | `tests/unit/extensions/paste-classifier.resilience.test.ts` | **مراجعة**  | التأكد من التوافق                          |
| 23  | `tests/integration/final-review-pipeline.test.ts`           | **تعديل**   | تحديث للعمل مع LangChain mocks             |

### الطبقة 7: التكوين والبيئة (تعديل)

| #   | الملف               | نوع التعديل | الوصف                                                                                                                                      |
| --- | ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 24  | `.env.example`      | **تعديل**   | إضافة متغيرات `AGENT_REVIEW_MODEL`، `OPENAI_API_KEY`، `DEEPSEEK_*`                                                                         |
| 25  | `.env.test.example` | **تعديل**   | تحديث للتوافق                                                                                                                              |
| 26  | `package.json`      | **تعديل**   | إضافة `@langchain/core`، `@langchain/anthropic`، `@langchain/openai`، `@langchain/google-genai`، إزالة `@anthropic-ai/sdk` من dependencies |

### الطبقة 8: التوثيق (تحديث)

| #   | الملف                             | نوع التعديل | الوصف                                      |
| --- | --------------------------------- | ----------- | ------------------------------------------ |
| 27  | `CLAUDE.md`                       | **تعديل**   | تحديث جدول الـ endpoints وقسم AI providers |
| 28  | `.specify/memory/constitution.md` | **تعديل**   | تحديث Technical Constraints وAI Providers  |

### ملخص الأرقام

| الفئة               | عدد الملفات | نوع التعديل   |
| ------------------- | ----------- | ------------- |
| سيرفر (تعديل مباشر) | 6           | استبدال/تعديل |
| ملفات جديدة         | 3           | إنشاء         |
| أنواع TypeScript    | 2           | مراجعة        |
| فرونت إند           | 6           | مراجعة        |
| اختبارات            | 6           | تعديل/مراجعة  |
| تكوين وبيئة         | 3           | تعديل         |
| توثيق               | 2           | تعديل         |
| **المجموع**         | **28 ملف**  | —             |

### ترتيب التنفيذ المطلوب

```
الطبقة 7 (تكوين) → الطبقة 3 (ملفات جديدة) → الطبقة 1 (سيرفر)
→ الطبقة 2 (controllers) → الطبقة 4 (أنواع) → الطبقة 5 (فرونت)
→ الطبقة 6 (اختبارات) → الطبقة 8 (توثيق)
```

> **معيار الاكتمال**: `grep -r "@anthropic-ai/sdk" server/ src/ tests/` يُرجع نتيجة فارغة، وكل الاختبارات تمر بنجاح (`pnpm validate`).
