# Implementation Plan: محرك الاشتباه (Suspicion Engine)

**Branch**: `002-suspicion-engine` | **Date**: 2026-03-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-suspicion-engine/spec.md`

## Summary

بناء محرك اشتباه مستقل (Suspicion Engine) كـ Bounded Context يقع بين المصنّف الحالي وطبقات الحسم. المحرك يجمع أثر التصنيف من كل الممرات في trace موحد، يشغّل كواشف مستقلة لإنتاج إشارات typed، يجمّع الأدلة بسكور متعدد العوامل، يطبّق إصلاحات حتمية محلية قبل العرض، ويصعّد الحالات الغامضة إلى AI كـ adapter خارجي اختياري.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend/suspicion-engine), Python 3.12 (karank engine)
**Primary Dependencies**: React 19, Next.js 15, Tiptap 3, Express 5, Vitest 4
**Storage**: N/A (in-memory processing per classification session)
**Testing**: Vitest (unit + integration), Playwright (E2E)
**Target Platform**: Web (browser + Node.js backend on 127.0.0.1:8787)
**Project Type**: Web application module (new bounded context within existing app)
**Performance Goals**: render-first local fixes within 200ms overhead for 100 lines (SC-005)
**Constraints**: لا يكسر routing bands الخارجية (pass/local-review/agent-candidate/agent-forced)، AI اختياري لا إلزامي
**Scale/Scope**: 100-300 سطر لكل جلسة لصق، 5 عائلات كشف، 6 signalTypes، 4 resolvers

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| المبدأ                                 | الحالة    | الملاحظات                                                                  |
| -------------------------------------- | --------- | -------------------------------------------------------------------------- |
| I. Self-Containment                    | PASS      | المحرك يعمل بالكامل داخل `src/suspicion-engine/`، لا مسارات خارجية         |
| II. Pipeline Integrity (THREE-PHASE)   | PASS      | التصميم يفصل صراحةً: تصنيف → اشتباه → حسم كما يتطلب المبدأ                 |
| III. Strict TypeScript                 | PASS      | SuspicionSignal discriminated union strict، لا `any`/`unknown` في evidence |
| IV. Engine Bridge Pattern              | N/A       | المحرك الجديد TypeScript فقط، لا يمس Python bridge                         |
| V. Unified Entry Point                 | PASS      | المحرك يُدمج في paste-classifier.ts بعد classifyLines()                    |
| VI. Arabic-First RTL                   | N/A       | المحرك backend logic، لا واجهة مستخدم جديدة                                |
| VII. Simplicity & YAGNI                | JUSTIFIED | المحرك يُبنى متكاملاً من اليوم الأول (استثناء مُوثَّق في الدستور v2.0.0)   |
| VIII. Suspicion Engine Bounded Context | PASS      | التصميم يتبع حرفياً: 4 مجالات مستقلة، detectors pure، AI كـ adapter        |
| IX. Trace-First Evidence Model         | PASS      | ClassificationTrace + discriminated union evidence + لا reason نصي حر      |
| X. Deterministic-First Resolution      | PASS      | auto-local-fix قبل render، async AI بعده                                   |

**الحكم**: جميع البوابات ناجحة. لا انتهاكات.

## Project Structure

### Documentation (this feature)

```text
specs/002-suspicion-engine/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── engine-api.md    # SuspicionEngine input/output contract
│   └── resolver-api.md  # Resolver interface contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/suspicion-engine/
├── types.ts                    # Core types: signals, traces, cases, policies
├── engine.ts                   # SuspicionEngine main orchestrator
├── config.ts                   # Default profiles and policy factory
│
├── trace/
│   ├── classification-trace.ts # ClassificationTrace interface + builder
│   └── trace-collector.ts      # Collects passVotes from classification passes
│
├── features/
│   ├── feature-assembler.ts    # Converts trace → SuspicionFeature set
│   ├── gate-features.ts
│   ├── context-features.ts
│   ├── raw-quality-features.ts
│   ├── cross-pass-features.ts
│   └── competition-features.ts
│
├── detectors/
│   ├── detector-interface.ts   # Base detector contract
│   ├── gate-break/
│   │   ├── character-gate.detector.ts
│   │   ├── dialogue-gate.detector.ts
│   │   └── action-gate.detector.ts
│   ├── context/
│   │   ├── orphan-dialogue.detector.ts
│   │   ├── character-flow.detector.ts
│   │   └── sequence-violation.detector.ts
│   ├── corruption/
│   │   ├── split-character.detector.ts
│   │   ├── wrapped-dialogue.detector.ts
│   │   └── ocr-artifact.detector.ts
│   ├── cross-pass/
│   │   ├── reverse-conflict.detector.ts
│   │   ├── viterbi-conflict.detector.ts
│   │   └── multi-override.detector.ts
│   └── source/
│       ├── source-hint-mismatch.detector.ts
│       ├── quality-risk.detector.ts
│       └── import-profile.detector.ts
│
├── aggregation/
│   ├── evidence-aggregator.ts
│   └── suspicion-case-builder.ts
│
├── scoring/
│   ├── score-calculator.ts
│   ├── weighting-policy.ts
│   └── thresholds.ts
│
├── routing/
│   ├── routing-policy.ts
│   └── route-types.ts
│
├── resolvers/
│   ├── resolver-interface.ts
│   ├── local-deterministic-resolver.ts
│   ├── local-repair-resolver.ts
│   ├── remote-ai-resolver.ts
│   ├── remote-ai-resolver-policy.ts
│   ├── noop-resolver.ts
│   └── resolution-coordinator.ts
│
├── adapters/
│   ├── from-classifier.ts      # toClassifiedLineRecords()
│   ├── to-ai-payload.ts        # Build structured AI review payload
│   └── from-ai-verdict.ts      # Parse AI response → ResolutionOutcome
│
└── telemetry/
    ├── suspicion-metrics.ts
    └── suspicion-recorder.ts

tests/
├── unit/suspicion-engine/
│   ├── trace/
│   ├── detectors/
│   │   ├── gate-break/
│   │   ├── context/
│   │   ├── corruption/
│   │   ├── cross-pass/
│   │   └── source/
│   ├── aggregation/
│   ├── scoring/
│   ├── routing/
│   └── resolvers/
└── integration/suspicion-engine/
    ├── engine-integration.test.ts
    └── pipeline-integration.test.ts
```

**Structure Decision**: بنية modular داخل `src/suspicion-engine/` تتبع حرفياً تصميم الـ Bounded Context بأربعة مجالات. كل عائلة كواشف في مجلد مستقل. الاختبارات تعكس نفس البنية.

## Complexity Tracking

| Violation                                              | Why Needed                               | Simpler Alternative Rejected Because           |
| ------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------- |
| بناء المحرك كنظام متكامل من اليوم الأول                | الدستور v2.0.0 المبدأ VII يستثنيه صراحةً | البناء الجزئي يخلق هشاشة مخفية وتبعيات دائرية  |
| discriminated union per signalType للـ evidence        | FR-004 والمبدأ IX يشترطان strict typing  | `Record<string, unknown>` يعيد مشكلة النص الحر |
| RemoteAIResolverPolicy منفصلة عن SuspicionWeightPolicy | فصل منطق السكور عن المرونة التشغيلية     | دمجهما يخلط concerns ويصعّب الاختبار           |
