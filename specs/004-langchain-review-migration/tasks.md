# Tasks: LangChain Review Provider Migration

**Input**: `/specs/004-langchain-review-migration/`
**Rebased On**: المواصفة بعد إضافة `FR-015` و `SC-009` و `SC-010` + 25 متطلب موسّع
**Rule**: كل ملف في النطاق الشامل يجب أن يكون `MODIFIED` أو `REVIEWED`
**Organization**: مهام مُنظّمة حسب User Story لتمكين التنفيذ والاختبار المستقل لكل قصة

## Format: `[ID] [P?] [Story] Description`

- **[P]**: يمكن تشغيله بالتوازي (ملفات مختلفة، لا اعتماديات)
- **[Story]**: أي قصة مستخدم ينتمي إليها (US1–US5)
- المسارات المذكورة نسبية لجذر المشروع

---

## Phase 1: Setup (Configuration & Dependencies)

**Purpose**: تهيئة البيئة والاعتماديات المطلوبة للترحيل

- [x] T001 تحديث `package.json` لإضافة اعتماديات LangChain بإصدارات دقيقة (exact pinning): `@langchain/core` (1.1.31), `@langchain/anthropic` (1.3.22), `@langchain/openai` (1.2.12), `@langchain/google-genai` (2.1.24) [DEP-001, SC-012]
- [x] T002 [P] تحديث `.env.example` بمتغيرات `AGENT_REVIEW_MODEL`, `AGENT_REVIEW_FALLBACK_MODEL`, `FINAL_REVIEW_MODEL`, `FINAL_REVIEW_FALLBACK_MODEL`, `AGENT_REVIEW_MOCK_MODE`, `FINAL_REVIEW_MOCK_MODE` ومتغيرات base URL لكل مزود [FR-002, FR-013]
- [x] T003 [P] تحديث `.env.test.example` لتغطية مزودات الاختبار والـ fallback مع mock mode [FR-013, TST-001]

---

## Phase 2: Foundational (Shared Provider Layer)

**Purpose**: طبقة المزودات المشتركة التي تعتمد عليها كل قصص المستخدمين

**CRITICAL**: لا يمكن بدء أي User Story قبل إتمام هذه المرحلة

- [x] T004 إنشاء `server/provider-config.mjs` لتحليل صيغة `provider:model` والتحقق من مفاتيح المزودات مع دعم التوافق الخلفي (implicit provider) [FR-001, FR-001-A, FR-003, FR-003-A, FR-016]
- [x] T005 [P] إنشاء `server/langchain-model-factory.mjs` لبناء نماذج LangChain لأربعة مزودين: `anthropic`, `openai`, `google-genai`, `deepseek` مع دعم base URL per-provider [FR-002, ASM-001]
- [x] T006 [P] إنشاء `server/langchain-fallback-chain.mjs` لإدارة retry (3 محاولات, backoff أسي 3000ms×2) وfallback وتصنيف الأخطاء المؤقتة/الدائمة [FR-004, FR-004-A, FR-006, FR-006-A, FR-006-B, FR-006-C, FR-011, SC-003]
- [x] T007 تحديث `server/provider-api-runtime.mjs` إلى snapshot provider-agnostic لقناتي المراجعة مع عزل كامل بين القنوات [FR-010, FR-010-A]

**Checkpoint**: طبقة المزودات المشتركة جاهزة — يمكن الآن بدء User Stories

---

## Phase 3: User Story 1 — تبديل مزود AI للمراجعة (Priority: P1) MVP

**Goal**: فك الارتباط بـ Anthropic والسماح بالتبديل بين 4 مزودين عبر متغير بيئة واحد

**Independent Test**: تشغيل السيرفر مع `AGENT_REVIEW_MODEL=openai:gpt-4.1` وإرسال طلب مراجعة والتحقق من استجابة صالحة بنفس صيغة JSON

### Implementation for User Story 1

- [x] T008 [US1] ترحيل `server/agent-review.mjs` من الاستدعاء المباشر لـ `@anthropic-ai/sdk` إلى طبقة LangChain المشتركة مع الحفاظ على system prompt وuser prompt وparseReviewCommands بدون تغيير [FR-009, FR-009-A, FR-012, SC-005]
- [x] T009 [US1] الإبقاء على التوافق الخلفي عبر exports المساعدة في `server/agent-review.mjs` دون كسر المسارات الحالية [FR-003, FR-003-A]
- [x] T010 [US1] تحديث `server/controllers/agent-review-controller.mjs` لاستخدام entrypoint المحايد للمزود [FR-005, FR-005-A, FR-005-B]
- [x] T011 [P] [US1] مراجعة `src/types/agent-review.ts` والتأكد من خلوه من أنواع مرتبطة مباشرة بـ Anthropic SDK [FR-021, SC-001-A]
- [x] T012 [P] [US1] تعديل `src/extensions/Arabic-Screenplay-Classifier-Agent.ts` لجعل `MODEL_ID` وصفياً ومحايداً بالنسبة للمزود [FR-021]
- [x] T013 [P] [US1] مراجعة `src/extensions/paste-classifier-config.ts` للتأكد من أن الإعدادات الأمامية لا تفترض مزوداً واحداً [FR-021]
- [x] T014 [P] [US1] مراجعة `src/extensions/paste-classifier.ts` للتأكد من بقاء التكامل مع endpoints دون تغيير في العقد [SC-006]
- [x] T015 [US1] تحديث `tests/unit/server/agent-review.contract.test.ts` لتغطية provider switching باستخدام LangChain mocks بدلاً من Anthropic SDK mocks [TST-001, TST-002, SC-007]
- [x] T016 [US1] إضافة سيناريوهات اختبار لـ: قيمة فارغة (US1-SC5)، اسم نموذج فارغ (US1-SC6)، مزود غير مدعوم (US1-SC7)، صحة هيكلية + دلالية (US1-SC8) في `tests/unit/server/agent-review.contract.test.ts` [FR-001-A, FR-023]

**Checkpoint**: US1 مكتمل — التبديل بين المزودين يعمل لقناة agent-review

---

## Phase 4: User Story 2 — آلية الـ Fallback التلقائية (Priority: P2)

**Goal**: استمرارية الخدمة عند فشل المزود الأساسي بالانتقال التلقائي للبديل

**Independent Test**: تعيين مفتاح API غير صالح للمزود الأساسي مع مفتاح صالح للبديل والتحقق من نجاح الاستجابة من البديل

### Implementation for User Story 2

- [x] T017 [US2] تطبيق منطق fallback في `server/langchain-fallback-chain.mjs`: انتقال للبديل عند أخطاء مؤقتة فقط، خطأ فوري للأخطاء الدائمة [FR-004, FR-004-A, FR-006-A, FR-006-B, FR-006-C]
- [x] T018 [US2] تطبيق retry بمعايير: 3 محاولات، backoff أسي 3000ms×2، مهلة 180,000ms لكل محاولة — موحد عبر كل المزودين والقنوات [FR-011, FR-012]
- [x] T019 [US2] تطبيق الإشارات الثلاث عند تفعيل fallback: حقل `fallbackApplied: true` في JSON، تحديث health endpoint، لوج info [FR-020]
- [x] T020 [US2] تطبيق سلوك الفشل المزدوج (primary + fallback): HTTP 200 مع `status: "error"` و`commands: []` وتفاصيل الفشل [FR-022]
- [x] T021 [P] [US2] تحديث `tests/unit/server/agent-review.contract.test.ts` بسيناريوهات fallback: نجاح البديل (US2-SC1)، لا بديل (US2-SC2)، فشل مزدوج (US2-SC3) [SC-003]
- [x] T022 [P] [US2] إضافة اختبار تزامن: `agent-review` و`final-review` بمزودين مختلفين (mocks) بدون خلط بيانات في `tests/integration/final-review-pipeline.test.ts` [SC-015, NFR-006]

**Checkpoint**: US2 مكتمل — الـ fallback يعمل مع تصنيف أخطاء صحيح لكل المزودين

---

## Phase 5: User Story 3 — طبقة المراجعة النهائية (Priority: P2)

**Goal**: نفس قدرات التبديل والـ fallback لطبقة `final-review` بشكل مستقل عن `agent-review`

**Independent Test**: تعيين `FINAL_REVIEW_MODEL=google-genai:gemini-2.5-pro` وإرسال طلب مراجعة نهائية والتحقق من النتيجة

### Implementation for User Story 3

- [x] T023 [US3] ترحيل `server/final-review.mjs` من المسار القديم (Anthropic SDK + axios REST fallback) إلى طبقة LangChain المشتركة [FR-009, FR-009-A, FR-009-B, FR-012, SC-005]
- [x] T024 [US3] مراجعة `server/controllers/final-review-controller.mjs` والتأكد من أنه يستخدم `requestFinalReview` الحالية بدون حاجة لتعديل إضافي [FR-005, FR-005-B]
- [x] T025 [P] [US3] مراجعة `src/types/final-review.ts` والتأكد من بقاء العقد provider-agnostic [SC-001-A]
- [x] T026 [P] [US3] مراجعة `src/final-review/payload-builder.ts` للتأكد من أن الحزمة provider-agnostic [SC-006]
- [x] T027 [P] [US3] مراجعة `src/pipeline/command-engine.ts` للتأكد من أن Command API v2 لم يتغير [FR-009-A]
- [x] T028 [P] [US3] مراجعة `src/pipeline/ingestion-orchestrator.ts` للتأكد من أن مسار الإدخال لا يعتمد على مزود بعينه [FR-021]
- [x] T029 [US3] تحديث `tests/unit/server/final-review-command-parser.test.ts` لتغطية provider-qualified models وruntime switching باستخدام LangChain mocks [TST-001, TST-002]
- [x] T030 [P] [US3] مراجعة `tests/unit/final-review-validation.test.ts` والتأكد من أن التحقق من العقد ما زال صحيحاً [SC-007]
- [x] T031 [P] [US3] مراجعة `tests/unit/final-review-payload-builder.test.ts` والتأكد من أن الـ payload ظل ثابت العقد [SC-006]
- [x] T032 [P] [US3] مراجعة `tests/unit/extensions/paste-classifier.resilience.test.ts` والتأكد من أن سلوك الواجهة لم ينكسر [SC-007]
- [x] T033 [US3] تحديث `tests/integration/final-review-pipeline.test.ts` لإضافة تحقق تكاملي من تبديل مزود `final-review` مع سيناريو الفشل المزدوج (US3-SC3) [FR-022, FR-024]

**Checkpoint**: US3 مكتمل — final-review يعمل بنفس مرونة agent-review مع عزل كامل بين القناتين

---

## Phase 6: User Story 4 — تقرير صحة النظام (Priority: P3)

**Goal**: Health endpoint يعرض معلومات المزود بصيغة provider-agnostic

**Independent Test**: إرسال `GET /health` والتحقق من حقول `reviewProvider`, `reviewModel`, `reviewFallbackStatus`

### Implementation for User Story 4

- [x] T034 [US4] تحديث `server/routes/index.mjs` لعرض معلومات health provider-agnostic بالحقول المحددة في FR-008-A ولقطات runtime للقناتين [FR-008, FR-008-A]
- [x] T035 [US4] تطبيق الحالة الأولية `reviewFallbackStatus: "idle"` (لا `"unknown"` ولا `null`) في `server/provider-api-runtime.mjs` [US4-SC3]

**Checkpoint**: US4 مكتمل — Health endpoint يعكس حالة المزود الحقيقية لكل قناة

---

## Phase 7: User Story 5 — التحقق من مفتاح API (Priority: P3)

**Goal**: تحذير واضح عند بدء التشغيل إذا كان مفتاح API غائباً

**Independent Test**: تعيين `AGENT_REVIEW_MODEL=openai:gpt-5` بدون `OPENAI_API_KEY` وملاحظة التحذير

### Implementation for User Story 5

- [x] T036 [US5] تطبيق التحقق من مفاتيح API عند startup في `server/provider-config.mjs`: degraded mode للأساسي (warn + HTTP 503 per request)، warn-only للبديل [FR-007, FR-007-A]
- [x] T037 [US5] تطبيق معالجة المزود غير المدعوم: warn عند startup + HTTP 503 عند الطلب بدون محاولة اتصال في `server/provider-config.mjs` [FR-023]
- [x] T038 [P] [US5] تطبيق تحذير implicit provider (بدون prefix) مرة واحدة عند بدء التشغيل لكل قناة في `server/provider-config.mjs` [FR-003-A, SC-011]

**Checkpoint**: US5 مكتمل — المطور يحصل على تحذيرات واضحة عند مشاكل التكوين

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: توثيق، أمان، متطلبات غير وظيفية، وتحقق نهائي

### Documentation

- [x] T039 [P] تحديث `CLAUDE.md` لعرض `agent-review` و`final-review` كمراجعة متعددة المزودات مع جدول endpoints محدّث [SC-010]
- [x] T040 [P] تحديث `.specify/memory/constitution.md` لعكس طبقة المراجعة متعددة المزودات ومتطلبات المفاتيح الجديدة [SC-010]
- [x] T041 [P] تحديث `specs/004-langchain-review-migration/quickstart.md` لترتيب التحقق النهائي وفق البوابات الجديدة
- [x] T042 [P] تحديث `specs/004-langchain-review-migration/research.md` ليتوافق مع `@langchain/google-genai` المستخدم فعلياً
- [x] T043 إعادة تهيئة `specs/004-langchain-review-migration/plan.md` بعد توسيع المواصفة وربط الخطة بحالة التنفيذ الحقيقية

### Mock Mode & Test Infrastructure

- [x] T044 [P] تطبيق mock mode per-channel (`AGENT_REVIEW_MOCK_MODE` / `FINAL_REVIEW_MOCK_MODE`) بقيم `success`/`error` في `server/agent-review.mjs` و`server/final-review.mjs` [FR-013, TST-003]
- [x] T045 [P] التحقق من أن كل اختبارات unit وintegration تعمل بدون مفاتيح API حقيقية [TST-001, SC-016]

### Logging & Observability

- [x] T046 تطبيق Log Record Schema بـ 8 حقول (requestId, channel, provider, model, usedFallback, latencyMs, status, errorClass) لكل طلب مراجعة في كلتا القناتين [FR-014, SC-008]
- [x] T047 [P] التحقق من أن حقول اللوج لا تُكشف في response body HTTP [SC-014]

### Security

- [x] T048 [P] التحقق من أن مفاتيح API لا تظهر في أي مخرجات logging [NFR-003, NFR-005]
- [x] T049 [P] التحقق من أن حزم LangChain لا ترسل telemetry خارجي وتعطيله إذا وُجد [NFR-004]

### Non-JSON Response Handling

- [x] T050 تطبيق استخراج JSON من نص نثري عند فشل التحليل المباشر في `server/agent-review.mjs` و`server/final-review.mjs` [FR-024]

---

## Final Verification

### Passed Gates

- [x] T051 فحص `SC-009`: `rg -n "@anthropic-ai/sdk" server src tests` والنتيجة فارغة
- [x] T052 تشغيل `pnpm exec vitest run tests/unit/server/agent-review.contract.test.ts` [SC-007]
- [x] T053 تشغيل `pnpm exec vitest run tests/unit/server/final-review-command-parser.test.ts` [SC-007]
- [x] T054 تشغيل `pnpm exec vitest run tests/integration/final-review-pipeline.test.ts` [SC-007]
- [x] T055 فحص `SC-012`: `pnpm ls @langchain/core @langchain/anthropic @langchain/openai @langchain/google-genai` يُظهر إصدارات دقيقة مطابقة

### Post-Analysis Fixes (from `/speckit.analyze`)

- [x] T057 [CA-02] تصحيح قيم token budget في `server/agent-review.mjs`: `BASE_OUTPUT_TOKENS` 1024→1200, `TOKENS_PER_SUSPICIOUS_LINE` 800→1000 وفق الدستور [Constitution §AI Providers]
- [x] T058 [CA-04] إعادة كتابة `isTemporaryProviderError` في `server/langchain-fallback-chain.mjs` لإضافة تصنيف provider-specific: Gemini `RESOURCE_EXHAUSTED` (مؤقت) و`INVALID_ARGUMENT` (دائم)، DeepSeek `context_length_exceeded` (دائم) [FR-006-A, FR-006-B, FR-006-C]
- [x] T059 [CA-05] إضافة `timeout: timeoutMs` لـ `ChatGoogleGenerativeAI` في `server/langchain-model-factory.mjs` لمنع تعليق استدعاءات Gemini [FR-004-A]
- [x] T060 [CA-07] تطبيق validation في `parseProviderModelSpecifier` بـ `server/provider-config.mjs`: regex `[a-z0-9-]+` للمزود، حد 32 محرف للمزود و128 للنموذج [FR-001-A]
- [x] T061 [CA-08] إضافة `normalizeBaseUrl` في `server/provider-config.mjs` للتحقق من protocol scheme (`http://`/`https://`) ورفض المسافات مع warn log [FR-016]
- [x] T062 [CA-09] إضافة warn log عند استخدام implicit provider (بدون prefix) في `resolveReviewChannelConfig` بـ `server/provider-config.mjs` [SC-011, FR-003-A]
- [x] T063 [CA-06] إضافة JSDoc للدوال المُصدّرة في `server/provider-config.mjs`, `server/langchain-fallback-chain.mjs`, `server/langchain-model-factory.mjs` [Constitution §Principle I]
- [x] T064 [CA-01] تنظيف ~491 سطر dead legacy code من `server/final-review.mjs`: إزالة `callAnthropicApi`, `requestFinalReviewLegacy`, `getAnthropicClient`, `extractTextFromBlocks`, `validateAnthropicApiKey`, `resolveModel`, stubs وثوابت ميتة [SC-009]
- [x] T065 تحديث `tests/unit/server/final-review-command-parser.test.ts`: تبديل `getAnthropicFinalReviewModel` → `getFinalReviewModel` و`getAnthropicFinalReviewRuntime` → `getFinalReviewRuntime` بعد إزالة backward-compat aliases [SC-009]

### Pending External Blockers

- [ ] T056 تشغيل `pnpm validate` — موقوف بسبب أعطال baseline خارجة عن نطاق هذا الترحيل (character-classification, classification-sequence-rules, docx-extractor, karank-bridge, logger)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: لا اعتماديات — يبدأ فوراً
- **Foundational (Phase 2)**: يعتمد على Phase 1 — **يحجب** كل User Stories
- **US1 (Phase 3)**: يعتمد على Phase 2 — MVP، يُنفّذ أولاً
- **US2 (Phase 4)**: يعتمد على Phase 2 — يمكن تنفيذه بالتوازي مع US1
- **US3 (Phase 5)**: يعتمد على Phase 2 — يمكن تنفيذه بالتوازي مع US1/US2
- **US4 (Phase 6)**: يعتمد على Phase 2 + T007 (provider-api-runtime)
- **US5 (Phase 7)**: يعتمد على T004 (provider-config)
- **Polish (Phase 8)**: يعتمد على إتمام كل User Stories المطلوبة

### User Story Dependencies

- **US1 (P1)**: مستقل بعد Phase 2 — لا اعتمادية على قصص أخرى
- **US2 (P2)**: مستقل بعد Phase 2 — يُكمّل US1 بالـ fallback لكنه قابل للاختبار مستقلاً
- **US3 (P2)**: مستقل بعد Phase 2 — يستخدم نفس البنية لكن بقناة منفصلة
- **US4 (P3)**: مستقل — يقرأ runtime info فقط
- **US5 (P3)**: مستقل — يتحقق من التكوين فقط

### Parallel Opportunities

- T002, T003 بالتوازي (Phase 1)
- T005, T006 بالتوازي (Phase 2)
- T011, T012, T013, T014 بالتوازي (US1 — ملفات مختلفة)
- T021, T022 بالتوازي (US2 — ملفات اختبار مختلفة)
- T025–T028, T030–T032 بالتوازي (US3 — مراجعات مستقلة)
- T039–T042 بالتوازي (Documentation — ملفات مختلفة)
- T044–T049 بالتوازي (Cross-cutting — لا اعتماديات متبادلة)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational (CRITICAL)
3. Phase 3: US1 — Provider Switching
4. **STOP**: اختبار مستقل — تبديل المزود يعمل
5. Deploy/demo إذا جاهز

### Incremental Delivery

1. Setup + Foundational → البنية التحتية جاهزة
2. US1 → تبديل المزودين (MVP!)
3. US2 → الـ fallback التلقائي
4. US3 → final-review بنفس المرونة
5. US4 + US5 → مراقبة وتشخيص
6. Polish → توثيق وتحقق نهائي

---

## Scope Audit Result

- [x] كل ملفات النطاق الـ 28 إما عُدلت أو روجعت صراحة [SC-010]
- [x] التنفيذ التزم بترتيب الطبقات الثماني المحدد في المواصفة [FR-015]
- [x] الترحيل لم يترك أي استيراد مباشر من `@anthropic-ai/sdk` داخل `server/` أو `src/` أو `tests/` [SC-009]
- [x] كل mock يحاكي `AIMessage` أو يرمي `Error` بنفس بنية LangChain [TST-002]
- [x] لا اختبار يحتاج مفتاح API حقيقي [TST-001, SC-016]

## Requirement Coverage Matrix

| Requirement | Task IDs |
|-------------|----------|
| FR-001, FR-001-A | T004, T016 |
| FR-002 | T002, T005 |
| FR-003, FR-003-A | T004, T009, T038 |
| FR-004, FR-004-A | T006, T017 |
| FR-005, FR-005-A, FR-005-B | T008, T010, T023, T024 |
| FR-006, FR-006-A, FR-006-B, FR-006-C | T006, T017 |
| FR-007, FR-007-A | T036 |
| FR-008, FR-008-A | T034, T035 |
| FR-009, FR-009-A, FR-009-B | T008, T023 |
| FR-010, FR-010-A | T007, T022 |
| FR-011 | T006, T018 |
| FR-012 | T008, T018, T023 |
| FR-013 | T002, T044 |
| FR-014 | T046 |
| FR-015 | Scope Audit |
| FR-016 | T004 |
| FR-020 | T019 |
| FR-021 | T011, T012, T013 |
| FR-022 | T020, T033 |
| FR-023 | T016, T037 |
| FR-024 | T033, T050 |
| DEP-001 | T001, T055 |
| ASM-001, ASM-002, ASM-003 | T005 |
| NFR-001, NFR-002 | T018 |
| NFR-003, NFR-005 | T048 |
| NFR-004 | T049 |
| NFR-006, NFR-007 | T022 |
| NFR-008, NFR-009 | T001 |
| TST-001 | T015, T045 |
| TST-002 | T015, T029 |
| TST-003 | T044 |
| SC-001, SC-001-A | T011, T025 |
| SC-002 | T008 |
| SC-003 | T006, T021 |
| SC-004 | T034 |
| SC-005 | T008, T023 |
| SC-006 | T014, T026, T031 |
| SC-007 | T015, T029, T030, T032, T052–T054 |
| SC-008 | T046 |
| SC-009 | T051 |
| SC-010 | T039, T040, Scope Audit |
| SC-011 | T038 |
| SC-012 | T001, T055 |
| SC-013 | T046 |
| SC-014 | T047 |
| SC-015 | T022 |
| SC-016 | T045 |

## Notes

- [P] = ملفات مختلفة، لا اعتماديات متبادلة
- [US*] = ربط المهمة بقصة مستخدم محددة
- كل مهمة مكتملة (✓) إلا T056 المحجوب بأعطال baseline خارجية
- 56 مهمة إجمالية: 55 مكتملة + 1 محجوب
- Commit بعد كل مهمة أو مجموعة منطقية
