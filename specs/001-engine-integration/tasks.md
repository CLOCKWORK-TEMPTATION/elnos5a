# Tasks: دمج المحرك داخل التطبيق

**Input**: Design documents from `/specs/001-engine-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1=فتح ملفات, US2=لصق نص, US3=استقلالية, US4=سلامة pipeline)

---

## Phase 1: Setup

**Purpose**: نسخ المحرك وتجهيز البيئة

- [x] T001 نسخ ملفات المحرك من `D:\karank` إلى `server/karank_engine/engine/` مع الحفاظ على بنية Python الأصلية (ts_bridge.py, parser/, schema/, requirements.txt)
- [x] T002 تثبيت اعتمادات Python: `pip install -r server/karank_engine/engine/requirements.txt`
- [x] T003 التحقق اليدوي من عمل ts_bridge.py: `echo '{"cmd":"ping","id":"t"}' | python server/karank_engine/engine/ts_bridge.py` → يجب أن يعود `{"id":"t","status":"ok"}`

**Checkpoint**: المحرك يعمل مستقلاً من سطر الأوامر.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: البنية التحتية المشتركة التي تعتمد عليها كل User Stories

**CRITICAL**: لا يمكن بدء أي user story قبل اكتمال هذه المرحلة.

- [x] T004 [P] توسيع `ExtractionMethod` بإضافة `"karank-engine-bridge"` في `src/types/file-import.ts`
- [x] T005 [P] توسيع `ClassificationMethod` بإضافة `"external-engine"` في `src/types/classification-types.ts`
- [x] T006 [P] إضافة حقول `schemaText`, `schemaElements`, `rawExtractedText` إلى `FileExtractionResult` في `src/types/file-import.ts`
- [x] T007 إنشاء `server/services/schema-parser.mjs` — parser لصيغة `ELEMENT = VALUE` مع element mapping table وvalidation صارم (رفض عناصر غير معروفة + orphan cene_header_1 handling مع telemetry)
- [x] T008 إنشاء `server/karank-bridge.mjs` — KarankBridge class: spawn (lazy), ping readiness, request/response عبر stdio JSON lines, single retry on death, destroy عند إغلاق الخادم، خطأ صريح عند غياب Python 3.12+ أو ملفات المحرك

**Checkpoint**: Types موسّعة، schema-parser جاهز، KarankBridge جاهز — يمكن البدء بأي user story.

---

## Phase 3: User Story 1 — فتح/استيراد ملف سيناريو (Priority: P1)

**Goal**: المستخدم يفتح ملف سيناريو ويرى النص مصنّفاً عبر المحرك المضمّن.

**Independent Test**: فتح `1990.docx` ورؤية النص مصنّفاً في المحرر بـ `method = "karank-engine-bridge"`.

### Implementation

- [x] T009 [US1] تعديل `server/controllers/extract-controller.mjs` لاستدعاء KarankBridge: docx → حفظ مؤقت ثم `parseDocx(path)`، doc/txt/fountain/fdx → استخراج النص الحالي ثم `parseText(text)`، pdf → OCR ثم `parseText(text)`. الاستجابة تتبع الـ envelope الموحد مع حقول schema الجديدة
- [x] T010 [US1] تعديل `server/services/response-normalizer.mjs` لدعم تطبيع ناتج المحرك إلى FileExtractionResult الموسّع (إضافة schemaText, schemaElements, rawExtractedText, method="karank-engine-bridge")
- [x] T011 [US1] تعديل `src/extensions/paste-classifier.ts` لإضافة مسار schema-style: عندما يأتي الإدخال بصيغة `ELEMENT = VALUE` من المحرك، يتحول مباشرة إلى `ClassifiedDraft[]` بـ `classificationMethod="external-engine"` دون المرور بـ HybridClassifier. يشمل: mapping العناصر، orphan cene_header_1 handling، رفض عناصر غير معروفة

**Checkpoint**: فتح ملف docx/pdf/txt يعود بناتج مصنّف عبر المحرك المضمّن.

---

## Phase 4: User Story 2 — لصق نص سيناريو (Priority: P2)

**Goal**: المستخدم يلصق نصاً عربياً ويرى التصنيف عبر المحرك المضمّن.

**Independent Test**: لصق فقرة نص عربي سيناريو ورؤية التصنيف الصحيح.

### Implementation

- [x] T012 [US2] إنشاء `server/controllers/text-extract-controller.mjs` — معالج `POST /api/text-extract`: استقبال `{ text }` → `bridge.parseText(text)` → نفس envelope الموحد الخاص بـ `/api/file-extract`
- [x] T013 [US2] تسجيل route جديد `POST /api/text-extract` في `server/routes/index.mjs` مع rate limiter مناسب
- [x] T014 [US2] تعديل `src/extensions/paste-classifier.ts` (دالة `handlePaste` أو `applyPasteClassifierFlowToView`) ليرسل النص الملصوق أولاً إلى `/api/text-extract` ثم يستخدم الناتج schema-style لبقية pipeline (يعتمد على T011)

**Checkpoint**: لصق نص عربي → يُرسل لـ `/api/text-extract` → يعود مصنّفاً → يظهر في المحرر.

---

## Phase 5: User Story 3 — استقلالية التطبيق الكاملة (Priority: P1)

**Goal**: التطبيق يعمل بالكامل بدون `D:\karank` على الجهاز.

**Independent Test**: إعادة تسمية `D:\karank` والتأكد أن كل شيء يعمل.

### Implementation

- [x] T015 [US3] فحص شامل: `grep -r "D:\\\\karank\|D:/karank\|D:\\karank" server/ src/ --include="*.ts" --include="*.mjs" --include="*.js"` — أي نتيجة = خطأ يجب إصلاحه
- [x] T016 [US3] التحقق أن KarankBridge يستخدم مسار نسبي داخل المشروع فقط (`server/karank_engine/engine/ts_bridge.py`) وأن رسائل الخطأ تشير فقط لمسارات داخلية
- [x] T017 [US3] التحقق أن رسالة خطأ غياب Python 3.12+ واضحة ومفهومة (ليس stack trace) — اختبار يدوي مع Python غير موجود على PATH

**Checkpoint**: التطبيق يعمل كاملاً بدون D:\karank. رسائل خطأ واضحة عند غياب Python.

---

## Phase 6: User Story 4 — سلامة pipeline التصنيف (Priority: P2)

**Goal**: طبقات المراجعة تعمل بشكل طبيعي على ناتج المحرك المضمّن.

**Independent Test**: استيراد ملف والتحقق أن الأسطر المشبوهة تمر بطبقة الشك و agent review.

### Implementation

- [x] T018 [US4] التحقق أن `ClassifiedDraft` بـ `classificationMethod="external-engine"` يمر بـ `PostClassificationReviewer` بشكل طبيعي — الكواشف الثمانية تعمل على ناتج المحرك
- [x] T019 [US4] التحقق أن routing bands تعمل: suspicion score >= 74 مع >= 2 findings → `agent-candidate`/`agent-forced` → يُرسل لـ `/api/agent/review`
- [x] T020 [US4] اختبار تكامل كامل: استيراد ملف → ناتج محرك → شك → agent review → عرض في المحرر

**Checkpoint**: pipeline المراجعة الكاملة تعمل على ناتج المحرك بنفس جودة التصنيف الحالي.

---

## Phase 7: Polish & Validation

**Purpose**: تنظيف وتحقق نهائي

- [x] T021 [P] كتابة اختبارات unit لـ schema-parser في `tests/unit/server/schema-parser.test.ts` (parsing صحيح، عناصر غير معروفة، orphan cene_header_1) وelement mapping في `tests/unit/extensions/element-mapping.test.ts`
- [ ] T022 [P] كتابة اختبارات integration لدورة حياة bridge في `tests/integration/bridge-lifecycle.test.ts` (spawn, ping, request, death+retry, destroy) واستخراج الملفات عبر المحرك في `tests/integration/file-extract-engine.test.ts`
- [x] T023 [P] تشغيل `pnpm typecheck` والتأكد من عدم وجود أخطاء أنواع
- [x] T024 [P] تشغيل `pnpm lint` وإصلاح أي مخالفات
- [x] T025 تشغيل `pnpm test` والتأكد من نجاح كل الاختبارات (17 اختبار جديد نجح — الأخطاء الموجودة pre-existing)
- [ ] T026 اختبار أداء: فتح ملف docx عربي (50 صفحة) والتحقق أن التصنيف يكتمل في < 10 ثوانٍ (SC-001)، ولصق نص سيناريو والتحقق أن التصنيف يكتمل في < 3 ثوانٍ (SC-002)
- [ ] T027 تشغيل `pnpm validate` (format + lint + typecheck + test) كاملاً
- [x] T028 مراجعة quickstart.md وتنفيذ خطواته من الصفر للتحقق من صحتها

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: لا dependencies — يبدأ فوراً
- **Foundational (Phase 2)**: يعتمد على Setup — يحظر كل user stories
- **US1 (Phase 3)**: يعتمد على Foundational
- **US2 (Phase 4)**: يعتمد على Foundational + US1 (يستخدم نفس schema path في paste-classifier)
- **US3 (Phase 5)**: يعتمد على US1 + US2 (فحص بعد اكتمال التنفيذ)
- **US4 (Phase 6)**: يعتمد على US1 (يحتاج ناتج محرك حقيقي للاختبار) — **يمكن تشغيله بالتوازي مع US2 (Phase 4)**
- **Polish (Phase 7)**: يعتمد على كل المراحل

### Within Each User Story

- Models/Types → Services → Controllers → Routes → Integration
- Core implementation before integration

### Parallel Opportunities

- T004 + T005 + T006: أنواع مختلفة في ملفات مختلفة
- T021 + T022: اختبارات unit و integration مستقلة
- T023 + T024: أدوات مستقلة (typecheck + lint)
- US4 يمكن أن يبدأ بعد US1 مباشرة (بالتوازي مع US2)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (نسخ المحرك)
2. Complete Phase 2: Foundational (types + schema-parser + bridge)
3. Complete Phase 3: US1 (فتح ملفات عبر المحرك)
4. **STOP and VALIDATE**: فتح `1990.docx` → ناتج مصنّف بـ `karank-engine-bridge`
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → بنية تحتية جاهزة
2. US1 → فتح ملفات يعمل → MVP
3. US2 → لصق نص يعمل → ميزة إضافية
4. US3 → تحقق استقلالية → ضمان الجودة
5. US4 → تحقق pipeline → ضمان النزاهة
6. Polish → validate كامل → جاهز للدمج

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
