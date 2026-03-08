# Data Model: محرك الاشتباه (Suspicion Engine)

**Feature Branch**: `002-suspicion-engine`
**Created**: 2026-03-07
**Status**: Draft

---

## مقدمة

يصف هذا المستند نماذج البيانات الكاملة لمحرك الاشتباه. جميع الكيانات مصممة بحيث لا يعتمد أي كيان على تفاصيل تنفيذية لكيان آخر، بل تتواصل جميعها عبر عقود typing صارمة. كل كيان يمثل Bounded Context مستقل يمكن اختباره بمعزل عن بقية المحرك.

---

## 1. ClassificationTrace

**الوصف**: السجل الموحد لكل سطر في المسار. هو المصدر الوحيد الذي يستهلكه Suspicion Domain. يجمع كل ما أنتجته ممرات التصنيف المتعددة في كيان واحد غير قابل للتعديل بعد إنشائه.

### الحقول

| الحقل            | النوع                   | الإلزامية | الوصف                                                             |
| ---------------- | ----------------------- | --------- | ----------------------------------------------------------------- |
| `lineIndex`      | `number`                | إلزامي    | رقم السطر في المستند الأصلي (يبدأ من 0)                           |
| `rawText`        | `string`                | إلزامي    | النص الخام كما وردَ قبل أي معالجة                                 |
| `normalizedText` | `string`                | إلزامي    | النص بعد التطبيع (إزالة تشكيل، توحيد مسافات، تصحيح ترميز)         |
| `sourceHints`    | `SourceHints`           | إلزامي    | مؤشرات مصدر الاستيراد وجودة النص (انظر تعريف SourceHints أدناه)   |
| `repairs`        | `readonly LineRepair[]` | إلزامي    | قائمة التعديلات التي طرأت على السطر مرتبة بترتيب حدوثها           |
| `passVotes`      | `readonly PassVote[]`   | إلزامي    | قائمة تصويتات الممرات. لا يُحذف أي تصويت عند اختيار النوع النهائي |
| `finalDecision`  | `FinalDecision`         | إلزامي    | النوع النهائي المختار والثقة وطريقة الاختيار                      |

### الكيانات المضمنة

#### SourceHints

| الحقل          | النوع                                                                     | الوصف                                      |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| `importSource` | `'paste' \| 'pdf' \| 'docx' \| 'fountain' \| 'fdx' \| 'txt' \| 'unknown'` | مصدر النص                                  |
| `lineQuality`  | `LineQuality`                                                             | مؤشرات جودة النص (انظر أدناه)              |
| `pageNumber`   | `number \| null`                                                          | رقم الصفحة إن كان متاحًا من مصدر الاستيراد |

#### LineQuality

| الحقل                  | النوع     | الوصف                                                 |
| ---------------------- | --------- | ----------------------------------------------------- |
| `score`                | `number`  | درجة جودة النص بين 0 و1 (0 = تشويه شديد، 1 = نص نظيف) |
| `arabicRatio`          | `number`  | نسبة الأحرف العربية من مجموع الأحرف القابلة للقراءة   |
| `weirdCharRatio`       | `number`  | نسبة الأحرف غير المتوقعة أو رموز OCR الخاطئة          |
| `hasStructuralMarkers` | `boolean` | وجود علامات هيكلية كالنقطتين أو الشرطة أو INT./EXT.   |

#### LineRepair

| الحقل                 | النوع                                                       | الوصف                                    |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `repairType`          | `'merge' \| 'split' \| 'partial-rewrite' \| 'encoding-fix'` | نوع التعديل                              |
| `textBefore`          | `string`                                                    | حالة النص قبل التعديل                    |
| `textAfter`           | `string`                                                    | حالة النص بعد التعديل                    |
| `appliedAt`           | `number`                                                    | طابع التوقيت النسبي (ترتيب التطبيق)      |
| `involvedLineIndices` | `readonly number[]`                                         | أرقام الأسطر المشاركة (للدمج أو التقسيم) |

#### PassVote

| الحقل           | النوع                                                                               | الوصف                              |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| `stage`         | `'forward' \| 'retroactive' \| 'reverse' \| 'viterbi' \| 'hybrid' \| 'schema-hint'` | اسم ممر التصنيف                    |
| `suggestedType` | `ElementType`                                                                       | النوع المقترح من هذا الممر         |
| `confidence`    | `number`                                                                            | درجة الثقة بين 0 و1                |
| `reasonCode`    | `string`                                                                            | رمز السبب المُعرَّف مسبقًا         |
| `metadata`      | `Record<string, string \| number \| boolean \| null>`                               | بيانات إضافية اختيارية خاصة بالممر |

#### FinalDecision

| الحقل          | النوع                                                                              | الوصف                             |
| -------------- | ---------------------------------------------------------------------------------- | --------------------------------- |
| `assignedType` | `ElementType`                                                                      | النوع النهائي المختار             |
| `confidence`   | `number`                                                                           | درجة الثقة في القرار النهائي      |
| `method`       | `'unanimous' \| 'majority' \| 'weighted' \| 'viterbi-override' \| 'schema-forced'` | آلية اختيار النوع النهائي         |
| `winningStage` | `string \| null`                                                                   | اسم الممر الذي كسر التعادل إن وجد |

### علاقات ClassificationTrace

- يُنشئه **Classification Domain** (paste-classifier, hybrid-classifier, retroactive-corrector, إلخ)
- يستهلكه **SuspicionFeatureAssembler** لإنتاج SuspicionFeature
- يستهلكه **DetectorSuite** مباشرة (كل كاشف يقرأ منه)
- مُضمَّن داخل **SuspicionCase** كمرجع للقراءة فقط
- لا يُعدَّل بعد إنشائه (immutable بالكامل)

### قواعد التحقق (من FRs)

- **FR-001**: `passVotes` يجب أن يحتوي على تصويت لكل ممر شارك في تصنيف هذا السطر. لا يجوز حذف أي تصويت حتى لو تعارض مع القرار النهائي.
- **FR-002**: كل تعديل يجب أن يُضاف إلى `repairs` بترتيب حدوثه. لا يجوز إعادة ترتيب القائمة.
- **SC-004**: يُمنع وجود `finalDecision` مكتمل مع `passVotes` فارغ. الحالتان يجب أن تكونا متسقتين.
- **FR-016**: السطور الفارغة وسطور whitespace-only تُمثَّل بـ trace صالح لكن `passVotes` فيه يمكن أن يكون فارغًا دون أن يُعدّ خطأ، لأن الممرات تتجاوزها بشكل مشروع.

---

## 2. SuspicionSignal

**الوصف**: إشارة شك منتجة من كاشف واحد في DetectorSuite. كل كاشف ينتج صفرًا أو أكثر من هذه الإشارات. تمثل الوحدة الأساسية للأدلة في المحرك.

### الحقول الأساسية

| الحقل           | النوع                                                              | الإلزامية | الوصف                                               |
| --------------- | ------------------------------------------------------------------ | --------- | --------------------------------------------------- |
| `signalId`      | `string`                                                           | إلزامي    | معرف فريد للإشارة (UUID أو تسلسلي)                  |
| `lineIndex`     | `number`                                                           | إلزامي    | رقم السطر الذي أنتج هذه الإشارة                     |
| `family`        | `SignalFamily`                                                     | إلزامي    | التصنيف العام (خمس قيم ثابتة)                       |
| `signalType`    | `SignalType`                                                       | إلزامي    | القيمة التنفيذية الدقيقة المقيدة بالـ family        |
| `score`         | `number`                                                           | إلزامي    | درجة شدة الإشارة بين 0 و1                           |
| `reasonCode`    | `string`                                                           | إلزامي    | رمز السبب من مجموعة ثابتة مُعرَّفة مسبقًا           |
| `message`       | `string`                                                           | إلزامي    | رسالة قابلة للقراءة البشرية تصف المشكلة             |
| `suggestedType` | `ElementType \| null`                                              | اختياري   | النوع البديل المقترح إن وجد                         |
| `evidence`      | `SuspicionSignalEvidence`                                          | إلزامي    | discriminated union strict مفتاحه `signalType`      |
| `debug`         | `Record<string, string \| number \| boolean \| null> \| undefined` | اختياري   | بيانات debug غير كانونية. لا تُستخدم في منطق القرار |

### تعريف SignalFamily

```
type SignalFamily =
  | 'gate-break'
  | 'context'
  | 'corruption'
  | 'cross-pass'
  | 'source'
```

### تعريف SignalType

```
type SignalType =
  | 'gate-break'
  | 'alternative-pull'
  | 'context-contradiction'
  | 'raw-corruption'
  | 'multi-pass-conflict'
  | 'source-risk'
```

### جدول القيود: Family → SignalType المسموح بها

| family       | signalTypes المسموحة              |
| ------------ | --------------------------------- |
| `gate-break` | `gate-break`, `alternative-pull`  |
| `context`    | `context-contradiction`           |
| `corruption` | `raw-corruption`                  |
| `cross-pass` | `multi-pass-conflict`             |
| `source`     | `source-risk`, `alternative-pull` |

**ملاحظة**: `alternative-pull` مشترك بين `gate-break` و`source` لأن كلاهما قد يقترح نوعًا بديلًا. التمييز يكون بالـ `reasonCode`.

### تعريف SuspicionSignalEvidence (Discriminated Union)

مفتاح التمييز هو `signalType`. لكل قيمة واجهة evidence مسمّاة خاصة.

#### GateBreakEvidence (signalType: 'gate-break')

| الحقل             | النوع          | الوصف                                               |
| ----------------- | -------------- | --------------------------------------------------- |
| `signalType`      | `'gate-break'` | مفتاح التمييز                                       |
| `brokenGateRule`  | `string`       | الرمز الثابت للقاعدة المكسورة (مثل `CHAR_NO_COLON`) |
| `expectedPattern` | `string`       | النمط المتوقع لهذا النوع                            |
| `actualPattern`   | `string`       | النمط الفعلي الموجود في السطر                       |
| `gateType`        | `ElementType`  | نوع العنصر الذي تنتمي إليه البوابة المكسورة         |

#### AlternativePullEvidence (signalType: 'alternative-pull')

| الحقل                | النوع                | الوصف                                |
| -------------------- | -------------------- | ------------------------------------ |
| `signalType`         | `'alternative-pull'` | مفتاح التمييز                        |
| `suggestedType`      | `ElementType`        | النوع البديل المقترح                 |
| `pullStrength`       | `number`             | قوة الجذب نحو النوع البديل (0 إلى 1) |
| `contributingStages` | `readonly string[]`  | الممرات التي اقترحت هذا النوع        |
| `keyPattern`         | `string \| null`     | النمط الرئيسي الذي أدى إلى الاقتراح  |

#### ContextContradictionEvidence (signalType: 'context-contradiction')

| الحقل                   | النوع                                                                                                                                          | الوصف                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `signalType`            | `'context-contradiction'`                                                                                                                      | مفتاح التمييز                      |
| `contradictionType`     | `'orphan-dialogue' \| 'missing-character-before-dialogue' \| 'scene-header-sequence' \| 'transition-position' \| 'dialogue-block-interrupted'` | نوع التناقض السياقي                |
| `expectedPrecedingType` | `ElementType \| null`                                                                                                                          | النوع المتوقع قبل هذا السطر        |
| `actualPrecedingType`   | `ElementType \| null`                                                                                                                          | النوع الفعلي الموجود قبله          |
| `windowSize`            | `number`                                                                                                                                       | حجم نافذة السياق التي فحصها الكاشف |

#### RawCorruptionEvidence (signalType: 'raw-corruption')

| الحقل              | النوع                                                                                           | الوصف                      |
| ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------- |
| `signalType`       | `'raw-corruption'`                                                                              | مفتاح التمييز              |
| `corruptionType`   | `'ocr-artifacts' \| 'encoding-errors' \| 'mixed-scripts' \| 'broken-words' \| 'repeated-chars'` | نوع الفساد المكتشف         |
| `qualityScore`     | `number`                                                                                        | درجة جودة النص (0 إلى 1)   |
| `affectedSegments` | `readonly string[]`                                                                             | المقاطع المتضررة من الفساد |
| `weirdCharRatio`   | `number`                                                                                        | نسبة الأحرف الغريبة        |
| `arabicRatio`      | `number`                                                                                        | نسبة الأحرف العربية        |

#### MultiPassConflictEvidence (signalType: 'multi-pass-conflict')

| الحقل              | النوع                                                                          | الوصف                           |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------- |
| `signalType`       | `'multi-pass-conflict'`                                                        | مفتاح التمييز                   |
| `conflictingVotes` | `readonly { stage: string; suggestedType: ElementType; confidence: number }[]` | التصويتات المتعارضة             |
| `conflictSeverity` | `'minor' \| 'moderate' \| 'severe'`                                            | شدة التضارب                     |
| `dominantType`     | `ElementType`                                                                  | النوع الذي حصل على أكثر الأصوات |
| `minorityType`     | `ElementType`                                                                  | النوع المتعارض                  |
| `confidenceDelta`  | `number`                                                                       | الفرق في الثقة بين أعلى تصويتين |

#### SourceRiskEvidence (signalType: 'source-risk')

| الحقل            | النوع                                                                                                   | الوصف                       |
| ---------------- | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| `signalType`     | `'source-risk'`                                                                                         | مفتاح التمييز               |
| `riskType`       | `'pdf-extraction-artifact' \| 'docx-style-mismatch' \| 'fountain-format-ambiguity' \| 'unknown-source'` | نوع خطر المصدر              |
| `sourceCategory` | `string`                                                                                                | فئة مصدر الاستيراد          |
| `riskLevel`      | `'low' \| 'medium' \| 'high'`                                                                           | مستوى الخطر                 |
| `affectedFields` | `readonly string[]`                                                                                     | الحقول المتأثرة بخطر المصدر |

### علاقات SuspicionSignal

- يُنتجه **كاشف واحد** من DetectorSuite
- يُجمَّع في **SuspicionCase** عبر EvidenceAggregator
- يُوزَّع في **SuspicionCase.summary** حسب family
- يُستهلك في **SuspicionWeightPolicy** لحساب الدرجة

### قواعد التحقق

- **FR-004**: حقل `evidence` يجب أن يكون من نوع discriminated union صارم. يُمنع `Record<string, unknown>`.
- **FR-004**: `reasonCode` يجب أن يكون من مجموعة ثابتة مُعرَّفة مسبقًا لكل `signalType`.
- **FR-005**: `family` يجب أن تتوافق مع `signalType` وفق جدول القيود أعلاه.
- `score` يجب أن يكون بين 0 و1 شاملًا.
- يُمنع أن ينتج كاشف واحد إشارتين بنفس `signalId`.

---

## 3. SuspicionCase

**الوصف**: قضية الشك المُجمَّعة لسطر واحد. هي الكيان المركزي الذي يجمع كل الأدلة ويمثل المدخل لطبقة الحسم (Resolution Layer).

### الحقول

| الحقل                  | النوع                        | الإلزامية | الوصف                                                |
| ---------------------- | ---------------------------- | --------- | ---------------------------------------------------- |
| `lineIndex`            | `number`                     | إلزامي    | رقم السطر في المستند                                 |
| `classifiedLine`       | `ClassifiedDraft`            | إلزامي    | السطر المصنَّف بنوعه وثقته الحالية                   |
| `trace`                | `ClassificationTrace`        | إلزامي    | الـ trace الكامل للسطر (للقراءة فقط)                 |
| `signals`              | `readonly SuspicionSignal[]` | إلزامي    | جميع الإشارات المنتجة من كل الكواشف                  |
| `summary`              | `SignalFamilySummary`        | إلزامي    | ملخص الإشارات مُصنَّف بالعائلات                      |
| `score`                | `number`                     | إلزامي    | درجة الشك الإجمالية بين 0 و100                       |
| `band`                 | `SuspicionBand`              | إلزامي    | الحزمة المحسوبة التي تحدد مسار الحسم                 |
| `critical`             | `boolean`                    | إلزامي    | علامة تشير إلى وجود إشارة حرجة تستوجب تصعيدًا فوريًا |
| `primarySuggestedType` | `ElementType \| null`        | إلزامي    | النوع البديل الأرجح استنادًا إلى تكرار الاقتراحات    |

### تعريف SignalFamilySummary

```
interface SignalFamilySummary {
  readonly gateBreak:    readonly SuspicionSignal[]
  readonly context:      readonly SuspicionSignal[]
  readonly corruption:   readonly SuspicionSignal[]
  readonly crossPass:    readonly SuspicionSignal[]
  readonly source:       readonly SuspicionSignal[]
}
```

### تعريف SuspicionBand

```
type SuspicionBand = 'pass' | 'local-review' | 'agent-candidate' | 'agent-forced'
```

### علاقات SuspicionCase

- يُنشئه **EvidenceAggregator** من مجموعة إشارات + trace
- يُدخَل إلى **RoutingPolicy** لتحديد InternalResolutionRoute
- يُدخَل إلى **ResolutionCoordinator** لتطبيق الحسم
- يُضمَّن في **SuspicionEngineOutput.cases** (للقراءة فقط)

### تدفق تحديد الـ Band

```
SuspicionSignals
       |
       v
EvidenceAggregator
   - يحسب درجة متعددة العوامل (FR-006)
   - يُحدد primarySuggestedType
   - يُعلم علامة critical
       |
       v
SuspicionScore (0-100)
       |
       v
RoutingPolicy (يطبق SuspicionWeightPolicy + عتبات)
       |
       v
SuspicionBand:
  score < عتبة_local  → 'pass'
  score < عتبة_agent  → 'local-review'
  score < عتبة_forced → 'agent-candidate'
  score >= عتبة_forced OR critical=true → 'agent-forced'
```

### قواعد التحقق

- **FR-006**: `score` يجب أن يُحسب كدالة متعددة العوامل. يُمنع استخدام `Math.max()` أو `sum()` بمفردهما.
- لا يُحذف أي سطر من `signals` بعد إضافته، حتى لو تعارض مع إشارة أخرى (FR-003، Edge Case: كاشفان متعارضان).
- `summary` يجب أن يكون متزامنًا مع `signals` في جميع الأوقات.

---

## 4. SuspicionFeature

**الوصف**: خاصية مُستخلصة من ClassificationTrace تمثل مدخلًا موحدًا وجاهزًا لاستهلاك الكواشف. تُفصل الكواشف عن تفاصيل استخراج البيانات من الـ trace.

### الفئات الست

| الفئة         | الوصف                      | الخصائص النموذجية                                |
| ------------- | -------------------------- | ------------------------------------------------ |
| `Gate`        | مؤشرات بوابات العناصر      | وجود النقطتين، طول السطر، أنماط البداية والنهاية |
| `Context`     | مؤشرات السياق المحيط       | النوع السابق، النوع التالي، عمق كتلة الحوار      |
| `RawQuality`  | مؤشرات جودة النص الخام     | `arabicRatio`، `weirdCharRatio`، `qualityScore`  |
| `CrossPass`   | مؤشرات تضارب الممرات       | عدد الممرات المتعارضة، شدة التضارب، الممر الفائز |
| `Competition` | مؤشرات التنافس بين الأنواع | النوع البديل الأقوى، قوة الجذب، الفرق في الثقة   |
| `Stability`   | مؤشرات استقرار القرار      | هشاشة القرار الأصلي، عدد الإصلاحات، مسار الوصول  |

### الهيكل العام

```
interface SuspicionFeature {
  readonly lineIndex: number
  readonly gate:      GateFeatures
  readonly context:   ContextFeatures
  readonly rawQuality: RawQualityFeatures
  readonly crossPass: CrossPassFeatures
  readonly competition: CompetitionFeatures
  readonly stability: StabilityFeatures
}
```

### علاقات SuspicionFeature

- يُنشئها **SuspicionFeatureAssembler** من ClassificationTrace + سياق السطر
- تُستهلك من كل كاشف في DetectorSuite مباشرة
- لا تُخزَّن في SuspicionCase (كيان وسيط مؤقت)

---

## 5. ResolutionOutcome

**الوصف**: نتيجة موحدة من أي resolver في الطبقة. هي العقد الوحيد بين resolvers وبقية النظام. يضمن هذا التوحيد إمكانية تبديل resolvers دون تغيير كود المستهلك.

### الحقول

| الحقل           | النوع                 | الإلزامية | الوصف                                      |
| --------------- | --------------------- | --------- | ------------------------------------------ |
| `lineIndex`     | `number`              | إلزامي    | رقم السطر المُعالَج                        |
| `status`        | `ResolutionStatus`    | إلزامي    | حالة نتيجة الحسم                           |
| `correctedType` | `ElementType \| null` | إلزامي    | النوع المصحح إن تغير، أو null إذا لم يتغير |
| `confidence`    | `number \| null`      | إلزامي    | درجة الثقة في القرار، أو null عند deferred |
| `resolverName`  | `string`              | إلزامي    | اسم الـ resolver الذي أنتج هذه النتيجة     |
| `evidenceUsed`  | `readonly string[]`   | إلزامي    | قائمة signalIds المستخدمة في اتخاذ القرار  |
| `appliedAt`     | `number \| null`      | إلزامي    | وقت التطبيق (قبل أو بعد العرض)             |

### تعريف ResolutionStatus

```
type ResolutionStatus =
  | 'confirmed'              // النوع الحالي صحيح، لا تعديل
  | 'relabel'                // تغيير النوع دون تعديل النص
  | 'repair-and-reclassify'  // تعديل النص ثم إعادة التصنيف
  | 'deferred'               // تأجيل القرار (AI timeout، غموض، إلخ)
```

### الانتقالات بين الحالات

```
[إشارة جديدة] → تحليل المحرك
                       |
          ┌────────────┴────────────┐
          |                         |
    band=pass               band≥local-review
    score منخفض                     |
          |              ┌──────────┴──────────┐
          v              |                      |
     'confirmed'   قرار حتمي واضح        غموض أو AI
                         |                      |
                         v                      v
                   'relabel' أو          'deferred'
                   'repair-and-reclassify'
                   (قبل العرض)            (بعد العرض أو بلا تغيير)
```

### علاقات ResolutionOutcome

- يُنتجها **أي resolver** (LocalDeterministicResolver، LocalRepairResolver، RemoteAIResolver، NoOpResolver)
- تُجمَّع في **SuspicionEngineOutput.actions**
- يُطبَّق تأثيرها على **classifiedLines** في ResolutionCoordinator

### قواعد التحقق

- **FR-013**: جميع حقول الكيان إلزامية حتى لو كانت null. يُمنع حذف الحقل.
- **FR-009**: النتائج بحالة `'relabel'` أو `'repair-and-reclassify'` يجب أن تُطبَّق قبل العرض (render-first guarantee). `appliedAt` يجب أن يعكس ذلك.

---

## 6. SuspicionWeightPolicy

**الوصف**: كائن تهيئة كامل يحدد أوزان ومعاملات حساب درجة الشك. ينتمي إلى Infrastructure ويُحقَن في المحرك عند التهيئة. مسؤول عن السكور فقط، لا عن المرونة التشغيلية.

### الحقول

| الحقل            | النوع                 | الوصف                             |
| ---------------- | --------------------- | --------------------------------- |
| `profile`        | `WeightPolicyProfile` | اسم الـ profile الجاهز المُستخدم  |
| `familyWeights`  | `FamilyWeights`       | أوزان كل عائلة من عائلات الإشارات |
| `boostFactors`   | `BoostFactors`        | معاملات التعزيز                   |
| `penaltyFactors` | `PenaltyFactors`      | معاملات العقوبة                   |
| `bandThresholds` | `BandThresholds`      | عتبات تحديد الـ band              |

### تعريف WeightPolicyProfile

```
type WeightPolicyProfile = 'strict-import' | 'balanced-paste' | 'ocr-heavy'
```

### FamilyWeights

| الحقل                  | النوع    | الوصف                                          |
| ---------------------- | -------- | ---------------------------------------------- |
| `gateBreak`            | `number` | وزن إشارات gate-break                          |
| `contextContradiction` | `number` | وزن إشارات context-contradiction               |
| `rawCorruption`        | `number` | وزن إشارات raw-corruption (مضاعف في ocr-heavy) |
| `multiPassConflict`    | `number` | وزن إشارات multi-pass-conflict                 |
| `alternativePull`      | `number` | وزن إشارات alternative-pull                    |
| `sourceRisk`           | `number` | وزن إشارات source-risk                         |

### BoostFactors

| الحقل                   | النوع    | الوصف                                                |
| ----------------------- | -------- | ---------------------------------------------------- |
| `diversityBoost`        | `number` | معامل تعزيز عند تنوع الإشارات عبر عائلات متعددة      |
| `criticalMismatchBoost` | `number` | معامل تعزيز عند وجود إشارة حرجة مع تضارب نوع         |
| `consensusTypeBoost`    | `number` | معامل تعزيز عند توافق عدة كواشف على نفس النوع البديل |

### PenaltyFactors

| الحقل                  | النوع    | الوصف                                       |
| ---------------------- | -------- | ------------------------------------------- |
| `lowConfidencePenalty` | `number` | عقوبة على قرار أصلي بثقة منخفضة (يزيد الشك) |
| `singleFamilyDiscount` | `number` | خصم عند تركز الإشارات في عائلة واحدة فقط    |

### BandThresholds

| الحقل               | النوع    | الوصف                                    |
| ------------------- | -------- | ---------------------------------------- |
| `localReviewMin`    | `number` | أدنى درجة للدخول في band=local-review    |
| `agentCandidateMin` | `number` | أدنى درجة للدخول في band=agent-candidate |
| `agentForcedMin`    | `number` | أدنى درجة للدخول في band=agent-forced    |

### الـ Profiles الجاهزة الثلاثة

| المعامل                 | `strict-import` | `balanced-paste` | `ocr-heavy` |
| ----------------------- | --------------- | ---------------- | ----------- |
| `gateBreak`             | 1.5             | 1.0              | 0.8         |
| `contextContradiction`  | 1.2             | 1.0              | 0.7         |
| `rawCorruption`         | 0.8             | 1.0              | 2.0         |
| `multiPassConflict`     | 1.3             | 1.0              | 0.9         |
| `alternativePull`       | 1.0             | 1.0              | 0.8         |
| `sourceRisk`            | 1.5             | 1.0              | 1.2         |
| `diversityBoost`        | 1.3             | 1.2              | 1.1         |
| `criticalMismatchBoost` | 2.0             | 1.5              | 1.5         |

### علاقات SuspicionWeightPolicy

- يُحقَن في **EvidenceAggregator** عند التهيئة
- يُختار profile تلقائيًا بناءً على `importSource` في السياق العام
- **لا يتشارك أي حقل** مع RemoteAIResolverPolicy (الفصل صريح من FR-017)

### قواعد التحقق

- **FR-007**: المحرك يجب أن يقبل policy مُحقَنة من الخارج. يُمنع hard-coding الأوزان.
- جميع الأوزان يجب أن تكون أعدادًا موجبة.
- `agentForcedMin > agentCandidateMin > localReviewMin > 0` يجب أن يتحقق دائمًا.

---

## 7. RemoteAIResolverPolicy

**الوصف**: سياسة مستقلة تمامًا عن SuspicionWeightPolicy. تتحكم في السلوك التشغيلي لـ RemoteAIResolver وإدارة circuit-breaker. تنتمي إلى Infrastructure وتُحقَن في RemoteAIResolver عند التهيئة.

### الحقول

| الحقل                         | النوع                      | الوصف                                                        |
| ----------------------------- | -------------------------- | ------------------------------------------------------------ |
| `requestTimeoutMs`            | `number`                   | مهلة الطلب الواحد إلى AI بالميلي ثانية                       |
| `consecutiveTimeoutThreshold` | `number`                   | عدد timeout متتالية يؤدي إلى فتح circuit-breaker             |
| `circuitOpenDurationMs`       | `number`                   | مدة بقاء الـ circuit في حالة open قبل الانتقال إلى half-open |
| `halfOpenProbeLimit`          | `number`                   | عدد الطلبات الاستكشافية المسموح بها في حالة half-open        |
| `priorityOrder`               | `readonly SuspicionBand[]` | ترتيب أولوية الإرسال (agent-forced أولًا بحسب FR-005 US5)    |

### علاقات RemoteAIResolverPolicy

- يُحقَن في **RemoteAIResolver** عند التهيئة
- يُدير **CircuitBreakerState** داخل RemoteAIResolver
- **لا يتشارك أي حقل** مع SuspicionWeightPolicy

---

## 8. InternalResolutionRoute

**الوصف**: تعداد داخلي بستة قيم يحدده RoutingPolicy. لا يُكشَف في الواجهة الخارجية. يُعالج داخليًا قبل الترجمة إلى SuspicionBand الخارجي.

### القيم

| القيمة                     | الوصف                           | يُطبَّق متى                                     |
| -------------------------- | ------------------------------- | ----------------------------------------------- |
| `'none'`                   | لا حسم مطلوب. النوع الحالي صحيح | band=pass, score منخفض جدًا                     |
| `'auto-local-fix'`         | إصلاح حتمي محلي فوري            | قرار واضح لا غموض فيه ولا تضارب ممرات           |
| `'repair-then-reclassify'` | إصلاح النص ثم إعادة التصنيف     | split/merge/wrapped-line مكتشف                  |
| `'local-review'`           | تسجيل للمراجعة البشرية لاحقًا   | غموض معتدل، لا إصلاح حتمي واضح                  |
| `'agent-candidate'`        | إرسال اختياري إلى AI            | درجة عالية لكن دون عتبة الإلزام                 |
| `'agent-forced'`           | إرسال إلزامي إلى AI             | درجة أعلى من عتبة agent-forced أو critical=true |

### العلاقة مع الـ 4 مسارات الخارجية (FR-008)

| InternalResolutionRoute  | يُقابل SuspicionBand الخارجي |
| ------------------------ | ---------------------------- |
| `none`                   | `pass`                       |
| `auto-local-fix`         | `pass` (بعد التطبيق)         |
| `repair-then-reclassify` | `pass` (بعد التطبيق)         |
| `local-review`           | `local-review`               |
| `agent-candidate`        | `agent-candidate`            |
| `agent-forced`           | `agent-forced`               |

**ملاحظة هامة**: الأسماء الخارجية الأربعة (`pass`, `local-review`, `agent-candidate`, `agent-forced`) لا تتغير أبدًا للحفاظ على التوافق مع العقود الخارجية (FR-008).

---

## 9. SuspicionEngineInput

**الوصف**: مدخل المحرك الرئيسي. يُمرَّر كاملًا إلى `SuspicionEngine.analyze()`.

### الحقول

| الحقل                  | النوع                                      | الإلزامية | الوصف                                                                      |
| ---------------------- | ------------------------------------------ | --------- | -------------------------------------------------------------------------- |
| `classifiedLines`      | `readonly ClassifiedDraft[]`               | إلزامي    | الأسطر المصنَّفة من pipeline. للقراءة فقط                                  |
| `traces`               | `ReadonlyMap<number, ClassificationTrace>` | إلزامي    | خريطة الـ traces مفهرسة برقم السطر. للقراءة فقط                            |
| `sequenceOptimization` | `SequenceOptimizationResult \| null`       | اختياري   | نتيجة تحسين التسلسل (Viterbi) إن أُجريت                                    |
| `extractionQuality`    | `ReadonlyMap<number, LineQuality> \| null` | اختياري   | خريطة جودة الاستخراج مفهرسة برقم السطر. تُفعَّل profile ocr-heavy تلقائيًا |

### قواعد التحقق

- `classifiedLines.length === traces.size` يجب أن يتحقق (كل سطر له trace).
- إذا كانت `classifiedLines` فارغة، يُعيد المحرك `SuspicionEngineOutput` بـ `cases=[]` دون رمي استثناء (Edge Case: نص فارغ).

---

## 10. SuspicionEngineOutput

**الوصف**: مخرج المحرك الرئيسي. يُعاد من `SuspicionEngine.analyze()`.

### الحقول

| الحقل     | النوع                          | الإلزامية | الوصف                                        |
| --------- | ------------------------------ | --------- | -------------------------------------------- |
| `cases`   | `readonly SuspicionCase[]`     | إلزامي    | قائمة قضايا الشك لجميع الأسطر. للقراءة فقط   |
| `routing` | `RoutingSummary`               | إلزامي    | الحصيلة الكمية لتوزيع الـ bands              |
| `actions` | `readonly ResolutionOutcome[]` | إلزامي    | قائمة الإصلاحات المطبَّقة فعلًا. للقراءة فقط |

### تعريف RoutingSummary

```
interface RoutingSummary {
  readonly total:              number  // إجمالي الأسطر
  readonly pass:               number  // عدد الحالات في band=pass
  readonly localReview:        number  // عدد الحالات في band=local-review
  readonly agentCandidate:     number  // عدد الحالات في band=agent-candidate
  readonly agentForced:        number  // عدد الحالات في band=agent-forced
  readonly autoFixedLocally:   number  // عدد الحالات المُصلَّحة محليًا (auto-local-fix)
  readonly repairedAndReclassified: number  // عدد حالات repair-then-reclassify
  readonly deferred:           number  // عدد الحالات المؤجلة
}
```

### قواعد التحقق

- **FR-015**: `routing` إلزامي دائمًا حتى عند `cases=[]` (يُظهر أصفارًا).
- `routing.total === cases.length` يجب أن يتحقق.
- `routing.pass + routing.localReview + routing.agentCandidate + routing.agentForced === routing.total` يجب أن يتحقق.

---

## 11. أنواع Evidence (ملخص)

| نوع Evidence                   | مفتاح التمييز                         | الحقول الجوهرية                                                                           |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GateBreakEvidence`            | `signalType: 'gate-break'`            | `brokenGateRule`, `expectedPattern`, `actualPattern`, `gateType`                          |
| `AlternativePullEvidence`      | `signalType: 'alternative-pull'`      | `suggestedType`, `pullStrength`, `contributingStages`, `keyPattern`                       |
| `ContextContradictionEvidence` | `signalType: 'context-contradiction'` | `contradictionType`, `expectedPrecedingType`, `actualPrecedingType`, `windowSize`         |
| `RawCorruptionEvidence`        | `signalType: 'raw-corruption'`        | `corruptionType`, `qualityScore`, `affectedSegments`, `weirdCharRatio`, `arabicRatio`     |
| `MultiPassConflictEvidence`    | `signalType: 'multi-pass-conflict'`   | `conflictingVotes`, `conflictSeverity`, `dominantType`, `minorityType`, `confidenceDelta` |
| `SourceRiskEvidence`           | `signalType: 'source-risk'`           | `riskType`, `sourceCategory`, `riskLevel`, `affectedFields`                               |

---

## رسم بياني: حالات circuit-breaker

```
        ┌─────────────────────────────────┐
        │           CLOSED                │
        │  (يقبل طلبات AI بشكل طبيعي)    │
        └────────────┬────────────────────┘
                     │
                     │ timeout متتالية >= consecutiveTimeoutThreshold
                     │
                     v
        ┌─────────────────────────────────┐
        │             OPEN                │
        │  (يرفض جميع طلبات AI)          │
        │  الحالات → local-review/deferred│
        └────────────┬────────────────────┘
                     │
                     │ انقضاء circuitOpenDurationMs
                     │
                     v
        ┌─────────────────────────────────┐
        │          HALF-OPEN              │
        │  (يقبل halfOpenProbeLimit       │
        │   طلبات استكشافية فقط)         │
        └────┬───────────────────────┬───┘
             │                       │
        نجاح Probe              فشل Probe
             │                       │
             v                       v
        CLOSED                     OPEN
```

**FR-017**: هذه الحالات الثلاث مُنفَّذة في `RemoteAIResolver` وتُدار بـ `RemoteAIResolverPolicy` المُحقَنة.

---

## ملاحظات عامة على التصميم

1. **Immutability**: كل كيان يُمرَّر بين طبقات المحرك يجب أن يكون للقراءة فقط (`readonly`). لا تُعدَّل الكيانات بعد إنشائها.
2. **No Cross-Detector Calls**: كل كاشف يعمل بمعزل تام. لا يستدعي كاشف آخر ولا يعدّل الـ trace (FR-003).
3. **Evidence Integrity**: يُمنع حذف أي إشارة بعد إضافتها إلى `SuspicionCase.signals`، حتى لو تعارضت مع إشارة أخرى.
4. **Graceful Degradation**: كل مكون يجب أن يعمل بشكل صحيح عند غياب مكون آخر (AI غير متاح، trace ناقص، نص فارغ).
