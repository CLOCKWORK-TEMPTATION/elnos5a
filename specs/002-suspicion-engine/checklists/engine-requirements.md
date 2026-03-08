# Engine Requirements Quality Checklist: محرك الاشتباه (Suspicion Engine)

**Purpose**: اختبار جودة واكتمال ووضوح المتطلبات قبل التنفيذ — "Unit Tests for English"
**Created**: 2026-03-07
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [tasks.md](../tasks.md)
**Depth**: Standard | **Audience**: Reviewer (PR) | **Focus**: Completeness, Clarity, Consistency, Coverage

## Requirement Completeness

- [ ] CHK001 - Are all six pass types (forward, retroactive, reverse, viterbi, hybrid, schema-hint) explicitly listed with their expected passVote fields? [Completeness, Spec FR-001]
- [ ] CHK002 - Are all repair types (merge, split, partial-rewrite) enumerated with before/after field requirements? [Completeness, Spec FR-002]
- [ ] CHK003 - Is the full list of reasonCodes for each signalType documented or referenced? [Gap, Spec FR-004]
- [ ] CHK004 - Are the constraints mapping family to allowed signalTypes fully specified as a lookup table? [Completeness, Spec FR-004, Clarification Q1]
- [ ] CHK005 - Are all six SuspicionFeature categories (Gate, Context, RawQuality, CrossPass, Competition, Stability) defined with their constituent fields? [Completeness, Spec §Key Entities]
- [ ] CHK006 - Is the LineQuality scoring formula or its inputs explicitly defined? [Gap, Spec FR-001]
- [ ] CHK007 - Are requirements for the NoOp resolver documented (when and why it's used)? [Gap, Spec §Key Entities]
- [ ] CHK008 - Are telemetry event types and their required fields enumerated? [Completeness, Spec FR-014]
- [ ] CHK009 - Is the SuspicionEngineOutput.routing structure fully specified with all band counts? [Completeness, Spec FR-015]

## Requirement Clarity

- [ ] CHK010 - Is "sufficient confidence" for LocalRepairResolver quantified with a specific threshold? [Clarity, Spec FR-010]
- [ ] CHK011 - Is "critical gate-break" distinguished from non-critical with explicit criteria? [Clarity, Spec US4 Scenario 1]
- [ ] CHK012 - Is "clear alternative suggested" defined with measurable conditions (e.g., single alternative with confidence > X)? [Clarity, Spec US4 Scenario 1]
- [ ] CHK013 - Is "typical paste session (100-300 lines)" sufficiently bounded for SC-003 measurement? [Clarity, Spec SC-003]
- [ ] CHK014 - Is "equivalent or higher accuracy" in SC-003 quantified relative to a specific baseline? [Ambiguity, Spec SC-003]
- [ ] CHK015 - Are the six multi-factor scoring inputs (max critical, diversity, type repetition, pass conflict, raw quality, decision fragility) each defined with measurable formulas? [Clarity, Spec FR-006]
- [ ] CHK016 - Is "decision fragility" (هشاشة القرار الأصلي) defined with specific measurement criteria? [Ambiguity, Spec FR-006]
- [ ] CHK017 - Is "same timing cycle as render" (نفس الرهان الزمني للعرض) for repair-then-reclassify explicitly bounded in time? [Clarity, Spec US4 Scenario 2]

## Requirement Consistency

- [ ] CHK018 - Are the internal routes (6 values) and external bands (4 values) mapping consistent between FR-008 and the resolver-api contract? [Consistency, Spec FR-008, Contract resolver-api.md]
- [ ] CHK019 - Is SuspicionWeightPolicy field naming consistent between spec (§Key Entities), data-model, and plan? [Consistency]
- [ ] CHK020 - Are the three profile names (strict-import, balanced-paste, ocr-heavy) consistent across spec FR-007, data-model §6, and config tasks T010? [Consistency]
- [ ] CHK021 - Is the detector pure-function contract consistent between FR-003, constitution §VIII, and detector-interface contract? [Consistency, Spec FR-003, Constitution VIII]
- [ ] CHK022 - Are ResolutionOutcome.status enum values consistent between spec FR-013 and resolver-api contract? [Consistency, Contract resolver-api.md]
- [ ] CHK023 - Is the circuit-breaker state machine (closed/open/half-open) consistent between FR-017, clarification Q4, and research §13? [Consistency, Spec FR-017]

## Acceptance Criteria Quality

- [ ] CHK024 - Can SC-005 (200ms overhead for 100 lines) be objectively measured without the undefined "reference device"? [Measurability, Spec SC-005, Clarification Q3]
- [ ] CHK025 - Is SC-005a (30% CI regression guard) independently verifiable from SC-005? [Measurability, Spec Clarification Q3]
- [ ] CHK026 - Are SC-001 and SC-002 explicitly marked as blocked until PR-001 completion? [Measurability, Spec SC-001, SC-002, PR-001]
- [ ] CHK027 - Is SC-003 (25% max AI calls) measurable per-session or aggregate? [Ambiguity, Spec SC-003]
- [ ] CHK028 - Are US1-US5 acceptance scenarios each independently testable without requiring other stories? [Measurability]
- [ ] CHK029 - Is SC-006 (3 tests per detector family) specific enough about test type (unit/integration)? [Clarity, Spec SC-006]

## Scenario Coverage

- [ ] CHK030 - Are requirements defined for what happens when a pass is skipped (shortcut execution path)? [Coverage, Spec Edge Case 7]
- [ ] CHK031 - Are requirements defined for concurrent paste operations (two pastes in quick succession)? [Coverage, Gap]
- [ ] CHK032 - Are requirements specified for very long lines (>500 characters) in gate-break detection? [Coverage, Gap]
- [ ] CHK033 - Are requirements defined for mixed-language text (Arabic + English/French) impact on quality scoring? [Coverage, Gap]
- [ ] CHK034 - Are requirements defined for the transition from existing PostClassificationReviewer to new DetectorSuite? [Coverage, Gap]
- [ ] CHK035 - Are requirements specified for backward compatibility with existing pipeline-recorder.ts data? [Coverage, Gap]

## Edge Case Coverage

- [ ] CHK036 - Is the empty-text edge case requirement (cases=[], routing zeros) testable as specified? [Edge Case, Spec Edge Case 1]
- [ ] CHK037 - Is the single-line edge case requirement (gate-break only, context disabled) complete with all affected detectors listed? [Edge Case, Spec Edge Case 2]
- [ ] CHK038 - Is the OCR-heavy auto-detection requirement specified with triggering thresholds for arabicRatio/weirdCharRatio? [Edge Case, Spec Edge Case 4, Gap]
- [ ] CHK039 - Is the "all lines agent-forced" edge case requirement clear about which local fixes still apply? [Edge Case, Spec Edge Case 8]
- [ ] CHK040 - Are requirements defined for malformed/corrupted trace data (e.g., missing finalDecision)? [Edge Case, Gap]
- [ ] CHK041 - Are requirements defined for what happens when all detectors produce zero signals for a line? [Edge Case, Gap]

## Non-Functional Requirements

- [ ] CHK042 - Are memory consumption requirements specified for processing 300-line sessions? [Non-Functional, Gap]
- [ ] CHK043 - Is the telemetry layer's performance overhead requirement bounded? [Non-Functional, Spec FR-014]
- [ ] CHK044 - Are error propagation requirements defined (which errors are fatal vs. recoverable)? [Non-Functional, Gap]
- [ ] CHK045 - Is the Zod validation boundary requirement (system boundaries only) explicitly documented? [Non-Functional, Research §14]
- [ ] CHK046 - Are thread-safety/reentrancy requirements for SuspicionEngine.analyze() specified? [Non-Functional, Gap]

## Dependencies & Assumptions

- [ ] CHK047 - Is the dependency on existing paste-classifier.ts integration points fully documented? [Dependency, Research §15]
- [ ] CHK048 - Is the assumption that classifiedLines are read-only validated against actual paste-classifier behavior? [Assumption, Contract engine-api.md]
- [ ] CHK049 - Is the dependency on existing agent-review.ts types documented for RemoteAIResolver adapter? [Dependency, Gap]
- [ ] CHK050 - Is the assumption that Python karank engine is unaffected explicitly validated? [Assumption, Constitution IV]

## Notes

- هذا الـ checklist يختبر جودة المتطلبات نفسها (هل مكتوبة بشكل واضح وكامل ومتسق؟) وليس التنفيذ.
- 50 عنصرًا في 8 فئات تغطي أبعاد الجودة الرئيسية.
- العناصر المرجعية تشير إلى: spec.md (FR/SC/US/Edge Cases)، contracts/، research.md، constitution.md.
- العناصر المعلّمة بـ [Gap] تشير إلى متطلبات مفقودة قد تحتاج إضافة أو توثيق صريح كخارج النطاق.
