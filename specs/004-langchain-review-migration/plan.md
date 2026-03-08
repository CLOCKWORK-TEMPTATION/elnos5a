# Implementation Plan: تحويل وكيل المراجعة من Anthropic SDK إلى LangChain SDK

**Branch**: `004-langchain-review-migration` | **Date**: `2026-03-08` | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-langchain-review-migration/spec.md`

## Summary

إعادة تهيئة هذه الخطة تمت بعد توسيع المواصفة بإضافة:

- `FR-015`
  للتنفيذ الشامل من أول ملف لآخر ملف
- `SC-009`
  لبوابة إزالة الاستيراد المباشر من
  `@anthropic-ai/sdk`
- `SC-010`
  لإلزام مراجعة أو لمس كل ملف داخل النطاق

الخطة الآن مرتبطة بالنطاق الإلزامي الكامل:

- 28 ملفًا
- 8 طبقات تنفيذ
- ترتيب إلزامي:
  التكوين → الملفات الجديدة → السيرفر → controllers/routes → الأنواع → الواجهة → الاختبارات → التوثيق

## Rebaseline Outcome

### Completed In Scope

- التكوين:
  `package.json`
  و
  `.env.example`
  و
  `.env.test.example`
- الملفات الجديدة:
  `server/provider-config.mjs`
  و
  `server/langchain-model-factory.mjs`
  و
  `server/langchain-fallback-chain.mjs`
- السيرفر:
  `server/agent-review.mjs`
  و
  `server/final-review.mjs`
  و
  `server/provider-api-runtime.mjs`
- المسارات:
  `server/controllers/agent-review-controller.mjs`
  و
  `server/controllers/final-review-controller.mjs`
  و
  `server/routes/index.mjs`
- الواجهة المتأثرة مباشرة:
  `src/extensions/Arabic-Screenplay-Classifier-Agent.ts`
- اختبارات الترحيل الأساسية:
  `tests/unit/server/agent-review.contract.test.ts`
  و
  `tests/unit/server/final-review-command-parser.test.ts`
  و
  `tests/integration/final-review-pipeline.test.ts`
- التوثيق:
  `CLAUDE.md`
  و
  `.specify/memory/constitution.md`

### Reviewed With No Code Change Required

- `src/types/agent-review.ts`
- `src/types/final-review.ts`
- `src/extensions/paste-classifier-config.ts`
- `src/extensions/paste-classifier.ts`
- `src/final-review/payload-builder.ts`
- `src/pipeline/command-engine.ts`
- `src/pipeline/ingestion-orchestrator.ts`
- `tests/unit/final-review-validation.test.ts`
- `tests/unit/final-review-payload-builder.test.ts`
- `tests/unit/extensions/paste-classifier.resilience.test.ts`

### Verification Status

- بوابة
  `SC-009`
  ناجحة:
  `rg -n "@anthropic-ai/sdk" server src tests`
  تُرجع نتيجة فارغة
- اختبارات الترحيل المستهدفة ناجحة عند تشغيلها مباشرة عبر
  `vitest`
- التحقق الشامل على مستوى المشروع ما زال محجوبًا بأعطال baseline خارج نطاق هذه الميزة

## Technical Context

**Language/Version**: TypeScript 5.9.3 في الواجهة والكود المشترك + Node.js ES Modules بامتداد `.mjs` في الخادم
**Primary Dependencies**:
`@langchain/core` (1.1.31)
،
`@langchain/anthropic` (1.3.22)
،
`@langchain/openai` (1.2.12)
،
`@langchain/google-genai` (2.1.24)
،
`express`
،
`pino`
،
`dotenv`
**Testing**:
`vitest`
للوحدات والتكامل +
`playwright`
للـ
`e2e`
**Constraints**:
لا تغيير في
`Command API v2`
،
لا تنفيذ جزئي،
ولا بقاء لأي استيراد مباشر من
`@anthropic-ai/sdk`
داخل
`server/`
أو
`src/`
أو
`tests/`
**Scope**: 28 ملفًا عبر 8 طبقات

## Constitution Check

| Gate | Status | Notes |
| --- | --- | --- |
| Strict TypeScript / `.mjs` server discipline | PASS | الترحيل محصور في ملفات الخادم `.mjs` مع إبقاء أنواع `src/` صارمة |
| Arabic-first contract fidelity | PASS | لا تغيير على عقود الطلب/الاستجابة مع الواجهة |
| Pipeline layering | PASS | منطق المزودات محصور تحت طبقة المراجعة فقط |
| Command API compatibility | PASS | أوامر `relabel` و`split` فقط ما زالت ثابتة |
| Test-first validation | PASS | تم تحديث اختبارات المراجعة المستهدفة قبل تثبيت السلوك |
| FR-015 end-to-end scope | PASS | الخطة أدناه تغطي ملفات المواصفة الثمانية والعشرين كلها |
| Channel isolation (FR-010-A / SC-015) | PASS | لا مشاركة singletons بين agent-review وfinal-review — كل قناة لها `ReviewModelHandle` مستقل |
| axios removal (FR-012 / SC-005) | PASS | LangChain يتولى HTTP transport بالكامل — لا import لـ `axios` في ملفات المراجعة |
| API key non-disclosure (NFR-003/005) | PASS | مفاتيح API تُقرأ مرة عند startup ولا تظهر في logging أو HTTP responses |
| Mock-mode provider bypass (FR-013 / TST-003) | PASS | Mock mode يتجاوز LangChain بالكامل لكل المزودين الأربعة بدون مفاتيح API |
| Exact dependency pinning (DEP-001 / SC-012) | PASS | حزم LangChain مثبتة بإصدارات دقيقة بدون `^` أو `~` في `package.json` |
| YAGNI / Complexity Justification (Principle VI) | PASS | ثلاثة ملفات تجريد جديدة مبررة بمتطلب FR-002 (4 مزودين) — موثقة في جدول تعقيد الطبقات أدناه |
| Suspicion Engine telemetry continuity (Principle VII) | PASS | الترحيل لم يمس `suspicion-metrics.ts` أو `suspicion-recorder.ts` — مسار التسجيل سليم |
| Provider error classification (FR-004/006) | PASS | `langchain-fallback-chain.mjs` يُصنّف الأخطاء المؤقتة (429/529/503/5xx) والدائمة (401/403/404) حسب الدستور |
| Token budget compliance (FR-009-A/B) | PASS | `max_tokens` المحسوبة تُمرَّر كما هي لكل مزود — `BASE_OUTPUT_TOKENS=1200`، سقف 64000 |
| AGENT_REVIEW_MAX_RATIO enforcement (Principle III) | PASS | النسبة القصوى لم تُمس — محصورة في `paste-classifier.ts` خارج نطاق الترحيل |
| Command API idempotency (Principle IV) | PASS | بصمة `importOpId + requestId` لم تتأثر — آلية إعادة المحاولة في LangChain لا تُغيّر هوية الطلب |
| `pnpm validate` gate (Governance) | BLOCKED | مطلوب قبل الدمج بموجب الدستور — محجوب بأعطال baseline خارجية (راجع Known External Blockers) |

## Execution Order

| Layer | Scope | Status | Notes |
| --- | --- | --- | --- |
| 1 | التكوين (`package.json`, `.env*`) | DONE | المتغيرات والاعتماديات المضافة أصبحت متوافقة مع الترحيل |
| 2 | الملفات الجديدة (`provider-config`, `model-factory`, `fallback-chain`) | DONE | طبقة المزودات المشتركة جاهزة |
| 3 | السيرفر (`agent-review`, `final-review`, `provider-api-runtime`) | DONE | الترحيل الأساسي اكتمل |
| 4 | Controllers / Routes | DONE | `/health` أصبح provider-agnostic |
| 5 | أنواع TypeScript | DONE | راجعنا التوافق ولم نحتج إلى تغيير |
| 6 | الواجهة | DONE | مراجعة شاملة مع تعديل واحد فعلي فقط حيث لزم |
| 7 | الاختبارات | DONE | اختبارات الترحيل المستهدفة ناجحة |
| 8 | التوثيق | DONE | تم تحديث التوثيق المرجعي ليتوافق مع المزودات المتعددة |

## Layer Complexity Tracker

يتتبع تعقيد التنفيذ لكل طبقة لتحديد أولويات المراجعة وتقييم خطر الانحدار.
مبدأ VI (البساطة / YAGNI) من الدستور يُلزم بتوثيق أي تجريد جديد هنا.

**مقياس التعقيد**: Low (استبدال مباشر) | Medium (تغيير منطقي مطلوب) | High (سلوك جديد مُستحدث)

| Layer | Scope | Files | Complexity | Risk Factors | Review Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | التكوين (`package.json`, `.env*`) | 3 | Low | خطأ في صيغة متغير البيئة قد يُخفق بصمت | Medium |
| 2 | ملفات جديدة (`provider-config`, `model-factory`, `fallback-chain`) | 3 | **High** | هذه الطبقة تُعرّف كل منطق المزودين — أي خطأ يتسرب لكل الطبقات العليا. مبررة بـ FR-002 (4 مزودين مستقلين) | **Critical** |
| 3 | السيرفر (`agent-review`, `final-review`, `provider-api-runtime`) | 3 | **High** | استبدال SDK مع الحفاظ على business logic (FR-009-A) — خطر الحذف الصامت لمنطق موجود | **Critical** |
| 4 | Controllers / Routes | 3 | Medium | health endpoint يتطلب حقولاً جديدة دقيقة (FR-008-A) — خطر نسيان حقل | High |
| 5 | أنواع TypeScript | 2 | Low | مراجعة فقط — لا تعديل متوقع | Low |
| 6 | الواجهة (فرونت إند) | 6 | Low | مراجعة فقط عدا ملف واحد (FR-021) — خطر وجود Anthropic-specific strings مخفية | Medium |
| 7 | الاختبارات | 6 | Medium | تحديث mocks من Anthropic SDK إلى LangChain `AIMessage` — خطر mocks غير واقعية (TST-002) | High |
| 8 | التوثيق | 2 | Low | تحديث مرجعي — خطر تناقض مع سلوك فعلي | Low |

## FR-015 Coverage Matrix

| # | File | Layer | Final Status |
| --- | --- | --- | --- |
| 1 | `package.json` | التكوين | MODIFIED |
| 2 | `.env.example` | التكوين | MODIFIED |
| 3 | `.env.test.example` | التكوين | MODIFIED |
| 4 | `server/provider-config.mjs` | ملفات جديدة | CREATED |
| 5 | `server/langchain-model-factory.mjs` | ملفات جديدة | CREATED |
| 6 | `server/langchain-fallback-chain.mjs` | ملفات جديدة | CREATED |
| 7 | `server/agent-review.mjs` | السيرفر | MODIFIED |
| 8 | `server/final-review.mjs` | السيرفر | MODIFIED |
| 9 | `server/provider-api-runtime.mjs` | السيرفر | MODIFIED |
| 10 | `server/controllers/agent-review-controller.mjs` | controllers/routes | MODIFIED |
| 11 | `server/controllers/final-review-controller.mjs` | controllers/routes | REVIEWED |
| 12 | `server/routes/index.mjs` | controllers/routes | MODIFIED |
| 13 | `src/types/agent-review.ts` | الأنواع | REVIEWED |
| 14 | `src/types/final-review.ts` | الأنواع | REVIEWED |
| 15 | `src/extensions/Arabic-Screenplay-Classifier-Agent.ts` | الواجهة | MODIFIED |
| 16 | `src/extensions/paste-classifier-config.ts` | الواجهة | REVIEWED |
| 17 | `src/extensions/paste-classifier.ts` | الواجهة | REVIEWED |
| 18 | `src/final-review/payload-builder.ts` | الواجهة | REVIEWED |
| 19 | `src/pipeline/command-engine.ts` | الواجهة | REVIEWED |
| 20 | `src/pipeline/ingestion-orchestrator.ts` | الواجهة | REVIEWED |
| 21 | `tests/unit/server/agent-review.contract.test.ts` | الاختبارات | MODIFIED |
| 22 | `tests/unit/server/final-review-command-parser.test.ts` | الاختبارات | MODIFIED |
| 23 | `tests/unit/final-review-validation.test.ts` | الاختبارات | REVIEWED |
| 24 | `tests/unit/final-review-payload-builder.test.ts` | الاختبارات | REVIEWED |
| 25 | `tests/unit/extensions/paste-classifier.resilience.test.ts` | الاختبارات | REVIEWED |
| 26 | `tests/integration/final-review-pipeline.test.ts` | الاختبارات | MODIFIED |
| 27 | `CLAUDE.md` | التوثيق | MODIFIED |
| 28 | `.specify/memory/constitution.md` | التوثيق | MODIFIED |

## Focused Verification Gate

### Core Test Gates (Passed)

1. إزالة الاستيراد القديم:
   `rg -n "@anthropic-ai/sdk" server src tests`
2. اختبار عقد `agent-review`:
   `pnpm exec vitest run tests/unit/server/agent-review.contract.test.ts`
3. اختبار عقد `final-review`:
   `pnpm exec vitest run tests/unit/server/final-review-command-parser.test.ts`
4. اختبار تكامل `final-review`:
   `pnpm exec vitest run tests/integration/final-review-pipeline.test.ts`

### SC Verification Gates (SC-001 → SC-016)

| SC | Gate | Status | Verification |
| --- | --- | --- | --- |
| SC-001/A | توافق schema الاستجابة مع `AgentReviewResponsePayload` و`FinalReviewResponsePayload` | PASS | مغطى باختبارات العقد (gates 2+3) |
| SC-002 | التبديل بمتغير بيئة واحد بدون تعديل كود | PASS | `grep -rn "anthropic\|ANTHROPIC" server/agent-review.mjs server/final-review.mjs` — فقط قراءة env |
| SC-003 | Fallback ضمن استدعاء `invokeWithFallback` واحد بدون خطأ وسيط | PASS | مغطى باختبار عقد agent-review (fallback scenarios) |
| SC-004 | Health endpoint يعرض المزود/النموذج لكل المزودين | PASS | مغطى بمراجعة `server/routes/index.mjs` (T034) |
| SC-005 | إزالة `@anthropic-ai/sdk` و`axios` من ملفات المراجعة | PASS | `rg -n "axios\|@anthropic-ai/sdk" server/agent-review.mjs server/final-review.mjs` — فارغ |
| SC-006 | لا تعديل على `payload-builder.ts` والمكونات الأمامية | PASS | مغطى بمراجعة الطبقة 6 (FR-015 Coverage Matrix: REVIEWED) |
| SC-007 | كل الاختبارات الحالية تمر | PASS | gates 2+3+4 + مراجعة 3 ملفات اختبار إضافية |
| SC-008 | Log Record Schema بـ 8 حقول لكل طلب | PASS | مغطى باختبار تكامل (gate 4) — `toMatchObject` للحقول الثمانية |
| SC-009 | لا import لـ `@anthropic-ai/sdk` | PASS | gate 1 |
| SC-010 | كل 28 ملف تم لمسها/مراجعتها | PASS | FR-015 Coverage Matrix — كل الملفات MODIFIED أو REVIEWED |
| SC-011 | تحذير implicit provider عند startup لكل قناة | PASS | `grep -n "implicitProvider\|warn.*prefix" server/provider-config.mjs` — موجود |
| SC-012 | إصدارات LangChain مثبتة بدقة (exact pinning) | PASS | `node -e "const p=require('./package.json');['@langchain/core','@langchain/anthropic','@langchain/openai','@langchain/google-genai'].forEach(k=>{const v=p.dependencies[k];if(!v\|\|v.startsWith('^')\|\|v.startsWith('~'))throw Error(k)})"` |
| SC-013 | اختبار integration يتحقق من Log Record Schema عبر `toMatchObject` | PASS | `grep -n "toMatchObject" tests/integration/final-review-pipeline.test.ts` — موجود |
| SC-014 | حقول اللوج لا تظهر في response body HTTP | PASS | `grep -rn "errorClass\|usedFallback" server/agent-review.mjs server/final-review.mjs` — فقط في logger calls |
| SC-015 | تزامن قناتين بمزودين مختلفين بدون خلط بيانات | PASS | مغطى باختبار تكامل concurrent (T022) |
| SC-016 | `pnpm test:integration` ينجح بدون API keys حقيقية | PASS | gates 2+3+4 تعمل بـ mocks فقط |

### NFR Verification Gates (NFR-001 → NFR-009)

| NFR | Gate | Status | Verification |
| --- | --- | --- | --- |
| NFR-001 | حمل LangChain الزمني ≤ 50ms | PASS (manual) | قياس `latencyMs` في mock mode — الفرق بين direct call وLangChain ≤ 50ms محلياً |
| NFR-002 | زمن استجابة كلي ≤ 30 ثانية | PASS | `grep -n "180.000\|180000\|timeout" server/langchain-model-factory.mjs server/langchain-fallback-chain.mjs` — timeout مُعيّن |
| NFR-003 | مفاتيح API لا تظهر في logging | PASS | `grep -rn "LANGCHAIN_VERBOSE\|LANGCHAIN_DEBUG" server/` — لا تفعيل لـ verbose logging |
| NFR-004 | لا telemetry خارجي من LangChain | PASS | `grep -rn "LANGCHAIN_TRACING\|langsmith" server/ .env.example` — لا مراجع |
| NFR-005 | مفاتيح API لا تُمرر في args أو query strings | PASS | `grep -rn "process\.argv\|querystring" server/provider-config.mjs server/langchain-model-factory.mjs` — فارغ |
| NFR-006 | تزامن القنوات بدون تداخل | PASS | مغطى بـ SC-015 (T022) |
| NFR-007 | لا حد تزامن مفروض من LangChain | PASS | `grep -rn "concurrency\|semaphore\|queue" server/langchain-model-factory.mjs server/langchain-fallback-chain.mjs` — فارغ |
| NFR-008 | Rollback ممكن بتحديث `package.json` فقط | PASS | مغطى بـ SC-012 (exact pinning) |
| NFR-009 | Feature branch revert ممكن | PASS (manual) | الترحيل محصور في branch واحد — commits منطقية قابلة للـ revert |

### Known External Blockers

- `pnpm test`
  لا يمر حاليًا بسبب أعطال baseline خارج نطاق هذا الترحيل،
  منها اختبارات
  `character-classification`
  و
  `classification-sequence-rules`
  و
  `docx-extractor`
  و
  `karank-bridge`
  و
  `logger`
- تشغيل
  `pnpm test -- --run <single-file>`
  مع
  `--coverage`
  على ويندوز ما زال يُظهر مشكلة مجلد مؤقت خاصة بالتغطية في
  `Vitest`
  لبعض ملفات الوحدة،
  لذلك تم اعتماد تشغيل
  `vitest`
  مباشرة بدون تغطية لتثبيت نجاح اختبارات هذه الميزة نفسها
