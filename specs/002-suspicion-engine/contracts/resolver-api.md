# Resolver API Contract: واجهة الحسم

**Feature Branch**: `002-suspicion-engine`
**Created**: 2026-03-07
**Status**: Draft

---

## مقدمة

يصف هذا المستند عقد واجهة الحسم (`SuspicionResolver`) وجميع التنفيذات الأربع لها، إضافة إلى `ResolutionCoordinator` الذي ينسق بينها. كل resolver كيان مستقل قابل للاستبدال دون تغيير كود المستهلك.

---

## SuspicionResolver Interface

### التوقيع الكامل

```typescript
interface SuspicionResolver {
  readonly name: string;
  canHandle(suspicionCase: SuspicionCase): boolean;
  resolve(suspicionCase: SuspicionCase): Promise<ResolutionOutcome>;
}
```

### الإلزامات على كل تنفيذ

- **`canHandle()`**: Pure function. لا آثار جانبية. لا تعديل على `suspicionCase`. تُعيد `boolean` فورًا بلا async.
- **`resolve()`**: يُعيد دائمًا `Promise<ResolutionOutcome>`. لا يرمي استثناءات تصل إلى المستدعي. أي خطأ داخلي يُترجَم إلى `ResolutionOutcome` بـ `status: 'deferred'`.
- **`evidenceUsed`**: كل `ResolutionOutcome` مُنتَجة يجب أن تحتوي على قائمة `evidenceUsed` بـ `signalId` للإشارات المستخدمة في القرار. يُمنع إرجاع قائمة فارغة إذا استُخدمت إشارات فعلًا.
- **`resolverName`**: يجب أن يكون `resolverName` في `ResolutionOutcome` مساويًا لـ `this.name`.

### عقد ResolutionOutcome

```typescript
interface ResolutionOutcome {
  readonly lineIndex: number;
  readonly status: ResolutionStatus;
  readonly correctedType: ElementType | null;
  readonly confidence: number | null;
  readonly resolverName: string;
  readonly evidenceUsed: readonly string[]; // signalIds
  readonly appliedAt: "pre-render" | "post-render" | null;
}

type ResolutionStatus =
  | "confirmed"
  | "relabel"
  | "repair-and-reclassify"
  | "deferred";
```

---

## 1. LocalDeterministicResolver

**المسؤولية**: إصلاح حتمي سريع للحالات الواضحة جدًا: gate-break حاسم + نوع بديل واضح + لا تضارب ممرات.

```typescript
class LocalDeterministicResolver implements SuspicionResolver {
  readonly name = "local-deterministic";

  canHandle(suspicionCase: SuspicionCase): boolean;
  resolve(suspicionCase: SuspicionCase): Promise<ResolutionOutcome>;
}
```

### شروط canHandle (يجب أن تتحقق جميعها)

| الشرط                                    | التفصيل                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `band === 'auto-local-fix'` (مسار داخلي) | الـ RoutingPolicy يُحدد هذا المسار                                                   |
| إشارة `gate-break` حاسمة موجودة          | `signals` تحتوي على إشارة من family `gate-break` بـ `score >= threshold_high`        |
| `primarySuggestedType !== null`          | يوجد نوع بديل مُتفق عليه                                                             |
| لا إشارات `multi-pass-conflict` شديدة    | لا توجد إشارة بـ `signalType: 'multi-pass-conflict'` وـ `conflictSeverity: 'severe'` |
| لا إشارات `context-contradiction` حادة   | لا تناقض سياقي يعاكس النوع البديل المقترح                                            |

### سلوك resolve

```typescript
// مثال مبسط للتنفيذ المتوقع
{
  lineIndex:     suspicionCase.lineIndex,
  status:        'relabel',
  correctedType: suspicionCase.primarySuggestedType,
  confidence:    computedConfidence,   // أعلى confidence من الإشارات المستخدمة
  resolverName:  'local-deterministic',
  evidenceUsed:  usedSignalIds,
  appliedAt:     'pre-render',         // دائمًا قبل العرض (FR-009)
}
```

**التنفيذ**: متزامن منطقيًا (Promise يُحلّ فورًا). يجب اكتماله قبل `render()`.

---

## 2. LocalRepairResolver

**المسؤولية**: إصلاح فساد نصي من نوع split/merge/wrapped-line ثم إعادة تصنيف الناتج ضمن نفس الدورة المحلية.

```typescript
class LocalRepairResolver implements SuspicionResolver {
  readonly name = "local-repair";

  canHandle(suspicionCase: SuspicionCase): boolean;
  resolve(suspicionCase: SuspicionCase): Promise<ResolutionOutcome>;
}
```

### شروط canHandle (يجب أن تتحقق جميعها)

| الشرط                                            | التفصيل                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `band === 'repair-then-reclassify'` (مسار داخلي) | الـ RoutingPolicy يُحدد هذا المسار                                   |
| إشارة `raw-corruption` قابلة للإصلاح             | `corruptionType` من نوع `broken-words` أو `split-line` أو قابل للدمج |
| الإصلاح محدد وآلي                                | يوجد استراتيجية إصلاح محددة في `evidence` (دمج، تقسيم، إلخ)          |
| درجة الثقة في الإصلاح كافية                      | لا يُطبَّق إصلاح بثقة منخفضة (يحوله إلى `deferred`)                  |

### سلوك resolve

```typescript
{
  lineIndex:     suspicionCase.lineIndex,
  status:        'repair-and-reclassify',
  correctedType: reclassifiedType,   // النوع بعد إعادة التصنيف
  confidence:    reclassifyConfidence,
  resolverName:  'local-repair',
  evidenceUsed:  usedSignalIds,
  appliedAt:     'pre-render',        // دائمًا قبل العرض (FR-009, FR-010)
}
```

**تسلسل العمل الداخلي**:

1. استخراج استراتيجية الإصلاح من `RawCorruptionEvidence`.
2. تطبيق الإصلاح (دمج/تقسيم/إعادة كتابة جزئية).
3. إعادة تصنيف النص المُصلَح (استدعاء داخلي لـ HybridClassifier أو قاعدة حتمية).
4. تسجيل الإصلاح في `LineRepair` وإضافته إلى trace المُحدَّث.

**التنفيذ**: متزامن منطقيًا (Promise يُحلّ فورًا). يجب اكتماله قبل `render()`.

---

## 3. RemoteAIResolver

**المسؤولية**: تصعيد الحالات الغامضة التي لا تستطيع الإصلاحات المحلية حسمها إلى نموذج AI خارجي. adapter خارجي اختياري (FR-011).

```typescript
class RemoteAIResolver implements SuspicionResolver {
  readonly name = "remote-ai";

  constructor(policy: RemoteAIResolverPolicy);

  canHandle(suspicionCase: SuspicionCase): boolean;
  resolve(suspicionCase: SuspicionCase): Promise<ResolutionOutcome>;
  getCircuitState(): CircuitBreakerState;
}
```

### شروط canHandle

| الشرط                                            | التفصيل                                     |
| ------------------------------------------------ | ------------------------------------------- |
| `band === 'agent-candidate'` أو `'agent-forced'` | مسارا الـ AI المعتمدان                      |
| circuit-breaker في حالة `closed` أو `half-open`  | إذا كان `open`، يُعيد `canHandle: false`    |
| مفتاح API متاح                                   | إذا لم يكن متاحًا، يُعيد `canHandle: false` |

إذا أعاد `canHandle: false`، يتولى `NoOpResolver` المعالجة بـ `status: 'deferred'`.

### سلوك resolve

**التنفيذ**: غير متزامن حقيقي. يعمل بعد `render()` ولا يحجب العرض.

**تسلسل العمل الداخلي**:

1. بناء `AIReviewPayload` عبر `buildAIReviewPayload()` (FR-012, SC-007).
2. إرسال الطلب إلى AI API مع مهلة `requestTimeoutMs`.
3. عند نجاح الاستجابة: تحليل الرد عبر `parseAIVerdict()` وإنتاج `ResolutionOutcome`.
4. عند timeout: تسجيل timeout متتالية، تحديث circuit-breaker إن لزم، إرجاع `deferred`.
5. عند فشل circuit-breaker: إرجاع `deferred` فوري دون إرسال.

### هيكل الـ payload المُرسَل إلى AI

```typescript
interface AIReviewPayload {
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: ElementType;
  readonly originalConfidence: number;
  readonly suspicionScore: number;
  readonly primarySuggestedType: ElementType | null;
  readonly evidence: {
    // جميع الحقول إلزامية، حتى لو فارغة (SC-007)
    readonly gateBreaks: readonly GateBreakEvidence[];
    readonly alternativePulls: readonly AlternativePullEvidence[];
    readonly contextContradictions: readonly ContextContradictionEvidence[];
    readonly rawCorruptionSignals: readonly RawCorruptionEvidence[];
    readonly multiPassConflicts: readonly MultiPassConflictEvidence[];
    readonly sourceRisks: readonly SourceRiskEvidence[];
  };
  readonly contextLines: readonly ContextLine[];
}

interface ContextLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: ElementType;
  readonly confidence: number;
}
```

**SC-007**: أي payload ناقص (حقل evidence مفقود، `contextLines` غير موجودة، `suspicionScore` غير موجود) يُعدّ فشلًا في الاختبار.

### إدارة Circuit-Breaker (FR-017)

```typescript
type CircuitBreakerState = "closed" | "open" | "half-open";

interface CircuitBreakerStatus {
  readonly state: CircuitBreakerState;
  readonly consecutiveTimeouts: number;
  readonly openSince: number | null; // timestamp
  readonly probesSentInHalfOpen: number;
}
```

#### جدول انتقالات الحالات

| الحالة الحالية | الحدث                              | الحالة الجديدة  | الإجراء                               |
| -------------- | ---------------------------------- | --------------- | ------------------------------------- |
| `closed`       | timeout                            | `closed`        | `consecutiveTimeouts++`               |
| `closed`       | `consecutiveTimeouts >= threshold` | `open`          | تسجيل telemetry، رفض جميع الطلبات     |
| `closed`       | نجاح استجابة                       | `closed`        | إعادة تعيين `consecutiveTimeouts = 0` |
| `open`         | انقضاء `circuitOpenDurationMs`     | `half-open`     | السماح بـ `halfOpenProbeLimit` طلبات  |
| `open`         | أي طلب جديد                        | `open`          | رفض فوري → `deferred`                 |
| `half-open`    | نجاح probe                         | `closed`        | إعادة تعيين كامل                      |
| `half-open`    | فشل probe أو timeout               | `open`          | إعادة فتح الـ circuit                 |
| `half-open`    | `probesSent >= halfOpenProbeLimit` | `open` (انتظار) | لا مزيد من probes حتى قرار            |

#### تعريف RemoteAIResolverPolicy

```typescript
interface RemoteAIResolverPolicy {
  readonly requestTimeoutMs: number; // مهلة الطلب الواحد
  readonly consecutiveTimeoutThreshold: number; // عتبة فتح circuit-breaker
  readonly circuitOpenDurationMs: number; // مدة بقاء circuit مفتوحًا
  readonly halfOpenProbeLimit: number; // طلبات استكشافية في half-open
  readonly priorityOrder: readonly SuspicionBand[]; // ترتيب الإرسال (agent-forced أولًا)
}
```

**الفصل الصريح**: `RemoteAIResolverPolicy` مستقلة تمامًا عن `SuspicionWeightPolicy`. لا حقول مشتركة بينهما (FR-017).

#### معالجة timeout

```typescript
// عند timeout في resolve()
if (isTimeout) {
  circuitBreaker.recordTimeout();
  return {
    lineIndex: suspicionCase.lineIndex,
    status: "deferred",
    correctedType: null,
    confidence: null,
    resolverName: "remote-ai",
    evidenceUsed: [],
    appliedAt: "post-render",
  };
  // لا يُرمى استثناء — FR-011
}
```

### أولوية الإرسال (US5, FR-012)

عند وجود مجموعة من الحالات للإرسال، تُرسَل `agent-forced` أولًا بترتيب `suspicionScore` تنازليًا، ثم `agent-candidate` بنفس الترتيب. هذا مُحدد في `RemoteAIResolverPolicy.priorityOrder`.

---

## 4. NoOpResolver

**المسؤولية**: معالجة الحالات التي لا تحتاج أي إصلاح (pass) أو التي تُؤجَّل للمراجعة البشرية (local-review)، وحالات AI المعطلة.

```typescript
class NoOpResolver implements SuspicionResolver {
  readonly name = "noop";

  canHandle(suspicionCase: SuspicionCase): boolean;
  resolve(suspicionCase: SuspicionCase): Promise<ResolutionOutcome>;
}
```

### شروط canHandle

- `band === 'pass'` (لا إشارات أو إشارات منخفضة الشدة).
- `band === 'local-review'` (يُسجَّل للمراجعة البشرية).
- أي حالة `agent-candidate` أو `agent-forced` رفضها `RemoteAIResolver` (معطل، circuit مفتوح، API key غائب).

### سلوك resolve

| الحالة                    | النتيجة                                      |
| ------------------------- | -------------------------------------------- |
| `band === 'pass'`         | `status: 'confirmed'`, `correctedType: null` |
| `band === 'local-review'` | `status: 'deferred'`, `correctedType: null`  |
| AI غير متاح + agent-\*    | `status: 'deferred'`, `correctedType: null`  |

```typescript
{
  lineIndex:     suspicionCase.lineIndex,
  status:        band === 'pass' ? 'confirmed' : 'deferred',
  correctedType: null,
  confidence:    band === 'pass' ? suspicionCase.classifiedLine.confidence : null,
  resolverName:  'noop',
  evidenceUsed:  [],   // لا إشارات مستخدمة
  appliedAt:     'pre-render',
}
```

---

## ResolutionCoordinator

**المسؤولية**: تنسيق تنفيذ الـ resolvers على مجموعة `SuspicionCase`، مع الحفاظ على ضمان render-first وفصل المسارات المتزامنة عن غير المتزامنة.

```typescript
class ResolutionCoordinator {
  constructor(resolvers: readonly SuspicionResolver[]);

  // مرحلة pre-render: متزامنة، تُعيد outcomes جاهزة للتطبيق
  resolvePreRender(
    cases: readonly SuspicionCase[]
  ): readonly ResolutionOutcome[];

  // مرحلة post-render: غير متزامنة، لا تحجب العرض
  resolvePostRenderAsync(
    cases: readonly SuspicionCase[]
  ): Promise<readonly ResolutionOutcome[]>;
}
```

### ترتيب التنفيذ والتوقيت

```
مرحلة PRE-RENDER (قبل render() — متزامنة):
  1. LocalDeterministicResolver  ← auto-local-fix
  2. LocalRepairResolver          ← repair-then-reclassify
  3. NoOpResolver                 ← pass و local-review

  كل هذه المراحل تكتمل قبل إرجاع correctedLines إلى render()

مرحلة POST-RENDER (بعد render() — غير متزامنة):
  4. RemoteAIResolver             ← agent-forced (أولًا)
  5. RemoteAIResolver             ← agent-candidate (ثانيًا)
  6. NoOpResolver (fallback)      ← إذا رفض RemoteAIResolver
```

### منطق الاختيار (Resolver Chain)

```typescript
// لكل SuspicionCase، يُحدد ResolutionCoordinator الـ resolver المناسب:

function pickResolver(suspicionCase: SuspicionCase): SuspicionResolver {
  for (const resolver of this.resolvers) {
    if (resolver.canHandle(suspicionCase)) {
      return resolver;
    }
  }
  return noopResolver; // fallback دائم
}
```

**ترتيب فحص `canHandle`**:

1. `LocalDeterministicResolver`
2. `LocalRepairResolver`
3. `RemoteAIResolver`
4. `NoOpResolver` (يقبل كل ما لم يُعالَج)

### الضمانات

- **render-first**: `resolvePreRender()` تُكمل قبل استدعاء `render()`. كل `ResolutionOutcome` بـ `appliedAt: 'pre-render'` يجب أن يكون موجودًا في هذه المرحلة (FR-009).
- **No pipeline break**: حتى لو فشل كل resolver، يُعيد `ResolutionCoordinator` outcomes صالحة بـ `status: 'deferred'`.
- **لا تداخل**: كل `SuspicionCase` يُعالَج بـ resolver واحد فقط. لا يُطبَّق resolver ثانٍ على نفس الحالة بعد نجاح الأول.

### حسم pre-render vs post-render

```
SuspicionCase.band:
  ├── 'pass'              → NoOpResolver (pre-render, 'confirmed')
  ├── 'local-review'      → NoOpResolver (pre-render, 'deferred')
  ├── auto-local-fix*     → LocalDeterministicResolver (pre-render, 'relabel')
  ├── repair-then-reclassify* → LocalRepairResolver (pre-render, 'repair-and-reclassify')
  ├── 'agent-candidate'   → RemoteAIResolver (post-render) أو NoOpResolver إذا AI معطل
  └── 'agent-forced'      → RemoteAIResolver (post-render) أو NoOpResolver إذا AI معطل

* هذان مساران داخليان (InternalResolutionRoute) لا يظهران في SuspicionBand الخارجي
```

---

## RoutingPolicy

**المسؤولية**: تحديد `InternalResolutionRoute` لكل `SuspicionCase` بناءً على الدرجة والإشارات والـ `SuspicionWeightPolicy`.

```typescript
class RoutingPolicy {
  constructor(weightPolicy: SuspicionWeightPolicy);

  assignRoute(suspicionCase: SuspicionCase): InternalResolutionRoute;
}
```

### قواعد التوجيه (بالأولوية)

| الأولوية | الشرط                                                                         | المسار                   |
| -------- | ----------------------------------------------------------------------------- | ------------------------ |
| 1        | لا إشارات أو `score < localReviewMin`                                         | `none`                   |
| 2        | إشارة `raw-corruption` قابلة للإصلاح محليًا                                   | `repair-then-reclassify` |
| 3        | gate-break حاسم + `primarySuggestedType` واضح + لا `multi-pass-conflict` شديد | `auto-local-fix`         |
| 4        | `score < agentCandidateMin`                                                   | `local-review`           |
| 5        | `score < agentForcedMin`                                                      | `agent-candidate`        |
| 6        | `score >= agentForcedMin` أو `critical === true`                              | `agent-forced`           |

**ملاحظة**: الشروط تُفحَص بهذا الترتيب. الشرط الأول الذي يتحقق يُحدد المسار ويوقف الفحص.
