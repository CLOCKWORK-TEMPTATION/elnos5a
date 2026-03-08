# Research: محرك الاشتباه (Suspicion Engine)

**Date**: 2026-03-07
**Status**: Complete (لا توجد عناصر NEEDS CLARIFICATION متبقية)

---

### 1. استراتيجية جمع الآثار (Trace Collection Strategy)

**القرار**: جمع `ClassificationTrace` بشكل تدريجي (incrementally) أثناء مرور كل طبقة من طبقات التصنيف.

**المبرر**: كل pass يُنتج نتيجته بالفعل؛ إضافة تسجيل الأثر (trace recording) خلاله تُعدّ إضافةً منخفضة التكلفة (low-overhead) ولا تُغيّر منطق التصنيف القائم. يُتيح هذا النهج الاحتفاظ بالحالات الوسيطة (intermediate states) بدقة لكل مرحلة.

**البدائل المدروسة**: إعادة بناء الأثر بعد التصنيف (post-hoc trace reconstruction) — مرفوض لأنه يفقد الحالات الوسيطة بين الـ passes ويجعل التشخيص الدقيق مستحيلاً.

---

### 2. نمط معمارية الكاشفات (Detector Architecture Pattern)

**القرار**: كاشفات (detectors) كدوال نقية (pure functions) مُجمَّعة حسب العائلة (family)، كل منها يستقبل `(trace, line, context)` ويُعيد `SuspicionSignal[]`.

**المبرر**: يُمكّن هذا النمط من اختبار كل كاشف بمعزل تام (independent testing)، وتنفيذها بالتوازي (parallel execution)، وإضافة كاشفات جديدة دون التأثير على الموجودة. الدوال النقية لا تحمل حالة داخلية (state) وبالتالي أسهل في التحقق والصيانة.

**البدائل المدروسة**:

- نمط سلسلة المسؤولية (chain-of-responsibility) — مرفوض: يُنشئ تشابكاً (coupling) بين الكاشفات يُصعّب التعديل المستقل.
- كشف مركزي في ملف واحد (centralized detection in one file) — مرفوض: يُنتج كوداً أحادياً ضخماً (monolithic) صعب الاختبار والتطوير.

---

### 3. استراتيجية تحديد نوع الدليل (Evidence Typing Strategy)

**القرار**: استخدام discriminated union صارم مُفتاح بحسب `signalType`، مع واجهات أدلة مخصصة لكل نوع إشارة (`GateBreakEvidence`، `AlternativePullEvidence`، إلخ).

**المبرر**: تشترط FR-004 ومبدأ الدستور IX وجود أدلة ذات أنواع محددة برمجياً (typed evidence) لتحليل آلي دقيق. الـ discriminated union يجعل المُصرِّف (compiler) يُنفّذ صحة الأدلة في وقت التصنيف.

**البدائل المدروسة**:

- `Record<string, unknown>` — مرفوض: يُلغي الهدف الكامل من كتابة الأنواع ويُفقد أمان الوقت التصميمي.
- خريطة مفتوحة محدودة `Record<string, string|number|boolean>` — مرفوض: توفر أماناً منخفضاً غير كافٍ للتحليل البرمجي المطلوب.

---

### 4. تصنيف الإشارات: العائلة مقابل نوع الإشارة (Signal Taxonomy: family vs signalType)

**القرار**: حقلان منفصلان: `family` (5 فئات عامة للتجميع البنيوي) و`signalType` (6 قيم تشغيلية للتسجيل).

**المبرر**: الفصل بين التجميع البنيوي وسلوك التسجيل يُمكّن من توسعة `signalType` مستقبلاً دون كسر المستهلكين (consumers). كل حقل يؤدي وظيفة مختلفة: `family` للتنظيم، `signalType` لمنطق الأوزان.

**البدائل المدروسة**:

- حقل واحد يُطابق أسماء المواصفة (spec names) — مرفوض: غير كافٍ لدعم منطق التسجيل المتعدد الطبقات.
- حقل واحد يُطابق أسماء PLAN — مرفوض: يكسر التجميع البنيوي ويُربك المستهلكين.

---

### 5. خوارزمية التسجيل متعدد العوامل (Multi-Factor Scoring Algorithm)

**القرار**: درجة مركّبة مُرجَّحة (weighted composite score) تأخذ بعين الاعتبار: ذروة الإشارة الحرجة (critical signal peak)، تنوع العائلات (family diversity)، تكرار اقتراح الأنواع (repeated type suggestions)، كثافة التعارض بين الـ passes (cross-pass conflict intensity)، جودة النص الخام (raw text quality)، وهشاشة القرار (decision fragility).

**المبرر**: ترفض PLAN.md صراحةً أسلوبَي `max()` و`sum()` لأنهما يُهملان بُعداً أو يُوازنان بصورة غير ملائمة. التركيبة المُرجَّحة تعكس الأهمية النسبية لكل مؤشر.

**البدائل المدروسة**:

- `max(signals)` — مرفوض: يتجاهل تنوع الإشارات والمعطيات المتعددة، ويُضخّم إشارة واحدة.
- `sum(signals)` — مرفوض: لا يُرجّح الأهمية النسبية ويُعامل كل إشارة بالقدر ذاته.

---

### 6. تصميم سياسة التوجيه (Routing Policy Design)

**القرار**: 6 مسارات داخلية (internal routes) تُعيَّن إلى 4 نطاقات خارجية (external bands)، مع إتمام `auto-local-fix` و`repair-then-reclassify` قبل العرض (pre-render).

**المبرر**: يُلزم مبدأ الدستور X والشرط SC-005 بضمان العرض الأول (render-first guarantee): لا يرى المستخدم أخطاء قابلة للإصلاح تلقائياً. المسارات التي تسبق العرض تُحسّن التجربة دون تأخير مرئي.

**البدائل المدروسة**:

- جميع المسارات بعد العرض (all routes post-render) — مرفوض: يعرض للمستخدم أخطاء كان يجب إصلاحها في الخفاء، مما يُخلّ بجودة التجربة.

---

### 7. نمط تكامل محلل الذكاء الاصطناعي (AI Resolver Integration Pattern)

**القرار**: محوّل خارجي اختياري (optional external adapter) مزوّد بقاطع دائرة (circuit-breaker) ضمن `RemoteAIResolverPolicy`، مع حمولة أدلة منظّمة (structured evidence payload).

**المبرر**: يُوجب مبدأ الدستور VIII معاملة الذكاء الاصطناعي كمحوّل اختياري لا كمكوّن جوهري. يشترط FR-017 وجود قاطع دائرة. هذا النمط يُحقق كليهما: المرونة التشغيلية والتدهور السلس (graceful degradation) عند تعطّل الخدمة الخارجية.

**البدائل المدروسة**:

- تشابك مباشر مع الذكاء الاصطناعي (tight coupling to AI) — مرفوض: هشّ وباهظ التكلفة، يُفشل الكل عند تعطّل جزء.
- إهمال الذكاء الاصطناعي كلياً (no AI at all) — مرفوض: يُفقد القدرة على حل الحالات المعقدة التي تتجاوز قدرة القواعد المحلية.

---

### 8. استراتيجية قياس الأداء (Performance Measurement Strategy)

**القرار**: نهج مزدوج: SC-005 كـ SLA مطلق على عتاد مرجعي (reference hardware)، و SC-005a كحارس انحدار نسبي بنسبة 30% في بيئة CI.

**المبرر**: الـ SLA المطلق يُحدد الهدف المنتَجي الفعلي للمستخدم. الحارس النسبي يحمي CI من التراجع دون الاعتماد على عتاد ثابت غير متوفر في بيئات البناء. كلاهما ضروري ولا يُغني أحدهما عن الآخر.

**البدائل المدروسة**:

- مطلق فقط (absolute only) — مرفوض: يجعل اختبارات CI غير موثوقة لاعتمادها على سرعة الجهاز.
- نسبي فقط (relative only) — مرفوض: لا يضمن تجربة المستخدم الفعلية ولا يُحدد سقفاً واضحاً للأداء.

---

### 9. استراتيجية المتن المرجعي (Reference Corpus Strategy)

**القرار**: مهمة متطلب مسبق مستقلة (PR-001) تُنتج ملف JSONL يحتوي 200 سطر مع تصنيفات ذهبية (gold labels).

**المبرر**: المتن التقييمي مستقل عن تنفيذ المحرك؛ دمجهما يخلط بين تأليف البيانات والبرمجة ويُصعّب الصيانة والتحقق المستقل من الدقة.

**البدائل المدروسة**:

- بناء المتن كجزء من الميزة (build corpus as part of feature) — مرفوض: يخلط بين مرحلة تأليف البيانات ومرحلة التنفيذ، ويُصعّب إعادة استخدام المتن.
- إسقاط أهداف الدقة (drop accuracy targets) — مرفوض: يُفقد معايير النجاح القابلة للقياس ويُجعل التحقق من الجودة ذاتياً وغير موضوعي.

---

### 10. تهيئة سياسة الأوزان (Weight Policy Configuration)

**القرار**: `SuspicionWeightPolicy` للتسجيل، و`RemoteAIResolverPolicy` للمرونة التشغيلية، مع 3 ملفات تهيئة (profiles): `strict-import`، `balanced-paste`، `ocr-heavy`.

**المبرر**: الفصل بين مخاوف التسجيل والمرونة التشغيلية يُطبّق مبدأ المسؤولية الواحدة (Single Responsibility). الملفات الثلاثة تعكس الخصائص المختلفة لمصادر الاستيراد: النص المستورد الصارم، النص الملصوق المتوازن، والنص المُستخرَج بـ OCR ذو الضوضاء العالية.

**البدائل المدروسة**:

- سياسة أحادية شاملة (single monolithic policy) — مرفوض: تخلط بين المخاوف وتُصعّب الضبط الدقيق لكل سيناريو.
- أوزان مُضمَّنة في الكود (hardcoded weights) — مرفوض: تستلزم تعديل الكود عند كل ضبط، وتُعيق التحسين التجريبي والضبط الميداني.

---

## بحث إضافي: الإصدارات والأنماط الفعلية

> أُجري هذا البحث بتاريخ 2026-03-07 لتحديث القرارات أعلاه بتفاصيل الإصدارات الفعلية المُستخدمة في المشروع (`package.json`): TypeScript ^5.7.0، Vitest ^4.0.18، Zod ^3.25.76.

---

### 11. أنماط TypeScript 5.7 لـ Discriminated Unions (إصدار ^5.7.0)

**القرار**: استخدام ميزات TypeScript 5.5–5.7 لبناء `EvidenceRegistry` و`SuspicionSignal` discriminated union بأقصى أمان تصميمي.

**الأنماط المُعتمدة**:

1. **Key-Remapping في Mapped Types** — بناء `EvidenceRegistry` كـ mapped type:

   ```typescript
   type EvidenceRegistry = {
     [K in SignalType]: Extract<SuspicionSignal, { signalType: K }>["evidence"];
   };
   ```

   يضمن أن كل `signalType` يُعيَّن تلقائياً لنوع الدليل الصحيح دون تكرار.

2. **`satisfies` operator** — استخدامه لضبط handler maps:

   ```typescript
   const detectorHandlers = {
     "gate-break": handleGateBreak,
     "context-violation": handleContext,
     // ...
   } satisfies Record<SignalType, DetectorHandler>;
   ```

   يُحقق التحقق البنيوي الشامل (exhaustiveness) مع الحفاظ على الاستدلال الضيّق (narrow inference).

3. **`assertNever` pattern** — لضمان الشمولية في `switch` على `signalType`:

   ```typescript
   function assertNever(x: never): never {
     throw new Error(`Unexpected signal type: ${x}`);
   }
   ```

4. **TS 5.5 Inferred Type Predicates** — استخدام `array.filter()` مع استدلال تلقائي للنوع:

   ```typescript
   const gateBreaks = signals.filter((s) => s.family === "gate-break");
   // TypeScript 5.5+ يستدل تلقائياً أن gateBreaks هو GateBreakSignal[]
   ```

5. **`createSignal<T>` factory** — دالة مُصنِّعة عامة:
   ```typescript
   function createSignal<T extends SignalType>(
     type: T,
     evidence: EvidenceRegistry[T],
     base: Omit<SuspicionSignal, "signalType" | "evidence">
   ): Extract<SuspicionSignal, { signalType: T }> {
     return { ...base, signalType: type, evidence } as any; // safe cast within factory
   }
   ```

**المبرر**: هذه الأنماط مُتاحة ومستقرة في TypeScript 5.7. تُغني عن التحقق اليدوي (manual type guards) في معظم الحالات وتُقلّل احتمالية الأخطاء البنيوية.

**البدائل المدروسة**:

- Type guards يدوية لكل نوع — مرفوض: تكرار وهشاشة. TS 5.5+ يُغني عنها في الغالب.
- `as const` بدون `satisfies` — مرفوض: يفقد التحقق من الشمولية (exhaustiveness check).

---

### 12. Vitest 4.0 Benchmark API وحارس انحدار CI (إصدار ^4.0.18)

**القرار**: استخدام `bench()` API المدمج في Vitest 4 لقياس أداء المحرك، مع سكريبت JSON diff مخصص لحراسة CI.

**التغييرات الجوهرية في Vitest 4.0**:

1. **`environmentMatchGlobs` حُذف** — ترحيل مطلوب:

   ```typescript
   // vitest.config.ts — Vitest 3.x (قديم)
   environmentMatchGlobs: [["tests/dom/**", "jsdom"]];

   // vitest.config.ts — Vitest 4.x (جديد)
   export default defineConfig({
     test: {
       projects: [
         { test: { include: ["tests/dom/**"], environment: "jsdom" } },
         { test: { include: ["tests/unit/**"], environment: "node" } },
       ],
     },
   });
   ```

   **ملاحظة حرجة**: يجب ترحيل أي استخدام لـ `environmentMatchGlobs` إلى `projects` array قبل بدء تنفيذ المحرك.

2. **`coverage.all` حُذف** — لم يعد مدعوماً. يجب حذفه من أي config موجود.

3. **`expect.schemaMatching()` جديد** — matcher مدمج يعمل مع Zod:

   ```typescript
   expect(signal).schemaMatching(SuspicionSignalSchema);
   ```

4. **Benchmark API**:

   ```typescript
   // bench/suspicion-engine.bench.ts
   import { bench, describe } from "vitest";

   describe("SuspicionEngine Performance", () => {
     bench(
       "100 lines analysis",
       async () => {
         await engine.analyze(hundredLineTrace);
       },
       { time: 5000, iterations: 50 }
     );
   });
   ```

   - `--outputJson bench-results.json` لتصدير النتائج.
   - `--compare` flag متاح لكنه **لا يُفشل CI تلقائياً** — يحتاج سكريبت مخصص.

5. **سكريبت حارس الانحدار المقترح**:
   ```bash
   # scripts/bench-guard.sh
   vitest bench --outputJson current.json
   node scripts/compare-bench.mjs baseline.json current.json --threshold 30
   ```
   السكريبت يقارن النتائج ويُفشل CI إذا تجاوز الانحدار 30%.

**المبرر**: Vitest 4 يوفر benchmark API مدمج يُغني عن أدوات خارجية (tinybench مباشرة). لكن غياب فشل CI التلقائي في `--compare` يستوجب سكريبتاً مخصصاً.

**البدائل المدروسة**:

- tinybench مباشرة — مرفوض: Vitest 4 يُغلّفه بالفعل مع تكامل أفضل.
- Benchmark.js — مرفوض: مكتبة قديمة لا تتكامل مع Vitest.

---

### 13. أنماط Circuit-Breaker في TypeScript

**القرار**: بناء circuit-breaker يدوي (hand-rolled) خفيف مخصص لـ `RemoteAIResolverPolicy` بدلاً من مكتبة خارجية.

**تصميم آلة الحالة (State Machine)**:

```
┌──────────┐  failure >= threshold  ┌──────────┐
│  CLOSED  │ ─────────────────────► │   OPEN   │
│ (normal) │                        │ (reject) │
└──────────┘                        └────┬─────┘
     ▲                                   │ cooldown expires
     │ success                           ▼
     │                             ┌───────────┐
     └──────────────────────────── │ HALF-OPEN │
              success              │  (probe)  │
              ┌────────────────── └───────────┘
              │ failure               │
              └──────────► OPEN ◄─────┘
```

**الحالات الثمانية للانتقال**:

| #   | من        | إلى       | المُحفّز                             |
| --- | --------- | --------- | ------------------------------------ |
| 1   | CLOSED    | CLOSED    | نجاح الاستدعاء                       |
| 2   | CLOSED    | OPEN      | فشل >= threshold (افتراضي: 3)        |
| 3   | OPEN      | OPEN      | استدعاء جديد (يُرفض فوراً)           |
| 4   | OPEN      | HALF_OPEN | انتهاء cooldown (افتراضي: 30 ثانية)  |
| 5   | HALF_OPEN | CLOSED    | نجاح استدعاء الاختبار                |
| 6   | HALF_OPEN | OPEN      | فشل استدعاء الاختبار                 |
| 7   | HALF_OPEN | HALF_OPEN | استدعاء إضافي أثناء الاختبار (يُرفض) |
| 8   | \*        | CLOSED    | إعادة تعيين يدوية (reset)            |

**التنفيذ المقترح**:

```typescript
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number; // default: 3
  cooldownMs: number; // default: 30_000
  successThreshold: number; // default: 1 (half-open probes needed)
}

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.config.cooldownMs) {
        this.state = "HALF_OPEN";
      } else {
        throw new CircuitOpenError(this.remainingCooldown());
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

**المبرر**: المحرك يحتاج circuit-breaker واحداً فقط (لاستدعاء AI). مكتبة خارجية مثل `opossum` أو `cockatiel` تُضيف تبعية ثقيلة لحالة استخدام بسيطة. التنفيذ اليدوي (~60 سطراً) أخف وأسهل في الاختبار والتخصيص.

**البدائل المدروسة**:

- `opossum` (npm) — مرفوض: مكتبة Node.js ثقيلة (~200KB) مصممة لخوادم مع ميزات لا نحتاجها (fallback chains, health checks, Prometheus metrics).
- `cockatiel` — مرفوض: أخف من opossum لكنها تُضيف retry + timeout + bulkhead policies لا نحتاجها. التبعية الإضافية غير مبررة.
- Polly.js pattern — مرفوض: مخصص لـ .NET، لا يوجد port رسمي لـ TypeScript.

---

### 14. Zod 3.25 للتحقق عند حدود النظام (إصدار ^3.25.76)

**القرار**: استخدام Zod 3.25 لبناء schemas تحقق (validation schemas) عند حدود النظام الخارجية فقط: مدخلات AI response، ملفات config/profiles، وحمولات telemetry.

**الأنماط المُعتمدة**:

1. **`z.discriminatedUnion()` للإشارات**:

   ```typescript
   const SuspicionSignalSchema = z.discriminatedUnion("signalType", [
     z.object({
       signalType: z.literal("gate-break"),
       evidence: GateBreakEvidenceSchema,
       // ... common fields
     }),
     z.object({
       signalType: z.literal("context-violation"),
       evidence: ContextViolationEvidenceSchema,
     }),
     // ...
   ]);
   ```

   يُحقق تحققاً فعالاً (O(1) lookup بحسب discriminator) بدلاً من المحاولة التسلسلية.

2. **Schema → Type derivation** (لا تكرار):

   ```typescript
   // الـ schema هو المصدر الوحيد
   type SuspicionSignal = z.infer<typeof SuspicionSignalSchema>;
   ```

   **ملاحظة معمارية**: داخل المحرك، الأنواع TypeScript الصرفة (من `types.ts`) هي المرجع. Zod يُستخدم فقط عند الحدود. لا يُشتق النوع الداخلي من Zod — بل العكس: الـ schema يجب أن يتوافق مع النوع.

3. **تكامل مع `expect.schemaMatching()`** (Vitest 4):

   ```typescript
   // في الاختبارات
   expect(aiResponse).schemaMatching(AIVerdictSchema);
   ```

4. **حدود التحقق المُحددة**:
   - ✅ `from-ai-verdict.ts` — تحقق من استجابة AI الخارجية
   - ✅ `config.ts` — تحقق من ملفات الـ profiles عند التحميل
   - ✅ `suspicion-recorder.ts` — تحقق من بيانات telemetry قبل التصدير
   - ❌ داخل المحرك (detectors, aggregator, scoring) — لا Zod، TypeScript يكفي

**المبرر**: Zod 3.25 يدعم `discriminatedUnion` بكفاءة عالية ويتكامل مباشرة مع Vitest 4. التحقق عند الحدود فقط يتبع مبدأ "Trust internal code, validate at boundaries" من CLAUDE.md.

**البدائل المدروسة**:

- Zod في كل مكان (ubiquitous validation) — مرفوض: overhead غير ضروري داخل المحرك حيث TypeScript يضمن الأنواع.
- `io-ts` — مرفوض: API أعقد، مجتمع أصغر، لا يتكامل مع Vitest schemaMatching.
- تحقق يدوي بدون مكتبة — مرفوض: يُكرر منطق الـ discriminated union يدوياً وعُرضة للخطأ.

---

### 15. خريطة تكامل paste-classifier.ts مع المحرك

**القرار**: حقن جمع الآثار في 7 ممرات تصنيف موجودة، ثم استدعاء `SuspicionEngine.analyze()` بعد اكتمال التصنيف وقبل العرض.

**الممرات السبعة المُحددة في الكود الحالي**:

| #   | الممر                      | الملف                              | المخرج المُسجَّل في الأثر                           |
| --- | -------------------------- | ---------------------------------- | --------------------------------------------------- |
| 1   | Forward Classification     | `hybrid-classifier.ts`             | `initialType`, `confidence`, `classificationMethod` |
| 2   | Self-Reflection            | `self-reflection-pass.ts`          | `reflectionOverride`, `oldType → newType`           |
| 3   | Retroactive Correction     | `retroactive-corrector.ts`         | `correctionApplied`, `reason`                       |
| 4   | Reverse Classification     | `reverse-classification-pass.ts`   | `reverseType`, `reverseConfidence`                  |
| 5   | Viterbi Optimization       | `structural-sequence-optimizer.ts` | `viterbiType`, `sequenceDisagreements[]`            |
| 6   | Post-Classification Review | `classification-core.ts`           | `detectorFindings[]`, `suspicionScore`              |
| 7   | Agent Review (اختياري)     | `paste-classifier.ts`              | `agentVerdict`, `routing`                           |

**البنى الموجودة المُعاد استخدامها**:

1. **`DetectorFinding`** — موجود في `PostClassificationReviewer` بـ 8 كواشف:
   - `characterNameInDialogue`, `orphanedDialogue`, `characterAfterNonDialogue`
   - `characterBeforeAction`, `suspiciousTransition`, `emptyCharacter`
   - `multipleCharactersInLine`, `dialogueAfterDialogue`
     → يُحوَّل إلى `SuspicionSignal` عبر adapter

2. **`SequenceDisagreement`** — مخرج Viterbi:

   ```typescript
   { lineIndex: number, originalType: ElementType, suggestedType: ElementType }
   ```

   → يُحوَّل إلى إشارات `cross-pass-conflict`

3. **`SuspiciousLine`** — الهيكل الحالي للتوجيه:
   ```typescript
   { index: number, text: string, currentType: string, suspicionScore: number, findings: string[] }
   ```
   → يُستبدل بـ `SuspicionCase` الأغنى

**نقطة التكامل في `paste-classifier.ts`**:

```typescript
// بعد جميع الممرات وقبل العرض
const trace = traceCollector.finalize();
const engineResult = suspicionEngine.analyze(trace, weightPolicy);

// تطبيق الإصلاحات المحلية قبل العرض
for (const resolution of engineResult.preRenderResolutions) {
  applyLocalFix(classifiedLines, resolution);
}

// العرض مع تعليقات الحالات المعلقة
renderToEditor(classifiedLines, engineResult.pendingCases);

// تشغيل AI في الخلفية (لا يُعيق العرض)
engineResult.postRenderPromise?.then((aiResolutions) => {
  applyAIFixes(classifiedLines, aiResolutions);
});
```

**المبرر**: التكامل عبر adapter يحمي الكود الحالي من تغييرات جذرية. كل ممر يُضاف له سطر واحد لتسجيل الأثر. المحرك يُستدعى مرة واحدة بعد اكتمال الممرات.

**البدائل المدروسة**:

- استبدال PostClassificationReviewer بالكامل — مرفوض في المرحلة الأولى: يُبقى كمصدر إشارات، والمحرك يستهلك مخرجاته.
- تشغيل المحرك بعد كل ممر — مرفوض: overhead عالٍ ولا فائدة حيث أن الأدلة تتراكم عبر الممرات.
