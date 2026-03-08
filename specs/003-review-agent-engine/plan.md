# Implementation Plan: Review Agent Engine (المراجعة النهائية)

**Branch**: `003-review-agent-engine` | **Date**: 2026-03-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-review-agent-engine/spec.md`

## Summary

بناء طبقة المراجعة النهائية (Final Review) التي تربط محرك الشك
(suspicion-engine) بمراجعة AI عبر Claude API. الطبقة تستقبل
`SuspicionCase[]` من محرك الشك، تبني حزمة أدلة غنية
(`FinalReviewRequestPayload`)، تُرسلها إلى `POST /api/final-review`،
وتُطبّق أوامر `relabel`/`split` المُعادة على المحرر.
التصميم يحافظ على توافق Command API v2 مع النظام القائم.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend) + Node.js ES Modules (backend `.mjs`)
**Primary Dependencies**: Tiptap 3, Express 5, Anthropic SDK, axios, pino
**Storage**: N/A (stateless — لا قاعدة بيانات)
**Testing**: Vitest 4.0 (unit + integration), Playwright (E2E)
**Target Platform**: Web browser (frontend) + Node.js server on 127.0.0.1:8787 (backend)
**Project Type**: Web application (React 19 + Next.js 15 frontend, Express 5 backend)
**Performance Goals**: ≤30s لمراجعة 50 سطرًا مشبوهًا (SC-002)
**Constraints**: AGENT_REVIEW_MAX_RATIO سقف للأسطر المُرسلة، mock mode للاختبارات
**Scale/Scope**: نصوص سيناريو 500–5000 سطر، 1–50 سطر مشبوه لكل عملية

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Evidence                                                                                                                                                                                           |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| I. Strict TypeScript             | ✅ Pass | أنواع `FinalReviewRequestPayload` و `FinalReviewSuspiciousLinePayload` مُعرّفة بـ readonly + أنواع حقيقية من suspicion-engine. لا `any`/`unknown`.                                                 |
| II. Arabic-First Schema Fidelity | ✅ Pass | 9 أنواع عناصر فقط في `ALLOWED_LINE_TYPES`. `normalizeSceneHeaderDecisionType` يُطبّع `scene_header_1/2` إلى `scene_header_top_line`. `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS` يحتوي hardRules بالعربية. |
| III. Pipeline Layering           | ✅ Pass | المراجعة النهائية هي الطبقة 6 — بعد كل الطبقات الحتمية. routing bands محترمة. `AGENT_REVIEW_MAX_RATIO` يحد الأسطر المُرسلة.                                                                        |
| IV. Command API Compatibility    | ✅ Pass | `relabel` و `split` فقط. `requiredItemIds` و `forcedItemIds` مُلزمة. التطبيع يتجاهل itemIds غير موجودة.                                                                                            |
| V. Test-First Validation         | ✅ Pass | `FINAL_REVIEW_MOCK_MODE=success                                                                                                                                                                    | error` يُمكّن الاختبارات بدون API. SC-006 يضمن عدم تراجع الدقة (93.7%). |
| VI. Simplicity & YAGNI           | ✅ Pass | لا طبقات إضافية. `payload-builder.ts` ملف واحد. الخادم ملف واحد (`final-review.mjs`).                                                                                                              |

**Gate Result**: ✅ جميع المبادئ مُجتازة. لا انتهاكات.

## Complexity Tracking

_مطلوب بموجب مبدأ VI (YAGNI): أي تعقيد إضافي يجب توثيقه هنا مع المبرّر._

| المهمة               | الانحراف                                      | المبرّر                                                                                                                                          |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| T020 (REST fallback) | إضافة مسار HTTP مباشر كـ fallback عند فشل SDK | SDK قد يفشل بأخطاء داخلية (مثل proxy/firewall issues). REST fallback يضمن التعافي بدون تبعية كاملة على SDK. التعقيد محدود: دالة واحدة ~30 سطرًا. |

## Project Structure

### Documentation (this feature)

```text
specs/003-review-agent-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── final-review-api.md
│   └── payload-builder-api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── types/
│   └── final-review.ts          # FinalReviewRequestPayload + types
├── final-review/
│   └── payload-builder.ts       # buildFinalReviewSuspiciousLinePayload
├── extensions/
│   ├── paste-classifier.ts      # تعديل: applyRemoteAgentReviewV2 + routing
│   └── paste-classifier-config.ts  # تعديل: FINAL_REVIEW_ENDPOINT

server/
├── final-review.mjs             # requestFinalReview + validation + parsing
├── controllers/
│   └── final-review-controller.mjs  # HTTP handler
└── routes/
    └── index.mjs                # تعديل: إضافة /api/final-review route

tests/
├── unit/
│   ├── final-review-payload-builder.test.ts
│   ├── final-review-validation.test.ts
│   └── final-review-command-parser.test.ts
└── integration/
    └── final-review-pipeline.test.ts
```

**Structure Decision**: Web application pattern — frontend (`src/`) + backend (`server/`).
الميزة تمتد عبر الجانبين: بناء الحزمة في frontend، معالجة AI في backend.
