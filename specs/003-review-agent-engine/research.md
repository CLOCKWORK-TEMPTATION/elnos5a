# Research: Review Agent Engine (المراجعة النهائية)

**Date**: 2026-03-08
**Status**: Complete (لا توجد عناصر NEEDS CLARIFICATION — كل القرارات محسومة من PLAN.md)
**Last Updated**: 2026-03-08 — إضافة القسم 9 (Locked External Versions)
**Feature Branch**: `003-review-agent-engine`

---

## 1. بنية الحزمة (FinalReviewRequestPayload)

**Decision**: إرسال حزمة JSON واحدة تحتوي جميع الأسطر المشبوهة معاً، مع أدلة غنية لكل سطر: `evidence` (6 أنواع إشارات من محرك الشك)، `trace` (أصوات المرور والإصلاحات والقرار النهائي لكل pass)، `contextLines` (الأسطر المجاورة للسياق الخطي)، و`sourceHints` (مصدر الاستيراد وجودة النص الخام).

**Rationale**: الحزمة الموحدة تُمكّن AI من رؤية العلاقات بين الأسطر المشبوهة — مثل سطر character مُصنّف كـ action يسبق dialogue يتيم. القرار المتسق عبر الأسطر مستحيل عند معالجة كل سطر منفرداً. بنية `FinalReviewEvidencePayload` بـ 6 حقول محددة (`gateBreaks`, `alternativePulls`, `contextContradictions`, `rawCorruptionSignals`, `multiPassConflicts`, `sourceRisks`) تضمن أن AI يعرف على وجه التحديد لماذا يُشكّ في كل سطر. السياق الكامل يُقلل الاستدعاءات المتكررة.

**Alternatives Considered**:

- **إرسال كل سطر منفرداً**: مرفوض. يفقد السياق العلائقي بين الأسطر المتجاورة، يُضاعف تكلفة الاستدعاءات (N طلب بدل طلب واحد)، ويجعل قرارات AI متضاربة لأنه يرى كل سطر بمعزل.
- **إرسال النص الكامل للسيناريو**: مرفوض. مُكلف جداً من حيث tokens (سيناريو 5000 سطر = مئات آلاف الحروف)، ويجبر AI على إعادة تحليل ما حُلّل بالفعل في الطبقات الحتمية السابقة.

---

## 2. توجيه الأسطر (Routing Strategy)

**Decision**: نظام 4 نطاقات متدرجة: `pass` (لا إجراء)، `local-review` (إصلاح حتمي محلي قبل العرض)، `agent-candidate` (مرشح للإرسال لـ AI)، `agent-forced` (إلزامي للإرسال لـ AI). الأسطر ذات إشارة `alternative-pull` بدرجة ≥ 96 تُرقّى تلقائياً من `agent-candidate` إلى `agent-forced`. عدد الأسطر المُرسلة لـ AI لا يتجاوز `AGENT_REVIEW_MAX_RATIO` من الإجمالي.

**Rationale**: النطاقات الأربعة تُعبّر عن درجات اليقين: معظم الأسطر تصنّفها الطبقات الحتمية بثقة عالية (pass). القليل يحتاج إصلاحاً آلياً بسيطاً (local-review). الأقل يحتاج رأياً خارجياً (agent-candidate). والنادر إلزامي لأن عدم حسمه يكسر البنية الدرامية (agent-forced). الترقية التلقائية عند alternative-pull ≥ 96 تمسك الحالات التي يقترح فيها المحرك نوعاً مختلفاً بثقة شبه مؤكدة. `AGENT_REVIEW_MAX_RATIO` يحمي من سيناريوهات النصوص الفوضوية التي تُولّد مئات الاشتباهات.

**Alternatives Considered**:

- **إرسال كل شيء لـ AI بلا تصفية**: مرفوض. مُكلف تكلفة غير مبررة، يُبطئ التجربة (30 ثانية لـ 50 سطراً — ماذا عن 500 سطر؟)، والطبقات الحتمية دقيقة لـ 90%+ من الأسطر.
- **عتبة ثابتة واحدة بدون ترقية**: مرفوض. يُهمل حالات alternative-pull العالية التي تُشير إلى خطأ تصنيف واضح يستحق المراجعة الإلزامية. الترقية التلقائية تُقلل التدخل اليدوي في تضبيط العتبات.

---

## 3. صيغة الاستجابة (Command API v2)

**Decision**: AI يُرجع أوامر من نوعين فقط: `relabel` (إعادة تصنيف سطر إلى نوع مختلف) و`split` (تقسيم سطر مدمج إلى سطرين). كل أمر يحتوي `itemId` (معرف السطر في الطلب الأصلي)، `confidence` (0–1)، و`reason` (سبب القرار بالعربية). الاستجابة بصيغة JSON صارمة.

**Rationale**: نوعا الأوامر يغطيان الحالتين الأكثر شيوعاً للخطأ في نصوص السيناريو العربي: التصنيف الخاطئ (relabel) والأسطر المدمجة (split). التوافق مع النظام القائم (`agent-review`) يحفظ استثمار الكود الحالي في `normalizeCommandsAgainstRequest` و`applyRemoteAgentReviewV2`. صيغة JSON محددة البنية تُمكّن من تحليل آلي موثوق وتُقلل الأخطاء.

**Alternatives Considered**:

- **صيغة نصية حرة (free-form text)**: مرفوضة. صعبة التحليل الآلي، هشّة أمام تغييرات صياغة AI، تستلزم regex معقداً أو LLM تحليل ثانٍ، وعُرضة للأخطاء الصامتة.
- **إضافة عمليات `merge` أو `delete`**: مرفوضة (YAGNI). لا سيناريو موثق يحتاجها حالياً، وإضافتها تُعقّد المخطط ومنطق التطبيق بدون فائدة فورية.

---

## 4. المتانة (Resilience Strategy)

**Decision**: ثلاث طبقات متدرجة من المتانة: (1) exponential backoff بـ 3 محاولات (تأخيرات 3s, 6s, 12s) عند أخطاء overload (429/529/503)، (2) fallback تلقائي لنموذج Claude بديل عند فشل النموذج الأساسي، (3) REST fallback عبر axios عند فشل Anthropic SDK. إضافة إلى ذلك: mock mode كامل للاختبارات (`FINAL_REVIEW_MOCK_MODE=success|error`).

**Rationale**: Anthropic API يعاني overload خاصةً على Claude Sonnet في أوقات الذروة. الـ backoff المتصاعد يُعطي الخادم وقتاً للتعافي بدون إغراقه بطلبات متتالية. الـ fallback للنموذج البديل يحمي من تعطل نموذج بعينه. REST fallback يتجاوز مشاكل SDK (مثل تحديثات المكتبة التي تُعطل واجهة Streaming). mock mode أساسي للاختبارات في CI بدون مفاتيح API حقيقية (SC-005).

**Alternatives Considered**:

- **Circuit-breaker كامل**: مرفوض لهذه الطبقة. Circuit-breaker مُطبَّق بالفعل في `RemoteAIResolverPolicy` ضمن suspicion-engine (الطبقة 5). إضافته هنا تكرار غير مبرر لمكوّن موجود في المرحلة السابقة في السلسلة.
- **بدون retry (فشل فوري)**: مرفوض. تجربة مستخدم سيئة لأن المستخدم يرى فشل المراجعة النهائية في كل overload عابر، وهذه الحالات شائعة مع Anthropic API.

---

## 5. التحقق على الخادم (Server Validation)

**Decision**: تحقق يدوي صارم من كل حقل في `FinalReviewRequestPayload` مع رسائل خطأ وصفية بالإنجليزية تُحدد الحقل المخالف. تطبيع النصوص عبر `trim()` وقطع النصوص الطويلة (`slice`). رفض الطلبات غير الصالحة بـ HTTP 400 مع رسالة واضحة.

**Rationale**: الحزمة تأتي من frontend غير موثوق — قد يكون المتصفح أو اتصاله مُعرَّضاً لتلاعب. التحقق الصارم يحمي من: injection في system prompt عبر نصوص خبيثة، تحميل مفرط عبر قيم خارج النطاق (مثل `suspicionScore: 150` بدل 0–100)، واستدعاء Claude API بمدخلات مشوّهة تُسبب استجابات غير متوقعة. رسائل الخطأ الوصفية (SC-007) تُسهّل التشخيص.

**Alternatives Considered**:

- **Zod validation**: مرفوض لهذه الطبقة. Zod موجود بالفعل في الكود لغرض محدد (حدود النظام الخارجية وفق قرار research الميزة 002). إضافته للتحقق من طلبات HTTP تبعية إضافية غير مبررة (YAGNI) خاصةً أن منطق التحقق هنا بسيط ومحدود.
- **بدون تحقق (pass-through)**: مرفوض. خطر أمني مباشر. نص خبيث في `text` قد يُلاعب system prompt ويُحوّل توجيهات AI. بيانات فاسدة تُسبب أخطاء غامضة في Claude API تصعب تشخيصها.

---

## 6. System Prompt

**Decision**: system prompt عربي ثابت (static) يحتوي: (أ) قواعد schema للعناصر التسعة المسموحة فقط، (ب) توجيهات المراجعة الخاصة بالسيناريو العربي (اليمين لليسار، تقاليد السيناريو العربي)، (ج) صيغة الخرج JSON المطلوبة بدقة. القواعد تمنع AI من اختراع أنواع جديدة أو تجاهل القيود.

**Rationale**: العربية هي لغة المحتوى — تقديم القواعد بالعربية يُقلل الغموض اللغوي لنموذج يُعالج نصاً عربياً بامتياز. الـ prompt الثابت يضمن سلوكاً متوقعاً وقابلاً للاختبار: يمكن كتابة اختبارات تتحقق من أن الـ prompt يحتوي قواعد بعينها. التغيير في المتطلبات يُترجَم إلى تغيير في `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS` الموثّقة.

**Alternatives Considered**:

- **Prompt ديناميكي (يتغير بحسب سياق كل طلب)**: مرفوض. تعقيد غير مبرر: لا يوجد سيناريو واضح يستدعي prompt مختلفاً بحسب الطلب. يُصعّب الاختبار والتوقع ويزيد خطر نسيان تضمين قاعدة ضرورية في بعض المسارات.
- **Prompt إنجليزي**: مرفوض. دقة أقل للمحتوى العربي: النموذج يُفسّر مصطلحات السيناريو (مثل "وصف المشهد" vs "action") بدقة أعلى حين تُقدَّم بالعربية، وهذا ما تؤكده تجارب agent-review القائم.

---

## 7. تطبيع أنواع Scene Header

**Decision**: قرارات AI التي تُرجع `scene_header_1` أو `scene_header_2` تُطبَّع تلقائياً إلى `scene_header_top_line` عبر دالة `normalizeSceneHeaderDecisionType` قبل تطبيق الأوامر على المحرر.

**Rationale**: نموذج AI مُدرَّب على أنواع عامة قد يُرجع التمييز التفصيلي بين scene_header_1 وscene_header_2. لكن النظام الحالي يستخدم `scene_header_top_line` كنوع موحد للتطبيق في ProseMirror. التطبيع يحمي من كسر extension node غير موجود في Tiptap. يُحافظ على توافق Command API v2 مع النظام القائم (FR-014).

**Alternatives Considered**:

- **منع AI من إرجاع scene_header_1/2 أصلاً (عبر system prompt)**: مرفوض. صعب ضمانه — LLMs لا تتبع تعليمات الحظر بشكل مطلق 100% من الوقت. التطبيع على الخادم حماية قطعية بغض النظر عما يُرجعه النموذج.
- **دعم scene_header_1/2 كأنواع منفصلة في المحرر**: مرفوض لهذه الميزة. قرار معماري أكبر يتجاوز نطاق Review Agent Engine ويحتاج ميزة مستقلة.

---

## 8. ميزانية Tokens

**Decision**: ميزانية `max_tokens` ديناميكية محسوبة بالمعادلة:

```
max_tokens = min(BASE_OUTPUT_TOKENS + TOKENS_PER_SUSPICIOUS_LINE × count, MAX_TOKENS_CEILING)
```

حيث `BASE_OUTPUT_TOKENS = 1200`، `TOKENS_PER_SUSPICIOUS_LINE = 1000`، `MAX_TOKENS_CEILING = 64000`.
عند قطع الاستجابة بدون أوامر صالحة، تُضاعَف الميزانية وتُعاد المحاولة.

**Rationale**: كل سطر مشبوه يحتاج أمراً JSON (itemId + command + confidence) مع سبب عربي تفصيلي — هذا يستهلك ~1000 token بالمتوسط. القاعدة الثابتة 1200 تغطي overhead الاستجابة (رأس JSON، الأسطر الثابتة). السقف 64000 حد Claude الأمان. الميزانية الديناميكية تمنع القطع المبكر مع وجود أسطر كثيرة، وتحمي من إهدار token budget ضخم مع أسطر قليلة.

**Alternatives Considered**:

- **ميزانية ثابتة (مثلاً 4096 دائماً)**: مرفوضة. ستُقطع الاستجابة مع أكثر من 3–4 أسطر مشبوهة، مما يُفقد أوامر الأسطر الأخيرة ويُعيد `status: "partial"` في حالات طبيعية.
- **بدون حد أقصى (max_tokens = غير محدد)**: مرفوض. تكلفة مالية غير محسوبة. Anthropic تفرض سقفات على مستوى الحساب، ومخالفتها تُسبب أخطاء 400.

---

## 9. Locked External Versions and Contracts

> **آخر تحقق**: 2026-03-08 — مبني على بحث ويب مباشر في وثائق Anthropic الرسمية و npm.

### 9.1 Anthropic Models

| الدور        | الاسم التسويقي    | Model ID (API)              | Max Output Tokens | Extended Thinking | السعر (لكل MTok) |
| ------------ | ----------------- | --------------------------- | ----------------- | ----------------- | ---------------- |
| **Primary**  | Claude Sonnet 4.6 | `claude-sonnet-4-6`         | 64K               | نعم + Adaptive    | $3 in / $15 out  |
| **Fallback** | Claude Haiku 4.5  | `claude-haiku-4-5-20251001` | 64K               | نعم               | $1 in / $5 out   |

**سبب اختيار Primary — `claude-sonnet-4-6`**:

- التوازن المثالي بين الذكاء والسرعة والتكلفة لمهمة text classification
- يدعم Adaptive Thinking مما يُتيح تفكيراً أعمق عند الحالات الصعبة
- training data cutoff يناير 2026 — الأحدث بين النماذج الحالية
- تكلفته نصف تكلفة Opus مع أداء كافٍ لتصنيف أسطر السيناريو

**سبب اختيار Fallback — `claude-haiku-4-5-20251001`**:

- الأرخص والأسرع مع "near-frontier intelligence"
- كافٍ لأسطر تصنيفها واضح (مثل `scene_header` أو `basmala`)
- يُستخدم عند فشل Sonnet أو timeout أو ارتفاع الضغط على API

**ملاحظة على النظام الحالي**: المشروع يستخدم حالياً `claude-haiku-4-5-20251001` كـ primary وfallback معاً في [agent-review.mjs](../../server/agent-review.mjs) (سطر 11-12). الميزة الجديدة ترقّي Primary إلى Sonnet 4.6 وتحتفظ بـ Haiku كـ fallback حقيقي.

**القيم المطلوبة في `.env`**:

```bash
ANTHROPIC_API_KEY=sk-ant-...        # مطلوب
# ANTHROPIC_REVIEW_MODEL=claude-sonnet-4-6        # اختياري — الافتراضي
# AGENT_REVIEW_FALLBACK_MODEL=claude-haiku-4-5-20251001  # اختياري — الافتراضي
```

**Sources**: [Models overview — platform.claude.com](https://platform.claude.com/docs/en/docs/about-claude/models/overview)

---

### 9.2 SDK: @anthropic-ai/sdk

| الخاصية                        | القيمة                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| **الحزمة**                     | `@anthropic-ai/sdk`                                                      |
| **الإصدار المثبت حالياً**      | `^0.78.0` (في package.json)                                              |
| **الحد الأدنى لـ Node.js**     | **Node.js 20 LTS** أو أحدث (non-EOL)                                     |
| **TypeScript**                 | ≥ 4.9 مطلوب                                                              |
| **ES Modules**                 | مدعوم بشكل كامل (dual exports: `dist/index.mjs` + `dist/index.js`)       |
| **دعم المتصفح**                | **معطّل افتراضيًا** — يتطلب `dangerouslyAllowBrowser: true` (لا نستخدمه) |
| **رأس `anthropic-version`**    | يُضاف تلقائياً: `2023-06-01`                                             |
| **إعادة المحاولة التلقائية**   | **نعم — مرتان افتراضياً** مع exponential backoff + jitter                |
| **أكواد HTTP القابلة للإعادة** | Connection errors, 408, 409, 429, ≥500 (تشمل 503, 529)                   |
| **رأس `x-should-retry`**       | يُحترم إذا أرسلته الخوادم                                                |

**نمط الإنشاء المعتمد** (مطابق للمشروع الحالي):

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // الافتراضي — يُقرأ تلقائياً من env
  maxRetries: 0, // نُعطّل retry الداخلي لأننا ندير retry يدوياً
  timeout: 180_000, // 3 دقائق (مطابق لـ DEFAULT_TIMEOUT_MS الحالي)
});
```

**ملاحظة مهمة**: نُعطّل `maxRetries: 0` في SDK لأن طبقة المتانة (القسم 4) تدير retry يدوياً بـ 3 محاولات مع تأخيرات 3s/6s/12s. هذا مطابق للنمط الحالي في [agent-review.mjs](../../server/agent-review.mjs) سطر 530.

**Sources**: [TypeScript SDK — platform.claude.com](https://platform.claude.com/docs/en/api/sdks/typescript), [npm — @anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)

---

### 9.3 REST Fallback Contract

عقد REST المباشر يُستخدم عند فشل SDK (مطابق للـ fallback الموجود في [agent-review.mjs](../../server/agent-review.mjs) سطر 1232).

**Endpoint**:

```
POST https://api.anthropic.com/v1/messages
```

**الرؤوس المطلوبة**:

| Header              | القيمة                 | ملاحظة                                |
| ------------------- | ---------------------- | ------------------------------------- |
| `x-api-key`         | `${ANTHROPIC_API_KEY}` | مفتاح المصادقة — مطلوب                |
| `anthropic-version` | `2023-06-01`           | القيمة الوحيدة الموثقة رسمياً — مطلوب |
| `content-type`      | `application/json`     | مطلوب                                 |

**بنية الطلب** (non-streaming):

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "system": "أنت مراجع سيناريو عربي محترف...",
  "messages": [{ "role": "user", "content": "..." }]
}
```

> **ملاحظة**: `system` حقل مستقل على المستوى الأعلى من body، وليس داخل `messages`.

**بنية الاستجابة**:

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "..." }],
  "model": "claude-sonnet-4-6",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567
  }
}
```

- **النص المُرجع**: `response.content[0].text`
- **قيم `stop_reason`**: `"end_turn"` (طبيعي) | `"max_tokens"` (قُطع) | `"stop_sequence"`

**أكواد HTTP**:

| كود | النوع                   | قابل لإعادة المحاولة | `retry-after`   |
| --- | ----------------------- | -------------------- | --------------- |
| 429 | `rate_limit_error`      | نعم                  | نعم (عدد ثوانٍ) |
| 500 | `api_error`             | نعم                  | لا              |
| 529 | `overloaded_error`      | نعم                  | لا              |
| 400 | `invalid_request_error` | لا                   | —               |
| 401 | `authentication_error`  | لا                   | —               |
| 403 | `permission_error`      | لا                   | —               |
| 413 | `request_too_large`     | لا                   | —               |

**هيكل الخطأ الموحد**:

```json
{
  "type": "error",
  "error": { "type": "rate_limit_error", "message": "..." },
  "request_id": "req_..."
}
```

**كود REST fallback المرجعي** (مطابق لنمط المشروع الحالي عبر axios):

```javascript
const response = await axios.post(
  "https://api.anthropic.com/v1/messages",
  params,
  {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    timeout: DEFAULT_TIMEOUT_MS, // 180,000ms
  }
);
```

**Sources**: [Messages API — platform.claude.com](https://platform.claude.com/docs/en/api/messages), [Errors](https://platform.claude.com/docs/en/api/errors), [Rate Limits](https://platform.claude.com/docs/en/api/rate-limits), [Versioning](https://platform.claude.com/docs/en/api/versioning)

---

### 9.4 Local Integration Points

نقاط الحقن داخل المشروع حيث تُستخدم القيم أعلاه:

| الملف                                            | السطر | ماذا يُعرَّف                                                                         |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------ |
| `server/agent-review.mjs`                        | 4     | `import Anthropic from "@anthropic-ai/sdk"`                                          |
| `server/agent-review.mjs`                        | 11-12 | `DEFAULT_MODEL_ID` + `FALLBACK_MODEL_ID` (حالياً كلاهما `claude-haiku-4-5-20251001`) |
| `server/agent-review.mjs`                        | 13    | `TEMPERATURE = 0.0` (deterministic)                                                  |
| `server/agent-review.mjs`                        | 14    | `DEFAULT_TIMEOUT_MS = 180_000` (3 دقائق)                                             |
| `server/agent-review.mjs`                        | 24-26 | حساب `max_tokens` الديناميكي                                                         |
| `server/agent-review.mjs`                        | 28-31 | retry delays و retryable status codes                                                |
| `server/agent-review.mjs`                        | 530   | `new Anthropic({ apiKey, baseURL, maxRetries: 0, timeout })`                         |
| `server/agent-review.mjs`                        | 557   | `client.messages.create(params)` — استدعاء SDK                                       |
| `server/agent-review.mjs`                        | 1232  | `axios.post(messagesEndpoint, params, { headers })` — REST fallback                  |
| `server/provider-api-runtime.mjs`                | 13    | `apiVersion: '2023-06-01'` — الافتراضي                                               |
| `server/provider-api-runtime.mjs`                | 90    | `messagesEndpoint: 'https://api.anthropic.com/v1/messages'`                          |
| `server/controllers/agent-review-controller.mjs` | 21    | HTTP handler لـ `/api/agent/review`                                                  |
| `.env`                                           | —     | `ANTHROPIC_API_KEY=sk-ant-...`                                                       |

**الميزة الجديدة (`final-review`) ستُنشئ ملفات منفصلة** (`server/final-review.mjs` + `server/controllers/final-review-controller.mjs`) تتبع نفس الأنماط أعلاه، مع الفروقات التالية:

- Primary model: `claude-sonnet-4-6` (بدل `claude-haiku-4-5-20251001`)
- Endpoint جديد: `POST /api/final-review` (بدل `/api/agent/review`)
- Payload مختلف: `FinalReviewRequestPayload` (بدل agent review payload القائم)
