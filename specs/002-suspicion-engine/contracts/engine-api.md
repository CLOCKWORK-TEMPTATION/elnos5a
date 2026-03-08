# Engine API Contract: محرك الاشتباه

**Feature Branch**: `002-suspicion-engine`
**Created**: 2026-03-07
**Status**: Draft

---

## مقدمة

يصف هذا المستند عقد الواجهة البرمجية الرئيسية لمحرك الاشتباه (`SuspicionEngine`). العقد ثابت ولا يتغير بتغيير التنفيذ الداخلي. أي تعديل في هذه الواجهة يستلزم تحديث هذا المستند أولًا.

---

## SuspicionEngine.analyze()

### التوقيع

```typescript
interface SuspicionEngine {
  analyze(input: SuspicionEngineInput): SuspicionEngineOutput;
}
```

المحرك كيان stateless بالنسبة للـ input والـ output. الحالة الوحيدة التي يحتفظ بها هي حالة circuit-breaker داخل `RemoteAIResolver`، وهي معزولة تمامًا عن منطق التحليل.

### المدخل: SuspicionEngineInput

```typescript
interface SuspicionEngineInput {
  readonly classifiedLines: readonly ClassifiedDraft[];
  readonly traces: ReadonlyMap<number, ClassificationTrace>;
  readonly sequenceOptimization: SequenceOptimizationResult | null;
  readonly extractionQuality: ReadonlyMap<number, LineQuality> | null;
}
```

| الحقل                  | إلزامية | متى يُمرَّر                                      |
| ---------------------- | ------- | ------------------------------------------------ |
| `classifiedLines`      | إلزامي  | دائمًا. يجب ألا يكون null                        |
| `traces`               | إلزامي  | دائمًا. المفاتيح هي أرقام الأسطر (lineIndex)     |
| `sequenceOptimization` | اختياري | إذا أُجري Viterbi pass قبل استدعاء المحرك        |
| `extractionQuality`    | اختياري | إذا كان المصدر PDF أو OCR ويمكن حساب جودة كل سطر |

**قيود التحقق عند الاستدعاء**:

- `classifiedLines` غير فارغ أو فارغ كليًا (كلاهما مقبول؛ الفارغ يُعيد output صالح بأصفار).
- حجم `traces` يجب أن يساوي حجم `classifiedLines` في الحالة المثالية. إذا كانت هناك أسطر بلا traces، تُعالَج بكواشف gate-break فقط.
- لا يُعدَّل `classifiedLines` ولا `traces` أثناء التحليل أو بعده.

### المخرج: SuspicionEngineOutput

```typescript
interface SuspicionEngineOutput {
  readonly cases: readonly SuspicionCase[];
  readonly routing: RoutingSummary;
  readonly actions: readonly ResolutionOutcome[];
}

interface RoutingSummary {
  readonly total: number;
  readonly pass: number;
  readonly localReview: number;
  readonly agentCandidate: number;
  readonly agentForced: number;
  readonly autoFixedLocally: number;
  readonly repairedAndReclassified: number;
  readonly deferred: number;
}
```

**ضمانات المخرج**:

- `routing.total === classifiedLines.length` دائمًا.
- `routing.pass + routing.localReview + routing.agentCandidate + routing.agentForced === routing.total`.
- `actions` تحتوي فقط على الإصلاحات التي طُبِّقت فعلًا (pre-render). لا تحتوي على نتائج AI المؤجلة.
- `cases` تحتوي على قضية لكل سطر مريب. الأسطر ذات `band=pass` قد تُحذف إذا لم تُنتج إشارات، أو تُضمَّن بـ `signals=[]`.

### الإلزامات التشغيلية

- **لا يرمي استثناءات**: كل خطأ داخلي يُترجَم إلى `ResolutionOutcome` بحالة `deferred`.
- **نص فارغ**: `classifiedLines.length === 0` يُعيد `{ cases: [], routing: { total: 0, pass: 0, ... }, actions: [] }` فورًا.
- **قراءة فقط**: لا يُعدَّل أي حقل من حقول المدخل.

### تعقيد الوقت المتوقع

- **Pre-render path**: `O(n)` للكشف والتجميع والإصلاح الحتمي المحلي. يجب أن يكتمل قبل إرجاع المحرك.
- **Post-render AI path**: async خارج نطاق `analyze()` تمامًا. لا يؤثر على وقت الإرجاع.

---

## نقطة التكامل في paste-classifier.ts

### الموضع الكامل في المسار

```
paste-classifier.ts
│
├── 1. normalizeAndSegment(rawText)
│        └── [يُنتج segments + sourceHints]
│
├── 2. classifyLines(segments)
│        ├── HybridClassifier
│        ├── PostClassificationReviewer
│        └── [يُنتج ClassifiedDraft[] + PassVoteLog[]]
│
├── 3. collectTraces(classified, passVoteLog)   ← adapter جديد
│        └── [يُنتج ReadonlyMap<number, ClassificationTrace>]
│
├── 4. sequenceOptimization(lines)              ← Viterbi (اختياري، موجود مسبقًا)
│
├── *** 5. SuspicionEngine.analyze(input) ***   ← نقطة التكامل هنا
│        │
│        ├── [Pre-render] كشف + تجميع + إصلاح حتمي محلي
│        │
│        └── [مخرج فوري] SuspicionEngineOutput
│
├── 6. applyPreRenderActions(classified, output.actions)
│        └── [يُنتج correctedLines]
│
├── 7. render(correctedLines)                   ← يعرض النتيجة المصحَّحة
│
└── 8. resolveRemoteCasesAsync(agentCases)      ← async، لا يحجب العرض
         └── RemoteAIResolver.resolveAsync(...)
```

### الاستدعاء المتوقع

```typescript
// داخل paste-classifier.ts — بعد classifyLines وقبل render

const engineInput: SuspicionEngineInput = {
  classifiedLines: classified,
  traces: collectTraces(classified, passVoteLog),
  sequenceOptimization: viterbResult ?? null,
  extractionQuality: qualityMap ?? null,
};

const engineOutput = suspicionEngine.analyze(engineInput);

// تطبيق الإصلاحات الحتمية (pre-render) — FR-009
const correctedLines = applyPreRenderActions(classified, engineOutput.actions);

// عرض النتيجة المصحَّحة للمستخدم
render(correctedLines);

// إرسال الحالات المرشحة للـ AI بعد العرض — async، لا يحجب — FR-011
void resolveRemoteCasesAsync(
  engineOutput.cases.filter(
    (c) => c.band === "agent-forced" || c.band === "agent-candidate"
  )
);
```

### ضمانات render-first (FR-009, SC-005)

- كل `ResolutionOutcome` بحالة `relabel` أو `repair-and-reclassify` يجب أن يُطبَّق قبل استدعاء `render()`.
- `RemoteAIResolver` يعمل بعد `render()` في سياق async منفصل ولا يحجب إظهار النتيجة الأولى.
- SC-005: إجمالي وقت pre-render path يجب ألا يتجاوز 200ms إضافية على وقت pipeline الحالي لمجموعة 100 سطر.
- SC-005a: في CI، لا يتجاوز median execution time نسبة 30% overhead مقارنة بـ baseline مُخزَّن.

---

## عقود المحولات (Adapters)

### 1. from-classifier: collectTraces

**الغرض**: تحويل مخرجات pipeline إلى ReadonlyMap من traces يستهلكه المحرك.

```typescript
function collectTraces(
  classified: readonly ClassifiedDraft[],
  passVoteLog: readonly PassVoteLogEntry[],
  repairs?: readonly LineRepairRecord[],
  sourceHints?: ReadonlyMap<number, SourceHints>
): ReadonlyMap<number, ClassificationTrace>;
```

| المدخل        | الوصف                                             |
| ------------- | ------------------------------------------------- |
| `classified`  | الأسطر المصنفة النهائية من HybridClassifier       |
| `passVoteLog` | سجل تصويتات جميع الممرات بترتيب حدوثها            |
| `repairs`     | اختياري — سجل التعديلات التي طرأت على الأسطر      |
| `sourceHints` | اختياري — مؤشرات مصدر الاستيراد مفهرسة برقم السطر |

**السلوك الإلزامي**:

- يُنشئ `ClassificationTrace` لكل سطر.
- يجمع تصويتات الممرات من `passVoteLog` ويرتبها على السطر الصحيح.
- لا يُسقط أي تصويت حتى المتعارضة منها (FR-001).
- الـ traces المُنتجة للقراءة فقط بالكامل.
- إذا كان `passVoteLog` فارغًا لسطر ما، يُنشأ trace له بـ `passVotes: []` مع تسجيل تحذير في telemetry (SC-004).

### 2. from-classifier: buildSingleTrace

**الغرض**: بناء trace واحد لسطر واحد — مفيد في الاختبارات وفي الحالات التي يُعالَج فيها السطر منفردًا.

```typescript
function buildSingleTrace(params: {
  lineIndex: number;
  rawText: string;
  normalizedText: string;
  sourceHints: SourceHints;
  passVotes: readonly PassVote[];
  repairs: readonly LineRepair[];
  finalDecision: FinalDecision;
}): ClassificationTrace;
```

**قاعدة التحقق**: إذا كانت `passVotes` فارغة و`finalDecision` مكتملة، يُسجَّل تحذير SC-004 في telemetry. لا يُرمى استثناء.

### 3. to-ai-payload: buildAIReviewPayload

**الغرض**: تحويل `SuspicionCase` إلى الحزمة المهيكلة المُرسَلة إلى AI (FR-012, SC-007).

```typescript
function buildAIReviewPayload(
  suspicionCase: SuspicionCase,
  contextLines: readonly ContextLine[]
): AIReviewPayload;
```

```typescript
interface AIReviewPayload {
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: ElementType;
  readonly originalConfidence: number;
  readonly suspicionScore: number;
  readonly primarySuggestedType: ElementType | null;
  readonly evidence: {
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

**SC-007 (الزامي)**: جميع حقول `evidence` يجب أن تكون موجودة حتى لو فارغة (`[]`). يُمنع حذف أي حقل من الحزمة. أي payload ناقص يُعدّ فشلًا في الاختبار.

**اختيار contextLines**: الأسطر المجاورة (3 قبل + 3 بعد بشكل افتراضي). الحد الأدنى: سطر واحد إذا كان النص قصيرًا.

### 4. from-ai-verdict: parseAIVerdict

**الغرض**: تحويل رد AI الخارجي إلى `ResolutionOutcome` موحد ومُتحقق منه.

```typescript
function parseAIVerdict(
  lineIndex: number,
  raw: AIVerdictResponse,
  originalCase: SuspicionCase
): ResolutionOutcome;
```

```typescript
interface AIVerdictResponse {
  readonly suggestedType: ElementType;
  readonly confidence: number;
  readonly reasoning: string;
  readonly actionRequired: "relabel" | "confirm" | "repair-and-reclassify";
}
```

**قواعد التحويل**:

| حالة                                                 | النتيجة                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `confidence > 0.8` و`suggestedType !== assignedType` | `status: 'relabel'` أو `'repair-and-reclassify'` حسب `actionRequired` |
| `confidence <= 0.8`                                  | `status: 'deferred'`                                                  |
| `suggestedType === assignedType`                     | `status: 'confirmed'`                                                 |
| رد غير صالح (schema mismatch)                        | `status: 'deferred'` مع تسجيل في telemetry                            |

يُسجَّل `resolverName: 'remote-ai'` دائمًا في هذا المسار.

---

## عقد الكاشف (Detector Contract)

كل كاشف في DetectorSuite يلتزم بهذا التوقيع:

```typescript
type DetectorFn = (
  trace: ClassificationTrace,
  line: ClassifiedDraft,
  context: DetectorContext
) => readonly SuspicionSignal[];
```

```typescript
interface DetectorContext {
  readonly lineIndex: number;
  readonly totalLines: number;
  readonly neighbors: readonly ClassifiedDraft[];
  readonly neighborTraces: readonly ClassificationTrace[];
  readonly features: SuspicionFeature;
}
```

**الإلزامات على كل كاشف (FR-003)**:

- Pure function: لا آثار جانبية، لا حالة مُخزَّنة.
- لا يستدعي كاشفًا آخر.
- لا يعدّل `trace` أو `line` أو `context`.
- يُعيد مصفوفة فارغة (`[]`) إذا لم يجد ما يثير الشك.
- لا يرمي استثناءات. يتعامل مع أي حقل ناقص بصمت.

---

## معالجة الأخطاء والتدهور السلس

### مبدأ عدم كسر المسار

المحرك لا يوقف مسار التصنيف أبدًا. كل استثناء يُعزَّل ويُترجَم إلى نتيجة آمنة.

### جدول سيناريوهات الفشل

| السيناريو                | السلوك المطلوب                                 | الأثر في Output                        |
| ------------------------ | ---------------------------------------------- | -------------------------------------- |
| `classifiedLines` فارغ   | إرجاع output صالح بأصفار فورًا                 | `cases: [], routing: all zeros`        |
| trace غير موجود لسطر ما  | إنشاء trace مبسط من `ClassifiedDraft` وحده     | كواشف gate-break فقط، cross-pass معطلة |
| كاشف يرمي استثناء        | عزل الاستثناء، إكمال باقي الكواشف              | إشارة `source-risk` بديلة قد تُضاف     |
| AI timeout               | `ResolutionOutcome` بـ `status: 'deferred'`    | `routing.deferred` يزيد                |
| API key غير موجود        | جميع agent-candidate/forced → `deferred`       | `routing.deferred` لكل المُرسَل        |
| circuit-breaker OPEN     | رفض فوري لجميع طلبات AI                        | توجيه إلى local-review أو deferred     |
| كل الأسطر agent-forced   | تطبيق الإصلاحات المحلية أولًا، إعادة حساب band | تخفيف band محتمل قبل الإرسال           |
| `extractionQuality` null | حساب `lineQuality` تقريبي من `rawText`         | دقة أقل في كواشف corruption، لكن يعمل  |

### Telemetry Layer (FR-014)

```typescript
interface SuspicionTelemetryEvent {
  readonly eventType:
    | "detect"
    | "aggregate"
    | "route"
    | "resolve"
    | "circuit-state-change";
  readonly lineIndex: number | null;
  readonly band: SuspicionBand | null;
  readonly resolverName: string | null;
  readonly signalCount: number;
  readonly durationMs: number;
  readonly timestamp: number;
  readonly metadata: Record<string, string | number | boolean | null>;
}
```

طبقة telemetry لا تؤثر على سير المعالجة. إذا فشل تسجيل حدث، يُتجاهَل الفشل صامتًا ولا يُسبب أي تأثير على النتيجة.

---

## ثوابت الواجهة الخارجية (FR-008)

الأسماء التالية **ثابتة** ولا تتغير أبدًا للحفاظ على التوافق مع العقود الخارجية:

```typescript
// SuspicionBand الخارجي — 4 قيم فقط، لا تتغير
type SuspicionBand =
  | "pass"
  | "local-review"
  | "agent-candidate"
  | "agent-forced";

// InternalResolutionRoute الداخلي — 6 قيم، لا تُكشَف خارجيًا
type InternalResolutionRoute =
  | "none"
  | "auto-local-fix"
  | "repair-then-reclassify"
  | "local-review"
  | "agent-candidate"
  | "agent-forced";
```

**ترجمة المسارات الداخلية إلى الخارجية في RoutingSummary**:

| InternalResolutionRoute  | يُحسَب في RoutingSummary              |
| ------------------------ | ------------------------------------- |
| `none`                   | `pass++`                              |
| `auto-local-fix`         | `pass++` و`autoFixedLocally++`        |
| `repair-then-reclassify` | `pass++` و`repairedAndReclassified++` |
| `local-review`           | `localReview++`                       |
| `agent-candidate`        | `agentCandidate++`                    |
| `agent-forced`           | `agentForced++`                       |
