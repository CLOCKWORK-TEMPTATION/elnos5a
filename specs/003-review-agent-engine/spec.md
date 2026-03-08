# Feature Specification: Review Agent Engine (المراجعة النهائية)

**Feature Branch**: `003-review-agent-engine`
**Created**: 2026-03-08
**Status**: Draft
**Input**: PLAN.md — بناء طبقة المراجعة النهائية التي تربط محرك الشك بمراجعة AI عبر `FinalReviewRequestPayload` و `POST /api/final-review`

## User Scenarios & Testing

### User Story 1 — تصنيف أسطر مشبوهة عبر المراجعة النهائية (Priority: P1)

عند استيراد نص سيناريو (لصق أو ملف)، يمر النص عبر طبقات التصنيف
الحتمية أولاً. الأسطر التي يرفعها محرك الشك بنطاق `agent-candidate`
أو `agent-forced` تُجمّع في حزمة `FinalReviewRequestPayload` وتُرسل
إلى `POST /api/final-review`. يعود الخادم بأوامر `relabel` أو `split`
تُطبَّق تلقائيًا على المحرر.

**Why this priority**: هذا هو المسار الأساسي للميزة — بدونه لا توجد
مراجعة نهائية على الإطلاق.

**Independent Test**: لصق نص يحتوي على 50 سطرًا بينها 3 أسطر مشبوهة
(character مُصنّف كـ action). التحقق من أن الأسطر الثلاثة تُرسل
للمراجعة وتعود مُعاد تصنيفها.

**Acceptance Scenarios**:

1. **Given** نص مُصنّف يحتوي أسطرًا بنطاق `agent-forced`,
   **When** يُستدعى `applyRemoteAgentReviewV2`,
   **Then** تُبنى `FinalReviewRequestPayload` وتُرسل إلى `/api/final-review`
   ويُطبّق كل أمر `relabel` على السطر المقابل.

2. **Given** خادم المراجعة يُرجع أمر `split` لسطر مدمج (character + dialogue),
   **When** تُطبّق الاستجابة,
   **Then** يُقسم السطر عند `splitAt` إلى سطرين بالأنواع المحددة.

3. **Given** جميع الأسطر تمر بنطاق `pass` أو `local-review` فقط,
   **When** يُستدعى `applyRemoteAgentReviewV2`,
   **Then** لا يُرسل أي طلب HTTP ويُعاد المصفوف كما هو.

---

### User Story 2 — بناء حزمة الأدلة الغنية (Priority: P2)

كل سطر مشبوه يُرسل مع أدلة مفصّلة من محرك الشك: `evidence`
(6 أنواع إشارات)، `trace` (أصوات المرور والإصلاحات والقرار النهائي)،
`contextLines` (الأسطر المجاورة)، و `sourceHints` (مصدر الاستيراد
وجودة السطر).

**Why this priority**: جودة قرار AI تعتمد مباشرة على غنى الأدلة
المُرسلة. بدون هذه البيانات، لا يملك الـ AI سياقًا كافيًا.

**Independent Test**: إنشاء `SuspicionCase` اصطناعي بإشارات متعددة
(gate-break + context-contradiction)، واستدعاء
`buildFinalReviewSuspiciousLinePayload`، والتحقق من أن الحزمة
تحتوي جميع حقول الأدلة الصحيحة.

**Acceptance Scenarios**:

1. **Given** `SuspicionCase` بإشارات من عائلتين مختلفتين,
   **When** يُستدعى `buildFinalReviewSuspiciousLinePayload`,
   **Then** الحزمة تحتوي `evidence.gateBreaks` و `evidence.contextContradictions`
   مملوءتين، و `distinctSignalFamilies === 2`.

2. **Given** سطر بنوع غير قابل للمراجعة (مثل `basmala`),
   **When** يُستدعى `buildFinalReviewSuspiciousLinePayload`,
   **Then** تُرجع `null` ولا يُضاف السطر للحزمة.

---

### User Story 3 — التحقق والتطبيع على الخادم (Priority: P2)

الخادم يستقبل `FinalReviewRequestPayload` ويُطبّعها ويتحقق من
صلاحية جميع الحقول قبل إرسالها لـ AI. أي حقل غير صالح يُرفض
بخطأ 400 مع رسالة واضحة.

**Why this priority**: الحماية ضد البيانات الفاسدة أو المحرّفة
أساسية لأمان النظام واستقراره.

**Independent Test**: إرسال طلب JSON مع `suspicionScore: 150`
(خارج النطاق) والتحقق من أن الخادم يُرجع 400 مع رسالة
`Invalid suspicionScore`.

**Acceptance Scenarios**:

1. **Given** طلب بـ `packetVersion` فارغ,
   **When** يُرسل إلى `/api/final-review`,
   **Then** يُرجع 400 مع `Missing packetVersion`.

2. **Given** طلب صالح بالكامل,
   **When** يُعالج بواسطة `validateFinalReviewRequestBody`,
   **Then** تُعاد كائنات مُطبّعة مع قيم مقصوصة ومُنظّفة.

3. **Given** `forcedItemIds` تحتوي `itemId` غير موجود في `suspiciousLines`,
   **When** يُتحقق منها,
   **Then** يُرفض الطلب بخطأ `forcedItemIds contains unknown itemId`.

---

### User Story 4 — استدعاء Anthropic API مع المرونة (Priority: P3)

الخادم يُنشئ system prompt عربي متخصص ويُرسله مع حزمة المراجعة
إلى Claude API. يدعم: fallback لنموذج بديل، exponential backoff
عند overload (429/529/503)، زيادة `max_tokens` عند القطع،
و REST fallback عند فشل SDK.

**Why this priority**: المتانة أمام أعطال المُزوّد ضرورية لتجربة
مستخدم موثوقة، لكنها تأتي بعد المسار الأساسي.

**Independent Test**: ضبط `FINAL_REVIEW_MOCK_MODE=success` وإرسال
طلب مراجعة والتحقق من أن الاستجابة تحتوي أوامر mock صحيحة.

**Acceptance Scenarios**:

1. **Given** `FINAL_REVIEW_MOCK_MODE=success`,
   **When** يُستدعى `requestFinalReview`,
   **Then** تُعاد أوامر mock لكل `requiredItemId` بـ `confidence: 0.99`.

2. **Given** API يُرجع 429 (rate limit),
   **When** يُستدعى `requestFinalReview`,
   **Then** يُعاد المحاولة حتى 3 مرات مع تأخير متصاعد (3s, 6s, 12s).

3. **Given** الاستجابة تُقطع بسبب `max_tokens`,
   **When** لا تحتوي أوامر قابلة للتحليل,
   **Then** يُعاد المحاولة بميزانية tokens مضاعفة.

4. **Given** نموذج غير Anthropic (مثل `gpt-4`),
   **When** يُكتشف في `FINAL_REVIEW_MODEL`,
   **Then** يُستخدم النموذج الافتراضي مع تسجيل تحذير.

---

### User Story 5 — ترقية الحالات عالية الخطورة وتحديد السقف (Priority: P3)

الأسطر ذات إشارات `alternative-pull` بدرجة ≥ 96 تُرقّى تلقائيًا
من `agent-candidate` إلى `agent-forced`. العدد الإجمالي للأسطر
المُرسلة لا يتجاوز `AGENT_REVIEW_MAX_RATIO` من إجمالي الأسطر.

**Why this priority**: تحسين دقة التوجيه مهم لكنه تحسين على
المسار الأساسي وليس شرطًا لتشغيله.

**Independent Test**: إنشاء 100 سطر منها 5 بدرجة `alternative-pull ≥ 96`.
التحقق من أنها تُرقّى إلى `agent-forced` وأن العدد المُرسل
لا يتجاوز السقف.

**Acceptance Scenarios**:

1. **Given** `SuspicionCase` بنطاق `agent-candidate` وإشارة
   `alternative-pull` بدرجة 97,
   **When** يُمرّر عبر `promoteHighSeverityMismatches`,
   **Then** يتغير نطاقه إلى `agent-forced`.

2. **Given** 200 سطر مع `AGENT_REVIEW_MAX_RATIO = 0.05`,
   **When** يُستدعى `selectSuspiciousLinesForAgent` بـ 20 حالة مرشحة,
   **Then** يُرسل 10 أسطر كحد أقصى (`ceil(200 × 0.05)`).

---

### Edge Cases

- ماذا يحدث عندما يكون `ANTHROPIC_API_KEY` غير مضبوط؟
  → يُعاد `status: "partial"` مع رسالة خطأ واضحة، بدون إيقاف التطبيق.
- ماذا يحدث عندما يُرجع AI أمرًا بـ `itemId` غير موجود في الطلب الأصلي؟
  → يُتجاهل الأمر عند التطبيع (`normalizeCommandsAgainstRequest`).
- ماذا يحدث عندما يُرجع AI نوع `scene_header_1` في قرار relabel؟
  → يُطبّع إلى `scene_header_top_line` عبر `normalizeSceneHeaderDecisionType`.
- ماذا يحدث عندما تكون الاستجابة نصًا غير JSON؟
  → يُحاول استخراج JSON من أول `{` لآخر `}`، وإلا تُعاد مصفوفة فارغة.
- ماذا يحدث عندما يحتوي الطلب على 0 أسطر مشبوهة؟
  → يُعاد `status: "skipped"` فورًا بدون استدعاء API.
- ماذا يحدث عندما تتجاوز حزمة المراجعة ميزانية الحروف؟
  → تُقطّع الحزمة مع الحفاظ على أسطر `agent-forced` أولاً.
- ماذا يحدث عندما يُرجع AI أوامر لبعض `requiredItemIds` فقط؟
  → يُعاد `status: "partial"` مع قائمة `missingItemIds`.
- ماذا يحدث عندما لا تُحسم جميع `forcedItemIds`؟
  → يُعاد `status: "error"` لأن forced items إلزامية.

## Requirements

### Functional Requirements

- **FR-001**: النظام يجب أن يبني `FinalReviewRequestPayload` من حالات الشك
  (`SuspicionCase[]`) مع جميع حقول الأدلة والتتبع والسياق.
- **FR-002**: النظام يجب أن يُرسل الحزمة إلى `POST /api/final-review` عبر HTTP
  مع timeout ومحاولات إعادة.
- **FR-003**: الخادم يجب أن يتحقق من كل حقل في الطلب ويُرفض الطلبات
  غير الصالحة بخطأ 400 مع رسالة وصفية.
- **FR-004**: الخادم يجب أن يُنشئ system prompt عربي يحتوي قواعد schema
  وتوجيهات المراجعة ويُرسله لـ Claude API.
- **FR-005**: الخادم يجب أن يُحلل استجابة AI إلى أوامر Command API v2
  (`relabel` / `split` فقط).
- **FR-006**: الخادم يجب أن يُطبّع الأوامر ضد الطلب الأصلي (تجاهل
  itemIds غير موجودة، أخذ الأعلى ثقة عند التكرار).
- **FR-007**: النظام يجب أن يُطبّق الأوامر المُعادة على المصفوف
  المُصنّف في المحرر.
- **FR-008**: النظام يجب أن يدعم وضع mock
  (`FINAL_REVIEW_MOCK_MODE=success|error`) للاختبارات بدون API حقيقي.
- **FR-009**: النظام يجب أن يُرقّي الحالات ذات `alternative-pull ≥ 96`
  من `agent-candidate` إلى `agent-forced`.
- **FR-010**: النظام يجب ألا يُرسل أكثر من `AGENT_REVIEW_MAX_RATIO`
  من الأسطر إلى المراجعة النهائية.
- **FR-011**: النظام يجب أن يدعم exponential backoff عند أخطاء overload
  (429/529/503) حتى 3 محاولات.
- **FR-012**: النظام يجب أن يدعم fallback لنموذج بديل عند فشل
  النموذج الأساسي. التسلسل: (1) محاولة `DEFAULT_MODEL_ID` مع retry
  حتى 3 مرات (FR-011)، (2) عند استنفاد المحاولات → تبديل إلى
  `FALLBACK_MODEL_ID` مع محاولة واحدة بدون retry إضافي.
- **FR-013**: النظام يجب أن يزيد ميزانية `max_tokens` عند قطع الاستجابة
  بدون أوامر صالحة. الحساب الديناميكي:
  `min(BASE_OUTPUT_TOKENS + TOKENS_PER_SUSPICIOUS_LINE × count, MAX_TOKENS_CEILING)`
  حيث `BASE_OUTPUT_TOKENS = 1200`, `TOKENS_PER_SUSPICIOUS_LINE = 1000`,
  `MAX_TOKENS_CEILING = 64000`.
- **FR-014**: النظام يجب أن يُطبّع `scene_header_1`/`scene_header_2`
  إلى `scene_header_top_line` في قرارات AI.
- **FR-015**: النظام يجب أن يتحقق من أن `ANTHROPIC_API_KEY` تبدأ بـ
  `sk-ant-` ولا تحتوي مسافات قبل أي استدعاء.
- **FR-016**: كل `itemId` في `requiredItemIds` يجب أن يحصل على أمر واحد
  على الأقل. كل `itemId` في `forcedItemIds` يجب أن يُحسم.
- **FR-017**: النظام يجب أن يُسجل telemetry شامل (بناء الحزمة،
  إحصائيات التوجيه، نتائج المراجعة).

### Key Entities

→ التعريفات التفصيلية لجميع الكيانات في [data-model.md](data-model.md) (أقسام 1–8).

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% من الأسطر ذات نطاق `agent-forced` تُرسل للمراجعة
  النهائية وتحصل على أمر صريح.
- **SC-002**: زمن المراجعة النهائية الكامل (بناء حزمة + HTTP + تطبيق)
  لا يتجاوز 30 ثانية لـ 50 سطرًا مشبوهًا.
- **SC-003**: لا أكثر من `AGENT_REVIEW_MAX_RATIO` من إجمالي الأسطر
  يُرسل للمراجعة في عملية استيراد واحدة.
- **SC-004**: عند فشل API (timeout/overload)، يُعاد المحاولة تلقائيًا
  ويسجّل السبب، بدون إيقاف عمل المحرر.
- **SC-005**: وضع Mock يُمكّن تشغيل اختبارات E2E كاملة بدون مفتاح
  API حقيقي.
- **SC-006**: دقة التصنيف الإجمالية لا تنخفض عن 93.7% بعد دمج
  المراجعة النهائية.
- **SC-007**: جميع طلبات التحقق غير الصالحة تُرفض بخطأ 400 مع
  رسالة تصف الحقل المخالف بالضبط.
