# Implementation Tasks: توحيد مراحل الاستقبال

**Feature**: `005-unify-reception-pipeline`

## Phase 1: Setup

**Goal**: تنظيف الكود القديم وإزالة المسارات التي سيتم استبدالها لضمان عدم حدوث تراجعات.

- [x] T001 [P] حذف كود طبقة المراجعة القديمة بالكامل من الواجهة والخادم `src/` و `server/` (FR-010)
- [x] T002 [P] حذف مسار المعالجة المباشر `parseDocx` من `src/utils/file-import/open-pipeline.ts` والملفات ذات الصلة (FR-007)

---

## Phase 2: Foundational

**Goal**: بناء العقدة الموحدة (الخدمة المشتركة) ونماذج البيانات التي تعتمد عليها جميع مسارات الاستقبال.
**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 إنشاء نموذج البيانات `UnifiedReceptionResponse` و `PipelineTelemetryEvent` في `src/types/unified-reception.ts`
- [x] T004 [P] بناء خدمة التسجيل (Telemetry) لتتبع مراحل المعالجة في `server/utils/pipeline-telemetry.mjs` (FR-017)
- [x] T005 تحديث نقطة الدخول `server/controllers/text-extract-controller.mjs` (`/api/text-extract`) لتقبل المسارات الثلاثة وتُعيد `UnifiedReceptionResponse` وفقاً للمخطط الموثق في `contracts/reception-api.md`
- [x] T006 إضافة مهلة زمنية (Timeout) صريحة 30 ثانية للخدمة المشتركة تُعيد خطأ `TIMEOUT` في `server/controllers/text-extract-controller.mjs` (FR-016)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - لصق نص ونتيجة مصنّفة كاملة (Priority: P1) 🎯 MVP

**Goal**: توجيه النص الملصق إلى الخادم أولاً بدلاً من التصنيف المباشر، ثم تنفيذ المراحل الثلاث (تصنيف محلي ← شك ← مراجعة).

**Independent Test**: لصق نص ومراقبة تبويب الشبكة (Network) للتأكد من استدعاء الخادم أولاً، ثم ظهور النص، ثم حدوث تحديثات في الخلفية.

### Tests for User Story 1 ⚠️

- [x] T007 [P] [US1] كتابة اختبار Integration لمسار اللصق الموحد في `tests/integration/paste-pipeline.integration.test.ts`
- [x] T008 [P] [US1] كتابة اختبار Mock للتأكد من فشل المسار بعد 30 ثانية في `tests/integration/timeout.integration.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] تحديث `src/extensions/paste-classifier.ts` لإرسال النص الملصق إلى `/api/text-extract` كخطوة أولى
- [x] T010 [US1] عرض مؤشر انتظار (Loading Spinner) في الواجهة طوال فترة انتظار رد الخادم (FR-016)
- [x] T011 [US1] تطبيق معالجة الأخطاء الصريحة (إلغاء الإدراج وإظهار رسالة خطأ) عند فشل استجابة الخادم في `src/extensions/paste-classifier.ts` (FR-013)
- [x] T012 [US1] كتابة ناتج التصنيف المحلي في المحرر فور استلام استجابة الخادم الموحدة في `src/extensions/paste-classifier.ts`
- [x] T013 [US1] تشغيل طبقتي الشك والمراجعة كعمليات خلفية (Background) وتمرير `importOpId` لربط الجلسة بـ `Command Engine` لرفض التحديثات المتقادمة (Stale Edits)
- [x] T014 [US1] إضافة إشعار Toast صامت عند فشل عمليات الخلفية دون مسح المحتوى المكتوب في `src/extensions/paste-classifier.ts` (FR-015)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - فتح مستند قديم بمسار موحّد (Priority: P2)

**Goal**: ضمان أن المستندات القديمة تمر عبر نفس الاستجابة الموحدة دون تفرعات استثنائية أو صمت عند الفشل.

**Independent Test**: فتح ملف DOC والتحقق من أن العرض في المحرر لا يتم إلا بعد رد `UnifiedReceptionResponse`.

### Tests for User Story 2 ⚠️

- [x] T015 [P] [US2] كتابة اختبار Integration لاستيراد DOC في `tests/integration/doc-pipeline.integration.test.ts`

### Implementation for User Story 2

- [x] T016 [US2] تحديث معالج رفع ملفات DOC لاستخراج النص ثم إرساله إلى `/api/text-extract` في `src/controllers/editor-actions-controller.ts`
- [x] T017 [US2] إزالة السلوك الاحتياطي الصامت عند الفشل وجعله فشلاً صريحاً يلغي عملية الاستيراد (FR-006)
- [x] T018 [US2] ربط نجاح الخدمة المشتركة بنفس مسار (تصنيف محلي ← خلفية الشك والمراجعة) المستخدم في اللصق

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - فتح مستند حديث بمسار الاستخراج الأولي (Priority: P2)

**Goal**: توحيد استيراد ملفات DOCX ليتم عبر استخراج النص أولاً بدلاً من `parseDocx`.

**Independent Test**: فتح DOCX والتأكد من إرسال النص المستخرج للخادم الموحد.

### Tests for User Story 3 ⚠️

- [x] T019 [P] [US3] كتابة اختبار Integration لاستيراد DOCX في `tests/integration/docx-pipeline.integration.test.ts`

### Implementation for User Story 3

- [x] T020 [US3] تحديث معالج استيراد DOCX — يمر عبر نفس المسار الموحد لأن `FORCE_PASTE_CLASSIFIER_FILE_TYPES` يشمل `docx`
- [x] T021 [US3] إرسال النص المستخرج من الـ DOCX إلى `/api/text-extract` بمعامل `sourceType: 'docx'`
- [x] T022 [US3] ربط الاستجابة بنفس مسار المراحل الثلاث (تصنيف محلي، شك، مراجعة)

---

## Phase 6: User Story 4 - تنفيذ المراحل الثلاث حتى عند غياب الاشتباهات (Priority: P3)

**Goal**: إغلاق دورة الاستقبال بشكل سليم حتى لو كان النص نظيفاً بالكامل.

**Independent Test**: تمرير نص نظيف والتحقق من أن مسار الخلفية يكتمل بشكل إيجابي عبر طبقة المراجعة بناتج فارغ.

### Tests for User Story 4 ⚠️

- [x] T023 [P] [US4] كتابة اختبار الوحدة لتسلسل عدم وجود اشتباهات في `tests/unit/pipeline-sequence.test.ts`

### Implementation for User Story 4

- [x] T024 [US4] تم التحقق من أن الكود الحالي يمرر مصفوفة فارغة لطبقة المراجعة ويغلق المسار بنجاح (FR-011)

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T025 [P] كتابة E2E tests تغطي المسارات الثلاثة (لصق، DOC، DOCX) في `tests/e2e/reception.e2e.spec.ts` (SC-007)
- [x] T026 التحقق من عمل جميع خطوط المراقبة `Telemetry` لكل مرحلة عبر الـ logs (SC-010) — تم إضافة telemetry مفقود لمرحلة suspicion-engine
- [ ] T027 إجراء Smoke Test يدوي للمسارات الثلاثة مع نصوص حقيقية ومحاكاة فشل الخادم ⚠️ (مهمة يدوية)
- [x] T028 إجراء فحص `grep` أخير — لا توجد بقايا `parseDocx` في `src/`، تم تصحيح مرجعين قديمين لـ `/api/agent/review` (SC-008)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: لا يوجد تبعيات - يمكن البدء فوراً
- **Foundational (Phase 2)**: يعتمد على Phase 1 - يمنع البدء بمهام الـ User Stories
- **User Stories (Phase 3-6)**: جميعها تعتمد على Phase 2
- **Polish (Phase 7)**: يعتمد على اكتمال جميع الـ User Stories

### Parallel Opportunities

- مهام الحذف (T001, T002) يمكن تنفيذها على التوازي.
- يمكن كتابة اختبارات Integration لكل مسار بالتوازي مع المهام التأسيسية.
- المسارات (US1, US2, US3) تشترك في نفس منطق واجهة المستخدم بعد الاستجابة؛ يمكن بناء اللصق (US1) بالكامل ثم تكييف (US2, US3) بسرعة.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. تنفيذ مرحلة الحذف والتأسيس (T001-T006).
2. تطبيق التوحيد بالكامل على مسار اللصق (T007-T013).
3. اختبار المسار كلياً.

### Incremental Delivery

1. بعد نجاح MVP، تتم إضافة دعم DOC.
2. ثم يضاف دعم DOCX.
3. التثبيت النهائي للخطأ الشكلي (US4).
4. الختام باختبارات E2E والمراجعة.
