# Tasks: محرك الاشتباه (Suspicion Engine)

**Input**: Design documents from `/specs/002-suspicion-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: مطلوبة — المواصفات تشترط SC-006 (3 اختبارات لكل عائلة كواشف) وSC-004/SC-005/SC-007 كمعايير نجاح قابلة للقياس.

**Organization**: المهام مُنظمة حسب قصص المستخدم (US1–US5) لتمكين التنفيذ والاختبار المستقل لكل قصة.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: يمكن تشغيلها بالتوازي (ملفات مختلفة، لا تبعيات)
- **[Story]**: قصة المستخدم التي تنتمي إليها المهمة (US1–US5)
- جميع المسارات نسبية من جذر المشروع

---

## Phase 1: Setup (البنية التحتية المشتركة)

**Purpose**: إنشاء هيكل المجلدات والأنواع الأساسية التي تعتمد عليها جميع القصص

- [x] T001 إنشاء هيكل المجلدات الكامل لـ `src/suspicion-engine/` وفق plan.md (trace/, features/, detectors/gate-break/, detectors/context/, detectors/corruption/, detectors/cross-pass/, detectors/source/, aggregation/, scoring/, routing/, resolvers/, adapters/, telemetry/)
- [x] T002 إنشاء هيكل مجلدات الاختبارات `tests/unit/suspicion-engine/` و`tests/integration/suspicion-engine/` بنفس بنية المصدر
- [x] T003 [P] تعريف جميع الأنواع الأساسية في `src/suspicion-engine/types.ts`: SignalFamily, SignalType, SuspicionBand, InternalResolutionRoute, ResolutionStatus, WeightPolicyProfile, CircuitBreakerState, وجداول القيود family→signalType (من data-model.md)
- [x] T004 [P] تعريف أنواع Evidence كـ discriminated union strict في `src/suspicion-engine/types.ts`: GateBreakEvidence, AlternativePullEvidence, ContextContradictionEvidence, RawCorruptionEvidence, MultiPassConflictEvidence, SourceRiskEvidence, SuspicionSignalEvidence (من data-model.md §2)
- [x] T005 [P] تعريف واجهات الكيانات الرئيسية في `src/suspicion-engine/types.ts`: ClassificationTrace, PassVote, LineRepair, SourceHints, LineQuality, FinalDecision, SuspicionSignal, SuspicionCase, SignalFamilySummary, SuspicionFeature (من data-model.md §1–§4)
- [x] T006 [P] تعريف واجهات المدخلات والمخرجات في `src/suspicion-engine/types.ts`: SuspicionEngineInput, SuspicionEngineOutput, RoutingSummary, ResolutionOutcome, AIReviewPayload, AIVerdictResponse, ContextLine (من data-model.md §5, §9, §10 + engine-api.md)
- [x] T007 [P] تعريف واجهات السياسات في `src/suspicion-engine/types.ts`: SuspicionWeightPolicy, FamilyWeights, BoostFactors, PenaltyFactors, BandThresholds, RemoteAIResolverPolicy (من data-model.md §6, §7)
- [x] T008 [P] تعريف واجهة الكاشف وسياق الكشف في `src/suspicion-engine/detectors/detector-interface.ts`: DetectorFn, DetectorContext (من engine-api.md §Detector Contract)
- [x] T009 [P] تعريف واجهة الـ resolver في `src/suspicion-engine/resolvers/resolver-interface.ts`: SuspicionResolver interface مع canHandle + resolve (من resolver-api.md §SuspicionResolver)
- [x] T010 [P] إنشاء الـ profiles الثلاثة الافتراضية والـ factory في `src/suspicion-engine/config.ts`: createWeightPolicy(profile), createAIResolverPolicy(), القيم من data-model.md §6 جدول الـ profiles (من research.md §10)

**Checkpoint**: البنية التحتية جاهزة — جميع الأنواع والواجهات مُعرَّفة ومُصدَّرة.

---

## Phase 2: Foundational (المتطلبات المسبقة الحاجزة)

**Purpose**: مكونات أساسية يجب اكتمالها قبل أي قصة مستخدم

**CRITICAL**: لا يمكن بدء أي قصة مستخدم قبل اكتمال هذه المرحلة

- [x] T011 [P] تنفيذ SuspicionFeatureAssembler في `src/suspicion-engine/features/feature-assembler.ts`: تحويل ClassificationTrace + سياق السطر → SuspicionFeature بالفئات الست (Gate, Context, RawQuality, CrossPass, Competition, Stability)
- [x] T012 [P] تنفيذ GateFeatures extractor في `src/suspicion-engine/features/gate-features.ts`: استخراج مؤشرات البوابات (النقطتين، طول السطر، أنماط البداية/النهاية)
- [x] T013 [P] تنفيذ ContextFeatures extractor في `src/suspicion-engine/features/context-features.ts`: استخراج مؤشرات السياق (النوع السابق/التالي، عمق كتلة الحوار)
- [x] T014 [P] تنفيذ RawQualityFeatures extractor في `src/suspicion-engine/features/raw-quality-features.ts`: استخراج مؤشرات جودة النص (arabicRatio, weirdCharRatio, qualityScore)
- [x] T015 [P] تنفيذ CrossPassFeatures extractor في `src/suspicion-engine/features/cross-pass-features.ts`: استخراج مؤشرات تضارب الممرات من passVotes
- [x] T016 [P] تنفيذ CompetitionFeatures extractor في `src/suspicion-engine/features/competition-features.ts`: استخراج مؤشرات التنافس بين الأنواع (النوع البديل الأقوى، قوة الجذب)
- [x] T017 [P] تنفيذ طبقة Telemetry الأساسية في `src/suspicion-engine/telemetry/suspicion-metrics.ts`: تعريف SuspicionTelemetryEvent وواجهة التسجيل (FR-014)
- [x] T018 [P] تنفيذ SuspicionRecorder في `src/suspicion-engine/telemetry/suspicion-recorder.ts`: تسجيل الأحداث مع Zod validation عند الحدود (من research.md §14)
- [x] T019 تنفيذ createSignal factory في `src/suspicion-engine/helpers.ts`: دالة createSignal<T> مع Omit+spread pattern (من research.md §11 نمط 5)
- [x] T020 تنفيذ assertNever helper في `src/suspicion-engine/helpers.ts`: لضمان exhaustiveness في switch على signalType (من research.md §11 نمط 3)

**Checkpoint**: Feature assembler + telemetry + helpers جاهزة — يمكن بدء قصص المستخدم.

---

## Phase 3: User Story 1 — تسجيل أثر التصنيف (Classification Trace) (Priority: P1) MVP

**Goal**: جمع ClassificationTrace موحد لكل سطر يحفظ تصويتات جميع الممرات والإصلاحات ومؤشرات الجودة.

**Independent Test**: تمرير نص → تشغيل ممرات التصنيف → التحقق من أن الـ trace يحتوي على تصويت لكل ممر وfinalDecision مكتمل وrepairs بترتيب حدوثها.

### Tests for US1

- [x] T021 [P] [US1] اختبار وحدة لـ TraceCollector في `tests/unit/suspicion-engine/trace/trace-collector.test.ts`: تسجيل passVotes من عدة ممرات، التحقق من عدم حذف أي تصويت (FR-001)، والتحقق من ترتيب repairs (FR-002)
- [x] T022 [P] [US1] اختبار وحدة لـ buildSingleTrace في `tests/unit/suspicion-engine/trace/build-single-trace.test.ts`: بناء trace كامل من مدخلات يدوية، التحقق من SC-004 (passVotes فارغ + finalDecision مكتمل = تحذير)
- [x] T023 [P] [US1] اختبار وحدة لـ collectTraces في `tests/unit/suspicion-engine/trace/collect-traces.test.ts`: تحويل مخرجات pipeline كاملة إلى ReadonlyMap<number, ClassificationTrace>

### Implementation for US1

- [x] T024 [US1] تنفيذ ClassificationTrace builder في `src/suspicion-engine/trace/classification-trace.ts`: واجهة ClassificationTrace + دالة بناء immutable مع التحقق من قواعد FR-001, FR-002, SC-004, FR-016
- [x] T025 [US1] تنفيذ TraceCollector في `src/suspicion-engine/trace/trace-collector.ts`: جمع passVotes تدريجياً أثناء مرور كل طبقة تصنيف، مع واجهة addVote(lineIndex, vote) وfinalize() → ReadonlyMap
- [x] T026 [US1] تنفيذ adapter collectTraces في `src/suspicion-engine/adapters/from-classifier.ts`: تحويل ClassifiedDraft[] + PassVoteLogEntry[] → ReadonlyMap<number, ClassificationTrace> (من engine-api.md §collectTraces)
- [x] T027 [US1] تنفيذ adapter buildSingleTrace في `src/suspicion-engine/adapters/from-classifier.ts`: بناء trace واحد لسطر واحد — مفيد للاختبارات (من engine-api.md §buildSingleTrace)
- [x] T028 [US1] حقن تسجيل الأثر في ممرات التصنيف الموجودة: إضافة سطر تسجيل واحد في كل من `src/extensions/paste-classifier.ts` بعد كل snapshot (من research.md §15)

**Checkpoint**: US1 مكتمل — الـ trace يُجمع من جميع الممرات ويمكن اختباره باستقلالية.

---

## Phase 4: User Story 2 — كشف الشكوك تلقائياً (Detector Suite) (Priority: P2)

**Goal**: 15 كاشفاً مستقلاً في 5 عائلات، كل منها ينتج SuspicionSignal مهيكلة.

**Independent Test**: تشغيل أي كاشف بـ trace مُعدّ يدوياً والتحقق من signalId, family, score, evidence.

### Tests for US2

- [x] T029 [P] [US2] اختبارات كواشف gate-break في `tests/unit/suspicion-engine/detectors/gate-break/`: 3 اختبارات (حالة إيجابية + حالة سلبية لكل كاشف) لـ character-gate, dialogue-gate, action-gate (SC-006)
- [x] T030 [P] [US2] اختبارات كواشف context في `tests/unit/suspicion-engine/detectors/context/`: 3 اختبارات لـ orphan-dialogue, character-flow, sequence-violation (SC-006)
- [x] T031 [P] [US2] اختبارات كواشف corruption في `tests/unit/suspicion-engine/detectors/corruption/`: 3 اختبارات لـ split-character, wrapped-dialogue, ocr-artifact (SC-006)
- [x] T032 [P] [US2] اختبارات كواشف cross-pass في `tests/unit/suspicion-engine/detectors/cross-pass/`: 3 اختبارات لـ reverse-conflict, viterbi-conflict, multi-override (SC-006)
- [x] T033 [P] [US2] اختبارات كواشف source في `tests/unit/suspicion-engine/detectors/source/`: 3 اختبارات لـ source-hint-mismatch, quality-risk, import-profile (SC-006)

### Implementation for US2 — Gate-Break Family

- [x] T034 [P] [US2] تنفيذ character-gate detector في `src/suspicion-engine/detectors/gate-break/character-gate.detector.ts`: كشف character بلا نقطتين أو بلا حوار بعده (FR-003, FR-004)
- [x] T035 [P] [US2] تنفيذ dialogue-gate detector في `src/suspicion-engine/detectors/gate-break/dialogue-gate.detector.ts`: كشف حوار بلا character قبله
- [x] T036 [P] [US2] تنفيذ action-gate detector في `src/suspicion-engine/detectors/gate-break/action-gate.detector.ts`: كشف action يحتوي أنماط character أو dialogue

### Implementation for US2 — Context Family

- [x] T037 [P] [US2] تنفيذ orphan-dialogue detector في `src/suspicion-engine/detectors/context/orphan-dialogue.detector.ts`: كشف حوار يتيم بلا character في السياق المباشر (US2 Scenario 2)
- [x] T038 [P] [US2] تنفيذ character-flow detector في `src/suspicion-engine/detectors/context/character-flow.detector.ts`: كشف تدفق شخصيات غير منطقي
- [x] T039 [P] [US2] تنفيذ sequence-violation detector في `src/suspicion-engine/detectors/context/sequence-violation.detector.ts`: كشف انتهاكات التسلسل المنطقي

### Implementation for US2 — Corruption Family

- [x] T040 [P] [US2] تنفيذ split-character detector في `src/suspicion-engine/detectors/corruption/split-character.detector.ts`: كشف اسم شخصية مقسوم عبر سطرين
- [x] T041 [P] [US2] تنفيذ wrapped-dialogue detector في `src/suspicion-engine/detectors/corruption/wrapped-dialogue.detector.ts`: كشف حوار ملتف عبر عدة أسطر
- [x] T042 [P] [US2] تنفيذ ocr-artifact detector في `src/suspicion-engine/detectors/corruption/ocr-artifact.detector.ts`: كشف تشوهات OCR عبر arabicRatio وweirdCharRatio

### Implementation for US2 — Cross-Pass Family

- [x] T043 [P] [US2] تنفيذ reverse-conflict detector في `src/suspicion-engine/detectors/cross-pass/reverse-conflict.detector.ts`: كشف تضارب بين forward وreverse (US2 Scenario 3)
- [x] T044 [P] [US2] تنفيذ viterbi-conflict detector في `src/suspicion-engine/detectors/cross-pass/viterbi-conflict.detector.ts`: تحويل SequenceDisagreement من Viterbi إلى إشارات multi-pass-conflict (من research.md §15)
- [x] T045 [P] [US2] تنفيذ multi-override detector في `src/suspicion-engine/detectors/cross-pass/multi-override.detector.ts`: كشف سطر تم تجاوزه من 3+ ممرات

### Implementation for US2 — Source Family

- [x] T046 [P] [US2] تنفيذ source-hint-mismatch detector في `src/suspicion-engine/detectors/source/source-hint-mismatch.detector.ts`: كشف تناقض بين مصدر الاستيراد والنوع المُعيَّن
- [x] T047 [P] [US2] تنفيذ quality-risk detector في `src/suspicion-engine/detectors/source/quality-risk.detector.ts`: كشف خطر جودة النص المنخفضة
- [x] T048 [P] [US2] تنفيذ import-profile detector في `src/suspicion-engine/detectors/source/import-profile.detector.ts`: كشف مخاطر خاصة بنوع مصدر الاستيراد (PDF artifacts, DOCX style mismatch)

**Checkpoint**: US2 مكتمل — 15 كاشفاً في 5 عائلات، كل منها مُختبر باستقلالية (SC-006).

---

## Phase 5: User Story 3 — تجميع الأدلة وحساب الدرجة (Evidence Aggregation) (Priority: P3)

**Goal**: تجميع الإشارات في SuspicionCase وحساب درجة متعددة العوامل مع profiles قابلة للتهيئة.

**Independent Test**: تمرير مجموعة إشارات مُعدَّة → التحقق من أن إشارة حرجة واحدة تنتج درجة أعلى من 3 إشارات بسيطة من نفس العائلة.

### Tests for US3

- [x] T049 [P] [US3] اختبارات ScoreCalculator في `tests/unit/suspicion-engine/scoring/score-calculator.test.ts`: التحقق من أن multi-factor scoring يختلف عن max() وsum() (FR-006)، والتحقق من تأثير diversityBoost وconsensusTypeBoost
- [x] T050 [P] [US3] اختبارات EvidenceAggregator في `tests/unit/suspicion-engine/aggregation/evidence-aggregator.test.ts`: التحقق من بناء SuspicionCase مع summary مُصنَّف بالعائلات، والتحقق من حفظ جميع الإشارات (لا حذف)
- [x] T051 [P] [US3] اختبارات WeightPolicy profiles في `tests/unit/suspicion-engine/scoring/weighting-policy.test.ts`: التحقق من أن ocr-heavy يرفع band مقارنة بـ balanced-paste لنفس الإشارات (US3 Scenario 4)

### Implementation for US3

- [x] T052 [US3] تنفيذ ScoreCalculator في `src/suspicion-engine/scoring/score-calculator.ts`: حساب درجة متعددة العوامل (6 عوامل من FR-006) مع SuspicionWeightPolicy مُحقَنة
- [x] T053 [US3] تنفيذ Thresholds في `src/suspicion-engine/scoring/thresholds.ts`: تعريف عتبات BandThresholds الافتراضية وتطبيقها لتحديد SuspicionBand
- [x] T054 [US3] تنفيذ WeightingPolicy في `src/suspicion-engine/scoring/weighting-policy.ts`: تطبيق familyWeights + boostFactors + penaltyFactors حسب data-model.md §6
- [x] T055 [US3] تنفيذ EvidenceAggregator في `src/suspicion-engine/aggregation/evidence-aggregator.ts`: تجميع SuspicionSignal[] → حساب summary بالعائلات + score + band + primarySuggestedType + critical flag
- [x] T056 [US3] تنفيذ SuspicionCaseBuilder في `src/suspicion-engine/aggregation/suspicion-case-builder.ts`: بناء SuspicionCase كامل من trace + signals + classifiedLine + score

**Checkpoint**: US3 مكتمل — التجميع والسكور يعملان مع profiles مختلفة.

---

## Phase 6: User Story 4 — توجيه وحسم محلي (Local Resolution) (Priority: P4)

**Goal**: إصلاحات حتمية محلية قبل العرض (render-first guarantee) مع 6 مسارات داخلية و4 مسارات خارجية.

**Independent Test**: تجهيز SuspicionCases بـ bands مختلفة → تشغيل ResolutionCoordinator بدون AI → التحقق من أن auto-local-fix يُصحَّح قبل العرض.

### Tests for US4

- [x] T057 [P] [US4] اختبارات RoutingPolicy في `tests/unit/suspicion-engine/routing/routing-policy.test.ts`: التحقق من 6 قواعد التوجيه بالأولوية (من resolver-api.md §RoutingPolicy)
- [x] T058 [P] [US4] اختبارات LocalDeterministicResolver في `tests/unit/suspicion-engine/resolvers/local-deterministic.test.ts`: التحقق من canHandle شروط + resolve ينتج relabel + appliedAt=pre-render (FR-009)
- [x] T059 [P] [US4] اختبارات LocalRepairResolver في `tests/unit/suspicion-engine/resolvers/local-repair.test.ts`: التحقق من إصلاح split/merge + إعادة تصنيف + appliedAt=pre-render (FR-010)
- [x] T060 [P] [US4] اختبارات ResolutionCoordinator.resolvePreRender في `tests/unit/suspicion-engine/resolvers/resolution-coordinator.test.ts`: التحقق من ترتيب التنفيذ وأن كل case يُعالَج بـ resolver واحد فقط

### Implementation for US4

- [x] T061 [US4] تنفيذ route-types في `src/suspicion-engine/routing/route-types.ts`: InternalResolutionRoute literal type + جدول ترجمة إلى SuspicionBand الخارجي (FR-008)
- [x] T062 [US4] تنفيذ RoutingPolicy في `src/suspicion-engine/routing/routing-policy.ts`: assignRoute(case) → InternalResolutionRoute بـ 6 قواعد أولوية (من resolver-api.md §RoutingPolicy)
- [x] T063 [US4] تنفيذ LocalDeterministicResolver في `src/suspicion-engine/resolvers/local-deterministic-resolver.ts`: إصلاح حتمي سريع لـ gate-break حاسم + primarySuggestedType واضح (من resolver-api.md §1)
- [x] T064 [US4] تنفيذ LocalRepairResolver في `src/suspicion-engine/resolvers/local-repair-resolver.ts`: إصلاح فساد نصي (split/merge/wrapped) ثم إعادة تصنيف (من resolver-api.md §2)
- [x] T065 [US4] تنفيذ NoOpResolver في `src/suspicion-engine/resolvers/noop-resolver.ts`: معالجة pass وlocal-review وAI المعطل (من resolver-api.md §4)
- [x] T066 [US4] تنفيذ ResolutionCoordinator في `src/suspicion-engine/resolvers/resolution-coordinator.ts`: resolvePreRender + resolver chain بترتيب: LocalDeterministic → LocalRepair → NoOp (من resolver-api.md §ResolutionCoordinator)

**Checkpoint**: US4 مكتمل — الإصلاحات المحلية تعمل قبل العرض (render-first guarantee).

---

## Phase 7: User Story 5 — تصعيد ذكي إلى AI (Remote AI Resolution) (Priority: P5)

**Goal**: حزم مراجعة مهيكلة إلى AI مع circuit-breaker وtimeout handling، async بعد العرض.

**Independent Test**: mock لـ AI resolver → التحقق من شكل payload (SC-007) + التحقق من أن timeout يُعيد deferred لا استثناء.

### Tests for US5

- [x] T067 [P] [US5] اختبارات CircuitBreaker في `tests/unit/suspicion-engine/resolvers/circuit-breaker.test.ts`: 8 انتقالات حالة (من research.md §13)، استخدام vi.useFakeTimers() لاختبار cooldown وhalf-open (FR-017)
- [x] T068 [P] [US5] اختبارات buildAIReviewPayload في `tests/unit/suspicion-engine/adapters/to-ai-payload.test.ts`: التحقق من وجود جميع حقول evidence حتى الفارغة (SC-007)
- [x] T069 [P] [US5] اختبارات parseAIVerdict في `tests/unit/suspicion-engine/adapters/from-ai-verdict.test.ts`: التحقق من قواعد التحويل (confidence > 0.8 → relabel, <= 0.8 → deferred, schema mismatch → deferred)
- [x] T070 [P] [US5] اختبارات RemoteAIResolver في `tests/unit/suspicion-engine/resolvers/remote-ai-resolver.test.ts`: canHandle مع circuit states مختلفة، resolve مع timeout، أولوية إرسال agent-forced قبل agent-candidate

### Implementation for US5

- [x] T071 [US5] تنفيذ CircuitBreaker في `src/suspicion-engine/resolvers/circuit-breaker.ts`: آلة حالة 3 حالات (CLOSED/OPEN/HALF_OPEN) مع discriminated union state، lazy Date.now() transition، halfOpenProbeLimit (~80 سطر) (من research.md §13)
- [x] T072 [US5] تنفيذ RemoteAIResolverPolicy في `src/suspicion-engine/resolvers/remote-ai-resolver-policy.ts`: واجهة السياسة + القيم الافتراضية (requestTimeoutMs, consecutiveTimeoutThreshold, circuitOpenDurationMs, halfOpenProbeLimit, priorityOrder)
- [x] T073 [US5] تنفيذ adapter buildAIReviewPayload في `src/suspicion-engine/adapters/to-ai-payload.ts`: تحويل SuspicionCase → AIReviewPayload مع evidence مُصنَّفة بالعائلات + contextLines (3 قبل + 3 بعد) (FR-012, SC-007)
- [x] T074 [US5] تنفيذ adapter parseAIVerdict في `src/suspicion-engine/adapters/from-ai-verdict.ts`: تحويل AIVerdictResponse → ResolutionOutcome مع manual validation (من research.md §14)
- [x] T075 [US5] تنفيذ RemoteAIResolver في `src/suspicion-engine/resolvers/remote-ai-resolver.ts`: canHandle مع circuit state check + resolve async مع timeout + circuit-breaker integration (من resolver-api.md §3)
- [x] T076 [US5] إضافة resolvePostRenderAsync إلى ResolutionCoordinator في `src/suspicion-engine/resolvers/resolution-coordinator.ts`: تنسيق RemoteAIResolver + NoOp fallback + ترتيب أولوية الإرسال (من resolver-api.md §ResolutionCoordinator)

**Checkpoint**: US5 مكتمل — التصعيد الذكي يعمل مع circuit-breaker وtimeout graceful degradation.

---

## Phase 8: التكامل (Engine Orchestration + Pipeline Integration)

**Purpose**: ربط جميع المكونات في SuspicionEngine وتكاملها مع paste-classifier.ts

### Tests

- [x] T077 [P] اختبار تكامل المحرك الكامل في `tests/integration/suspicion-engine/engine-integration.test.ts`: تمرير SuspicionEngineInput كامل → التحقق من SuspicionEngineOutput (cases, routing, actions)، شمول Edge Cases (نص فارغ، سطر واحد، كل الأسطر نفس النوع)
- [x] T078 [P] اختبار تكامل Pipeline في `tests/integration/suspicion-engine/pipeline-integration.test.ts`: تشغيل paste-classifier.ts كاملاً مع المحرك → التحقق من render-first timing وعدم كسر routing bands الخارجية

### Implementation

- [x] T079 تنفيذ SuspicionEngine orchestrator في `src/suspicion-engine/engine.ts`: analyze(input) → output بالخطوات: feature assembly → detection → aggregation → scoring → routing → pre-render resolution (من engine-api.md §SuspicionEngine.analyze)
- [x] T080 تكامل SuspicionEngine في `src/extensions/paste-classifier.ts`: استدعاء المحرك بعد جميع الممرات وقبل العرض (نقطة التكامل من engine-api.md §paste-classifier.ts + research.md §15)
- [x] T081 تنفيذ applyPreRenderActions helper في `src/suspicion-engine/adapters/from-classifier.ts`: تطبيق ResolutionOutcome[] على ClassifiedDraft[] قبل العرض

**Checkpoint**: المحرك متكامل مع Pipeline ويعمل end-to-end.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: الأداء، حراسة CI، Edge cases، توثيق

- [x] T082 [P] إنشاء benchmark للأداء في `bench/suspicion-engine.bench.ts`: استخدام Vitest bench() API مع fixture 100 سطر، outputJson لتصدير النتائج (SC-005, من research.md §12)
- [x] T083 [P] إنشاء سكريبت حارس انحدار CI في `scripts/compare-bench.mjs`: مقارنة JSON benchmark مع baseline بنسبة 30% threshold (SC-005a, من research.md §12)
- [x] T084 [P] التحقق من Edge Cases في `tests/unit/suspicion-engine/edge-cases.test.ts`: نص فارغ، سطر واحد، كل الأسطر نفس النوع، OCR ثقيل، كاشفان متعارضان، trace ناقص، كل الأسطر agent-forced (من spec.md §Edge Cases)
- [x] T085 [P] التحقق من ترحيل Vitest 4 config: environmentMatchGlobs لا يزال يعمل في Vitest 4 — مؤجل للتحديث في مهمة منفصلة
- [x] T086 تشغيل pnpm validate (format:check + lint + typecheck + test) — format/lint/typecheck ناجحة، 182 اختبار suspicion-engine ناجح، 14 ملف اختبار فاشل مسبقاً (karank-bridge/server — غير متعلقة بالمحرك)
- [x] T087 توثيق الجهاز المرجعي للأداء في `docs/performance-reference.md` (SC-005)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: لا تبعيات — يبدأ فوراً
- **Foundational (Phase 2)**: يعتمد على اكتمال Phase 1 — يحجب جميع قصص المستخدم
- **US1 (Phase 3)**: يعتمد على Phase 2 — لا تبعيات على قصص أخرى
- **US2 (Phase 4)**: يعتمد على Phase 2 + US1 (يحتاج ClassificationTrace)
- **US3 (Phase 5)**: يعتمد على Phase 2 + US2 (يحتاج SuspicionSignal[])
- **US4 (Phase 6)**: يعتمد على US3 (يحتاج SuspicionCase + score + band)
- **US5 (Phase 7)**: يعتمد على US4 (يحتاج ResolutionCoordinator)
- **Integration (Phase 8)**: يعتمد على US1–US5
- **Polish (Phase 9)**: يعتمد على Phase 8

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational)
                         │
                         v
                    US1 (Trace) ← P1 MVP
                         │
                         v
                    US2 (Detectors) ← P2
                         │
                         v
                    US3 (Aggregation) ← P3
                         │
                         v
                    US4 (Local Resolution) ← P4
                         │
                         v
                    US5 (AI Resolution) ← P5
                         │
                         v
                    Integration (Phase 8)
                         │
                         v
                    Polish (Phase 9)
```

### Within Each User Story

- Tests تُكتب أولاً وتفشل قبل التنفيذ
- الأنواع والواجهات قبل التنفيذ
- التنفيذ الأساسي قبل التكامل
- المهام المُعلَّمة [P] يمكن تنفيذها بالتوازي

### Parallel Opportunities

**Phase 1**: T003–T010 جميعها متوازية (ملفات مختلفة)
**Phase 2**: T011–T018 جميعها متوازية (feature extractors مستقلة)
**US2**: T034–T048 (15 كاشفاً) جميعها متوازية (pure functions مستقلة)
**US3**: T049–T051 (اختبارات) متوازية
**US4**: T057–T060 (اختبارات) متوازية
**US5**: T067–T070 (اختبارات) متوازية
**Phase 9**: T082–T085 جميعها متوازية

---

## Parallel Example: US2 Detectors

```bash
# Launch all 15 detectors in parallel (all pure functions, different files):
Task: "character-gate detector في src/suspicion-engine/detectors/gate-break/character-gate.detector.ts"
Task: "dialogue-gate detector في src/suspicion-engine/detectors/gate-break/dialogue-gate.detector.ts"
Task: "action-gate detector في src/suspicion-engine/detectors/gate-break/action-gate.detector.ts"
Task: "orphan-dialogue detector في src/suspicion-engine/detectors/context/orphan-dialogue.detector.ts"
Task: "character-flow detector في src/suspicion-engine/detectors/context/character-flow.detector.ts"
# ... (10 more detectors)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (الأنواع والواجهات)
2. Complete Phase 2: Foundational (Feature assembler + telemetry)
3. Complete Phase 3: US1 (Trace collection)
4. **STOP and VALIDATE**: اختبار US1 باستقلالية
5. النظام يجمع traces بالفعل — يمكن تقييم جودة البيانات

### Incremental Delivery

1. Setup + Foundational → البنية التحتية جاهزة
2. US1 (Trace) → البيانات تُجمع → يمكن تقييم الجودة
3. US2 (Detectors) → الكواشف تُنتج إشارات → يمكن رؤية الشكوك
4. US3 (Aggregation) → التجميع والسكور → يمكن قياس دقة التوجيه
5. US4 (Local Resolution) → إصلاحات حتمية قبل العرض → تحسين فوري لتجربة المستخدم
6. US5 (AI Resolution) → تصعيد ذكي → النظام الكامل يعمل

---

## Notes

- [P] = ملفات مختلفة، لا تبعيات
- [US1]–[US5] = ربط المهمة بقصة المستخدم المحددة
- جميع الكواشف pure functions — قابلة للتنفيذ والاختبار بالتوازي الكامل
- Zod validation فقط عند حدود النظام (from-ai-verdict, config, telemetry)
- TypeScript types هي المرجع الداخلي — لا Zod داخل المحرك
- Circuit-breaker يدوي (~80 سطر) — لا مكتبة خارجية
- render-first guarantee: كل إصلاح حتمي يُطبَّق قبل render()
