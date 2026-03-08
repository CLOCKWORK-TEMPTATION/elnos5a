# Tasks: Review Agent Engine (المراجعة النهائية)

**Input**: Design documents from `/specs/003-review-agent-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

---

## Phase 1: Setup (البنية التحتية المشتركة)

**Purpose**: إنشاء الملفات والأنواع الأساسية التي تعتمد عليها جميع القصص

- [x] T001 [P] إنشاء ملف الأنواع `src/types/final-review.ts` — تعريف `FinalReviewRequestPayload`, `FinalReviewSuspiciousLinePayload`, `FinalReviewEvidencePayload`, `FinalReviewTraceSummary`, `FinalReviewSchemaHints`, `FinalReviewSourceHintsPayload`, `FinalReviewContextLine` حسب data-model.md (أقسام 1–5). جميع الحقول `readonly`.
- [x] T002 [P] إنشاء ملف أنواع الاستجابة ضمن `src/types/final-review.ts` — تعريف `AgentCommand` (discriminated union: `RelabelCommand | SplitCommand`), `AgentReviewResponsePayload`, `AgentReviewResponseMeta`, `ReviewRoutingStats` حسب data-model.md (أقسام 6–8).
- [x] T003 [P] إضافة ثوابت التكوين في `src/extensions/paste-classifier-config.ts` — إضافة `FINAL_REVIEW_ENDPOINT = '/api/final-review'`, `AGENT_REVIEW_MAX_RATIO`, `FINAL_REVIEW_PROMOTION_THRESHOLD = 96`, `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS`.

---

## Phase 2: Foundational (متطلبات مُعيقة لجميع القصص)

**Purpose**: الملفات الأساسية التي يجب أن تكتمل قبل أي قصة مستخدم

**⚠️ CRITICAL**: لا يمكن البدء بأي قصة مستخدم قبل إكمال هذه المرحلة

- [x] T004 إنشاء ملف الخادم `server/final-review.mjs` — هيكل فارغ يُصدّر الدوال: `requestFinalReview(body)`, `validateFinalReviewRequestBody(body)`, `buildSystemPrompt(schemaHints)`, `parseFinalReviewResponse(text)`, `normalizeCommandsAgainstRequest(commands, request)`. استيراد Anthropic SDK + axios + pino. تعريف الثوابت: `DEFAULT_MODEL_ID = 'claude-sonnet-4-6'`, `FALLBACK_MODEL_ID = 'claude-haiku-4-5-20251001'`, `DEFAULT_TIMEOUT_MS = 180_000`, `TEMPERATURE = 0.0`.
- [x] T005 إنشاء ملف المتحكم `server/controllers/final-review-controller.mjs` — HTTP handler يستقبل `req.body` ويستدعي `requestFinalReview` ويُرجع الاستجابة. معالجة الأخطاء مع status codes صحيحة (400/500).
- [x] T006 تعديل `server/routes/index.mjs` — إضافة route `POST /api/final-review` مع `reviewLimiter` واستدعاء `finalReviewController`.

**Checkpoint**: الهيكل الأساسي جاهز — القصص يمكن أن تبدأ

---

## Phase 3: User Story 1 — تصنيف أسطر مشبوهة عبر المراجعة النهائية (Priority: P1) 🎯 MVP

**Goal**: المسار الكامل من اكتشاف أسطر مشبوهة → إرسال للخادم → تطبيق الأوامر على المحرر

**Independent Test**: لصق نص يحتوي 50 سطرًا بينها 3 أسطر مشبوهة (character مُصنّف كـ action). التحقق من أن الأسطر الثلاثة تُرسل للمراجعة وتعود مُعاد تصنيفها.

### Implementation for User Story 1

- [x] T007 [US1] تنفيذ `requestFinalReview(body)` في `server/final-review.mjs` — المسار الأساسي فقط: استدعاء `validateFinalReviewRequestBody` → فحص mock mode → فحص API key → فحص `suspiciousLines` فارغة (return skipped) → استدعاء Claude API عبر SDK (`client.messages.create`) → تحليل الاستجابة → تطبيع الأوامر → بناء `AgentReviewResponsePayload` مع status صحيح.
- [x] T008 [US1] تنفيذ `parseFinalReviewResponse(text)` في `server/final-review.mjs` — استخراج JSON من استجابة AI: محاولة `JSON.parse` أولاً، ثم استخراج من أول `{` لآخر `}` كـ fallback. إرجاع `AgentCommand[]` أو مصفوفة فارغة.
- [x] T009 [US1] تنفيذ `normalizeCommandsAgainstRequest(commands, request)` في `server/final-review.mjs` — تجاهل `itemId` غير موجود في الطلب، أخذ الأعلى `confidence` عند التكرار، تطبيع `scene_header_1/2` إلى `scene_header_top_line` عبر `normalizeSceneHeaderDecisionType` (FR-006, FR-014).
- [x] T010 [US1] تنفيذ `buildSystemPrompt(schemaHints)` في `server/final-review.mjs` — system prompt عربي ثابت يحتوي: قواعد schema للعناصر التسعة، توجيهات المراجعة (RTL، تقاليد السيناريو العربي)، صيغة JSON المطلوبة بدقة. استخدام `schemaHints.allowedLineTypes` و `schemaHints.lineTypeDescriptions` و `schemaHints.gateRules`.
- [x] T011 [US1] تنفيذ mock mode في `server/final-review.mjs` — قراءة `FINAL_REVIEW_MOCK_MODE` من env. عند `success`: إرجاع `relabel` commands لكل `requiredItemId` بـ `confidence: 0.99`. عند `error`: إرجاع error response فورًا (FR-008).
- [x] T012 [US1] تعديل `src/extensions/paste-classifier.ts` — في `applyRemoteAgentReviewV2`: بعد اكتمال محرك الشك، تصفية الحالات بنطاق `agent-candidate` أو `agent-forced`، بناء `FinalReviewRequestPayload`، إرسال HTTP POST إلى `FINAL_REVIEW_ENDPOINT`، تطبيق أوامر `relabel`/`split` المُعادة على `ClassifiedDraft[]`.

**Checkpoint**: المسار الأساسي يعمل — لصق نص مشبوه → مراجعة AI → تطبيق تلقائي

---

## Phase 4: User Story 2 — بناء حزمة الأدلة الغنية (Priority: P2)

**Goal**: كل سطر مشبوه يُرسل مع أدلة مفصّلة من محرك الشك

**Independent Test**: إنشاء `SuspicionCase` اصطناعي بإشارات متعددة واستدعاء `buildFinalReviewSuspiciousLinePayload` والتحقق من جميع حقول الأدلة.

### Implementation for User Story 2

- [x] T013 [P] [US2] إنشاء `src/final-review/payload-builder.ts` — تنفيذ `buildFinalReviewSuspiciousLinePayload(params)` حسب contracts/payload-builder-api.md: إرجاع `null` إذا `assignedType` ليس في `REVIEWABLE_AGENT_TYPES`. بناء `evidence` من `suspicionCase.signals` مُجمّعة بـ 6 أنواع (`gateBreaks`, `alternativePulls`, `contextContradictions`, `rawCorruptionSignals`, `multiPassConflicts`, `sourceRisks`). استخراج `contextLines` (نافذة ±2). تحديد `routingBand`.
- [x] T014 [P] [US2] تنفيذ `formatFinalReviewPacketText(request)` في `src/final-review/payload-builder.ts` — إرجاع `JSON.stringify` بـ indent 2 لملخص تشخيصي (itemId, lineIndex, assignedType, suspicionScore, routingBand, critical, reasonCodes, signalMessages). حد 160,000 حرف.
- [x] T015 [US2] تعديل `src/extensions/paste-classifier.ts` — ربط `buildFinalReviewSuspiciousLinePayload` في مسار بناء `FinalReviewRequestPayload` (استبدال البناء البسيط في T012 باستدعاء payload-builder الغني).

**Checkpoint**: الأدلة الغنية تُرسل مع كل سطر مشبوه — AI يحصل على سياق كامل

---

## Phase 5: User Story 3 — التحقق والتطبيع على الخادم (Priority: P2)

**Goal**: الخادم يرفض الطلبات غير الصالحة بخطأ 400 واضح

**Independent Test**: إرسال طلب مع `suspicionScore: 150` والتحقق من رفضه بـ 400.

### Implementation for User Story 3

- [x] T016 [US3] تنفيذ `validateFinalReviewRequestBody(body)` في `server/final-review.mjs` — تحقق صارم من كل حقل حسب contracts/final-review-api.md: `packetVersion` (non-empty, max 64), `schemaVersion` (non-empty, max 64), `sessionId` (non-empty, max 120), `importOpId` (non-empty, max 120), `totalReviewed` (integer ≥ 0), `suspiciousLines` (array, كل عنصر: `itemId` فريد, `suspicionScore` 0–100, `assignedType` in ALLOWED_LINE_TYPES, `routingBand` in [agent-candidate, agent-forced]), `forcedItemIds ⊆ requiredItemIds ⊆ suspiciousLines[*].itemId`. تطبيع عبر `trim()` وقطع النصوص الطويلة. رسائل خطأ وصفية بالإنجليزية.
- [x] T017 [US3] تنفيذ فحص API key في `server/final-review.mjs` — دالة `validateAnthropicApiKey(key)`: تأكد من بادئة `sk-ant-`، لا مسافات، طول ≥ 20 وأقل من 512 (FR-015). إرجاع `status: "partial"` مع رسالة واضحة عند الفشل.

**Checkpoint**: الطلبات الفاسدة تُرفض بـ 400 — لا بيانات مشوّهة تصل لـ AI

---

## Phase 6: User Story 4 — استدعاء Anthropic API مع المرونة (Priority: P3)

**Goal**: الخادم يتعامل مع أعطال API بمتانة: retry, fallback model, REST fallback

**Independent Test**: `FINAL_REVIEW_MOCK_MODE=success` → طلب مراجعة → أوامر mock صحيحة.

### Implementation for User Story 4

- [x] T018 [US4] تنفيذ exponential backoff في `server/final-review.mjs` — عند أخطاء 429/529/503: إعادة محاولة حتى 3 مرات بتأخيرات 3s, 6s, 12s. احترام رأس `retry-after` إن وُجد (FR-011). تسجيل كل محاولة عبر pino.
- [x] T019 [US4] تنفيذ fallback model في `server/final-review.mjs` — عند فشل `DEFAULT_MODEL_ID` (`claude-sonnet-4-6`): إعادة المحاولة بـ `FALLBACK_MODEL_ID` (`claude-haiku-4-5-20251001`). تسجيل التبديل (FR-012).
- [x] T020 [US4] تنفيذ REST fallback في `server/final-review.mjs` — عند فشل SDK: استدعاء مباشر عبر axios إلى `https://api.anthropic.com/v1/messages` مع الرؤوس: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. حسب research.md §9.3.
- [x] T021 [US4] تنفيذ زيادة `max_tokens` عند القطع في `server/final-review.mjs` — إذا `stop_reason === "max_tokens"` ولا أوامر قابلة للتحليل: مضاعفة `max_tokens` وإعادة المحاولة مرة واحدة (FR-013). حساب `max_tokens` الديناميكي: `min(BASE_OUTPUT_TOKENS + TOKENS_PER_SUSPICIOUS_LINE × count, MAX_TOKENS_CEILING)`.
- [x] T022 [US4] تنفيذ model resolution في `server/final-review.mjs` — أولوية: `FINAL_REVIEW_MODEL` > `ANTHROPIC_REVIEW_MODEL` > `AGENT_REVIEW_MODEL` > `DEFAULT_MODEL_ID`. رفض نماذج غير Anthropic (`NON_ANTHROPIC_MODEL_RE`) مع تحذير وعودة للافتراضي.

**Checkpoint**: النظام يتعافى تلقائيًا من أعطال API — المستخدم لا يرى فشلاً

---

## Phase 7: User Story 5 — ترقية الحالات عالية الخطورة وتحديد السقف (Priority: P3)

**Goal**: الأسطر ذات alternative-pull ≥ 96 تُرقّى تلقائيًا، والعدد المُرسل لا يتجاوز السقف

**Independent Test**: 100 سطر منها 5 بـ alternative-pull ≥ 96 → تُرقّى إلى agent-forced والعدد لا يتجاوز السقف.

### Implementation for User Story 5

- [x] T023 [P] [US5] تنفيذ `promoteHighSeverityMismatches(cases)` في `src/extensions/paste-classifier.ts` — لكل `SuspicionCase` بنطاق `agent-candidate`: إذا وُجدت إشارة `alternative-pull` بدرجة ≥ 96 → ترقية إلى `agent-forced` (FR-009).
- [x] T024 [P] [US5] تنفيذ `selectSuspiciousLinesForAgent(cases, totalReviewed)` في `src/extensions/paste-classifier.ts` — حساب السقف: `Math.ceil(totalReviewed × AGENT_REVIEW_MAX_RATIO)`. ترتيب الحالات: `agent-forced` أولاً، ثم `agent-candidate` حسب `suspicionScore` تنازليًا. قطع عند السقف (FR-010).
- [x] T025 [US5] ربط `promoteHighSeverityMismatches` و `selectSuspiciousLinesForAgent` في مسار `applyRemoteAgentReviewV2` في `src/extensions/paste-classifier.ts` — استدعاؤهما بين مخرج محرك الشك وبناء الحزمة (T012).

**Checkpoint**: التوجيه الذكي يعمل — الأسطر الحرجة تُرقّى والسقف محترم

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: تحسينات تؤثر على عدة قصص

- [x] T026 [P] تنفيذ telemetry شامل في `server/final-review.mjs` — تسجيل pino لكل مرحلة: بناء الحزمة، إحصائيات التوجيه (`ReviewRoutingStats`)، نتائج المراجعة (status, latencyMs, model, retryCount, token usage) (FR-017).
- [x] T027 [P] تنفيذ `ReviewRoutingStats` في `src/extensions/paste-classifier.ts` — حساب `countPass`, `countLocalReview`, `countAgentCandidate`, `countAgentForced` بعد محرك الشك. تضمينها في telemetry log.
- [x] T028 تنفيذ coverage check في `server/final-review.mjs` — بعد تطبيع الأوامر: فحص `resolvedItemIds ⊇ requiredItemIds` لتحديد `status` (applied/partial/error). فحص `forcedItemIds` غير المحسومة → `status: "error"` (FR-016).
- [x] T029 تشغيل `pnpm typecheck` والتحقق من عدم وجود أخطاء TypeScript في الملفات الجديدة والمُعدّلة.
- [x] T030 تشغيل `pnpm validate` (format + lint + typecheck + test) والتأكد من اجتياز جميع الفحوصات.
- [x] T031 [P] إنشاء `tests/unit/final-review-payload-builder.test.ts` — اختبار `buildFinalReviewSuspiciousLinePayload`: حالة عادية (SuspicionCase بإشارات متعددة → payload كامل)، حالة `assignedType` غير قابل للمراجعة (→ null)، حالة contextLines (نافذة ±2)، حالة routingBand mapping.
- [x] T032 [P] إنشاء `tests/unit/final-review-validation.test.ts` — اختبار `validateFinalReviewRequestBody`: حقول مطلوبة مفقودة (→ خطأ)، `suspicionScore` خارج النطاق (→ 400)، `forcedItemIds ⊄ requiredItemIds` (→ خطأ)، طلب صالح كاملاً (→ pass).
- [x] T033 [P] إنشاء `tests/unit/final-review-command-parser.test.ts` — اختبار `parseFinalReviewResponse`: JSON صالح (→ commands[])، JSON ملفوف في نص (→ استخراج)، نص غير JSON (→ [])، تطبيع `scene_header_1` → `scene_header_top_line`.
- [x] T034 إنشاء `tests/integration/final-review-pipeline.test.ts` — اختبار المسار الكامل مع mock mode: طلب بأسطر مشبوهة → استجابة mock → أوامر relabel صحيحة. اختبار `FINAL_REVIEW_MOCK_MODE=error` → استجابة خطأ.
- [x] T035 تشغيل benchmark دقة التصنيف (`bench/`) والتحقق من عدم تراجع الدقة عن 93.7% (SC-006).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: لا تبعيات — تبدأ فورًا
- **Foundational (Phase 2)**: تعتمد على Phase 1 — تُعيق جميع القصص
- **US1 (Phase 3)**: تعتمد على Phase 2 — MVP
- **US2 (Phase 4)**: تعتمد على Phase 2 — تُحسّن US1 (payload builder)
- **US3 (Phase 5)**: تعتمد على Phase 2 — مستقلة عن US1/US2
- **US4 (Phase 6)**: تعتمد على US1 (T007 specifically) — تُحسّن المتانة
- **US5 (Phase 7)**: تعتمد على Phase 2 — مستقلة عن US1–US4
- **Polish (Phase 8)**: تعتمد على جميع القصص

### Within Each User Story

- Models/Types قبل Services
- Services قبل Controllers/Routes
- Core implementation قبل Integration
- Story كاملة قبل الانتقال للتالية

### Parallel Opportunities

```bash
# Phase 1 — جميعها متوازية:
T001: src/types/final-review.ts (request types)
T002: src/types/final-review.ts (response types)
T003: src/extensions/paste-classifier-config.ts (constants)

# Phase 4 — US2 متوازية داخليًا:
T013: src/final-review/payload-builder.ts (buildFinalReviewSuspiciousLinePayload)
T014: src/final-review/payload-builder.ts (formatFinalReviewPacketText)

# Phase 7 — US5 متوازية داخليًا:
T023: promoteHighSeverityMismatches
T024: selectSuspiciousLinesForAgent

# Phase 8 — متوازية:
T026: telemetry (server)
T027: ReviewRoutingStats (frontend)
```

---

## Implementation Strategy

### MVP First (User Story 1 فقط)

1. إكمال Phase 1: Setup (T001–T003)
2. إكمال Phase 2: Foundational (T004–T006)
3. إكمال Phase 3: User Story 1 (T007–T012)
4. **توقف وتحقق**: اختبار المسار الأساسي مع mock mode
5. نشر/عرض إذا جاهز

### Incremental Delivery

1. Setup + Foundational → البنية جاهزة
2. US1 → المسار الأساسي يعمل (MVP!)
3. US2 → أدلة غنية تُحسّن دقة AI
4. US3 → حماية ضد البيانات الفاسدة
5. US4 → متانة أمام أعطال API
6. US5 → توجيه ذكي + سقف
7. Polish → telemetry + coverage check + validation

---

## Notes

- [P] tasks = ملفات مختلفة، لا تبعيات
- [Story] label يربط المهمة بقصة المستخدم
- T001 و T002 كلاهما في نفس الملف لكن أقسام مختلفة — يمكن تنفيذهما متتابعين
- commit بعد كل مهمة أو مجموعة منطقية
- توقف عند أي checkpoint للتحقق من القصة مستقلةً
