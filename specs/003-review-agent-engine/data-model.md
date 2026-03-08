# Data Model: Review Agent Engine (محرك المراجعة النهائية)

**Feature Branch**: `003-review-agent-engine`
**Created**: 2026-03-08
**Status**: Draft

---

## مقدمة

يصف هذا المستند نماذج البيانات الكاملة لطبقة المراجعة النهائية. تتدفق البيانات في اتجاه واحد: من `SuspicionEngineOutput` (مخرج محرك الشك) إلى `FinalReviewRequestPayload` (حزمة الطلب) إلى `AgentReviewResponsePayload` (استجابة الخادم) إلى تطبيق الأوامر على المحرر. كل كيان يمثل عقدًا صارمًا مستقلًا قابلًا للاختبار بمعزل عن بقية الطبقات.

---

## 1. FinalReviewRequestPayload

**الوصف**: الحزمة الكاملة المُرسلة من frontend إلى `POST /api/final-review`. هي المدخل الوحيد للخادم وتحمل كل المعلومات اللازمة لإجراء المراجعة النهائية دون الرجوع إلى أي مصدر خارجي.

### الحقول

| الحقل              | النوع                                      | الوصف                                           | القيود                                       |
| ------------------ | ------------------------------------------ | ----------------------------------------------- | -------------------------------------------- |
| `packetVersion`    | `"suspicion-final-review-v1"`              | معرّف إصدار بروتوكول الحزمة                     | إلزامي، غير فارغ، قيمة ثابتة                 |
| `schemaVersion`    | `"arabic-screenplay-classifier-output-v1"` | إصدار مخطط المُصنِّف                            | إلزامي، قيمة ثابتة                           |
| `importOpId`       | `string`                                   | معرّف عملية الاستيراد الفريد                    | إلزامي، غير فارغ                             |
| `sessionId`        | `string`                                   | معرّف الجلسة الحالية                            | إلزامي، غير فارغ                             |
| `totalReviewed`    | `number`                                   | عدد الأسطر الكلي في النص قبل التصفية            | عدد صحيح ≥ 0                                 |
| `suspiciousLines`  | `FinalReviewSuspiciousLinePayload[]`       | الأسطر المشبوهة المُرشَّحة للمراجعة             | مصفوفة، قد تكون فارغة                        |
| `requiredItemIds`  | `string[]`                                 | معرّفات الأسطر التي يجب أن يُصدر AI حكمًا عليها | كل `itemId` يجب أن يوجد في `suspiciousLines` |
| `forcedItemIds`    | `string[]`                                 | معرّفات الأسطر الإلزامية التي يجب أن تُحسم      | مجموعة فرعية صارمة من `requiredItemIds`      |
| `schemaHints`      | `FinalReviewSchemaHints`                   | قواعد ومحددات عناصر السيناريو                   | إلزامي                                       |
| `reviewPacketText` | `string?`                                  | نص تشخيصي نصي ملخّص للحزمة (اختياري)            | حد 160,000 حرف، `undefined` مقبول            |

### القيود الصارمة

- `forcedItemIds ⊆ requiredItemIds ⊆ suspiciousLines[*].itemId`
- إذا كانت `suspiciousLines` فارغة، يجب أن تكون `requiredItemIds` و`forcedItemIds` فارغتين أيضًا.
- `totalReviewed` يعكس إجمالي الأسطر في النص، وليس فقط عدد `suspiciousLines`.

---

## 2. FinalReviewSuspiciousLinePayload

**الوصف**: بيانات سطر مشبوه واحد تُضمَّن في `suspiciousLines`. يجمع كل المعلومات التي يحتاجها AI لاتخاذ قرار مستقل بشأن السطر: نص السطر، النوع الحالي، الأدلة، السياق المحيط، ومسار التصنيف الكامل.

### الحقول

| الحقل                    | النوع                                 | الوصف                                         | القيود                                   |
| ------------------------ | ------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `itemId`                 | `string`                              | معرّف فريد للسطر في هذه الحزمة                | إلزامي، حد 120 حرف، غير قابل للتكرار     |
| `lineIndex`              | `number`                              | رقم السطر في النص الأصلي (يبدأ من 0)          | عدد صحيح ≥ 0                             |
| `text`                   | `string`                              | النص الكامل للسطر                             | إلزامي، حد 8,000 حرف                     |
| `assignedType`           | `LineType`                            | النوع المُعيَّن حاليًا قبل المراجعة           | من `ALLOWED_LINE_TYPES`                  |
| `fingerprint`            | `string`                              | بصمة السطر (نوع + نص مُجزَّأ)                 | إلزامي، حد 256 حرف                       |
| `suspicionScore`         | `number`                              | درجة الشك المحسوبة من محرك الشك               | 0–100 شاملًا                             |
| `routingBand`            | `"agent-candidate" \| "agent-forced"` | نطاق التوجيه الذي أدّى إلى تضمين السطر        | قيمتان فقط                               |
| `critical`               | `boolean`                             | هل الحالة مُعلَّمة كحرجة في محرك الشك         | افتراضي `false`                          |
| `primarySuggestedType`   | `LineType \| null`                    | النوع البديل الأرجح كما حدده محرك الشك        | من `ALLOWED_LINE_TYPES` أو `null`        |
| `distinctSignalFamilies` | `number`                              | عدد عائلات الإشارات المختلفة التي اشتركت      | عدد صحيح ≥ 0                             |
| `signalCount`            | `number`                              | العدد الكلي للإشارات المُنتجة من جميع الكواشف | عدد صحيح ≥ 0                             |
| `reasonCodes`            | `string[]`                            | أكواد أسباب الشك من الإشارات                  | حد 32 عنصر                               |
| `signalMessages`         | `string[]`                            | رسائل الإشارات القابلة للقراءة البشرية        | حد 32 عنصر                               |
| `sourceHints`            | `FinalReviewSourceHintsPayload`       | تلميحات مصدر الاستيراد وجودة النص             | إلزامي                                   |
| `evidence`               | `FinalReviewEvidencePayload`          | الأدلة المُجمّعة بـ 6 أنواع                   | إلزامي                                   |
| `trace`                  | `FinalReviewTraceSummary`             | ملخص مسار التصنيف                             | إلزامي                                   |
| `contextLines`           | `FinalReviewContextLine[]`            | الأسطر المجاورة للسياق                        | نافذة ±2 أسطر، قد تكون أقل عند حواف النص |

### FinalReviewSourceHintsPayload

| الحقل                  | النوع                                                                     | الوصف                    |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------ |
| `importSource`         | `'paste' \| 'pdf' \| 'docx' \| 'fountain' \| 'fdx' \| 'txt' \| 'unknown'` | مصدر النص الأصلي         |
| `lineQualityScore`     | `number`                                                                  | درجة جودة النص بين 0 و1  |
| `arabicRatio`          | `number`                                                                  | نسبة الأحرف العربية      |
| `weirdCharRatio`       | `number`                                                                  | نسبة الأحرف غير المتوقعة |
| `hasStructuralMarkers` | `boolean`                                                                 | وجود علامات هيكلية       |
| `pageNumber`           | `number \| null`                                                          | رقم الصفحة إن كان متاحًا |

### FinalReviewContextLine

| الحقل          | النوع      | الوصف                                             |
| -------------- | ---------- | ------------------------------------------------- |
| `lineIndex`    | `number`   | رقم السطر في النص الأصلي                          |
| `text`         | `string`   | نص السطر المجاور                                  |
| `assignedType` | `LineType` | النوع المُعيَّن لهذا السطر                        |
| `offset`       | `number`   | الإزاحة عن السطر الهدف (من -2 إلى +2، باستثناء 0) |

---

## 3. FinalReviewEvidencePayload

**الوصف**: الأدلة المُجمَّعة من `SuspicionCase` مُنظَّمة في 6 أنواع متوافقة مع عائلات إشارات محرك الشك. تُستهلك من AI مباشرة لفهم سبب الشك في السطر.

### الحقول

| الحقل                   | النوع                            | الوصف                                   |
| ----------------------- | -------------------------------- | --------------------------------------- |
| `gateBreaks`            | `GateBreakEvidence[]`            | مخالفات بوابات العناصر (شرط شكلي مكسور) |
| `alternativePulls`      | `AlternativePullEvidence[]`      | سحب نوع بديل من ممرات متعددة            |
| `contextContradictions` | `ContextContradictionEvidence[]` | تناقضات السياق البنيوي المحيط           |
| `rawCorruptionSignals`  | `RawCorruptionEvidence[]`        | إشارات فساد النص الخام (OCR، ترميز)     |
| `multiPassConflicts`    | `MultiPassConflictEvidence[]`    | تعارضات بين ممرات التصنيف المتعددة      |
| `sourceRisks`           | `SourceRiskEvidence[]`           | مخاطر مرتبطة بمصدر الاستيراد            |

### ملاحظة على هياكل Evidence

هذه الكيانات تُعاد استخدامها مباشرة من تعريفات `SuspicionSignalEvidence` في محرك الشك. راجع `specs/002-suspicion-engine/data-model.md` للتعريفات الكاملة لكل نوع (`GateBreakEvidence`، `AlternativePullEvidence`، `ContextContradictionEvidence`، `RawCorruptionEvidence`، `MultiPassConflictEvidence`، `SourceRiskEvidence`).

---

## 4. FinalReviewTraceSummary

**الوصف**: ملخص مسار التصنيف مُستخلص من `ClassificationTrace`. يُرسل مع الحزمة ليمنح AI رؤية شاملة بكيفية وصول السطر إلى نوعه الحالي.

### الحقول

| الحقل           | النوع           | الوصف                                               |
| --------------- | --------------- | --------------------------------------------------- |
| `passVotes`     | `PassVote[]`    | أصوات كل مرحلة تصنيف شاركت في تصنيف السطر           |
| `repairs`       | `LineRepair[]`  | الإصلاحات المُطبَّقة على السطر مرتبة بترتيب التطبيق |
| `finalDecision` | `FinalDecision` | القرار النهائي (النوع، الثقة، آلية الاختيار)        |

### PassVote

| الحقل           | النوع                                                                               | الوصف                      |
| --------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| `stage`         | `'forward' \| 'retroactive' \| 'reverse' \| 'viterbi' \| 'hybrid' \| 'schema-hint'` | اسم ممر التصنيف            |
| `suggestedType` | `LineType`                                                                          | النوع المقترح من هذا الممر |
| `confidence`    | `number`                                                                            | درجة الثقة بين 0 و1        |
| `reasonCode`    | `string`                                                                            | رمز السبب المُعرَّف مسبقًا |

### LineRepair

| الحقل        | النوع                                                       | الوصف                  |
| ------------ | ----------------------------------------------------------- | ---------------------- |
| `repairType` | `'merge' \| 'split' \| 'partial-rewrite' \| 'encoding-fix'` | نوع التعديل المُطبَّق  |
| `textBefore` | `string`                                                    | حالة النص قبل التعديل  |
| `textAfter`  | `string`                                                    | حالة النص بعد التعديل  |
| `appliedAt`  | `number`                                                    | الترتيب الزمني للتطبيق |

### FinalDecision

| الحقل          | النوع                                                                              | الوصف                                  |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| `assignedType` | `LineType`                                                                         | النوع النهائي المختار                  |
| `confidence`   | `number`                                                                           | درجة الثقة في القرار النهائي (0 إلى 1) |
| `method`       | `'unanimous' \| 'majority' \| 'weighted' \| 'viterbi-override' \| 'schema-forced'` | آلية اختيار النوع النهائي              |

---

## 5. FinalReviewSchemaHints

**الوصف**: قواعد ومحددات عناصر السيناريو العربي تُرسل مع الحزمة لتزويد AI بسياق schema. تُبنى مرة واحدة لكل حزمة وتنطبق على جميع الأسطر.

### الحقول

| الحقل                  | النوع                    | الوصف                               |
| ---------------------- | ------------------------ | ----------------------------------- |
| `allowedLineTypes`     | `string[]`               | قائمة الأنواع المسموح بها في النظام |
| `lineTypeDescriptions` | `Record<string, string>` | وصف عربي لكل نوع                    |
| `gateRules`            | `SchemaGateRule[]`       | قواعد بوابات العناصر                |

### SchemaGateRule

| الحقل         | النوع    | الوصف                         |
| ------------- | -------- | ----------------------------- |
| `lineType`    | `string` | النوع الذي تنطبق عليه القاعدة |
| `ruleId`      | `string` | معرّف القاعدة                 |
| `description` | `string` | وصف القاعدة                   |

---

## 6. AgentCommand (Discriminated Union)

**الوصف**: أمر تصحيح واحد يُصدره AI في الاستجابة. نوع التمييز هو حقل `op`. القيمتان الوحيدتان المدعومتان في هذا الإصدار هما `relabel` و`split`.

### RelabelCommand

| الحقل        | النوع       | الوصف                 | القيود                  |
| ------------ | ----------- | --------------------- | ----------------------- |
| `op`         | `"relabel"` | مفتاح التمييز         | ثابت                    |
| `itemId`     | `string`    | معرّف السطر المستهدف  | يجب أن يوجد في الطلب    |
| `newType`    | `LineType`  | النوع الجديد المقترح  | من `ALLOWED_LINE_TYPES` |
| `confidence` | `number`    | درجة ثقة AI في القرار | 0 إلى 1 شاملًا          |
| `reason`     | `string`    | سبب القرار بالعربية   | إلزامي، غير فارغ        |

### SplitCommand

| الحقل        | النوع      | الوصف                               | القيود                         |
| ------------ | ---------- | ----------------------------------- | ------------------------------ |
| `op`         | `"split"`  | مفتاح التمييز                       | ثابت                           |
| `itemId`     | `string`   | معرّف السطر المستهدف                | يجب أن يوجد في الطلب           |
| `splitAt`    | `number`   | موضع القطع (UTF-16 code-unit index) | عدد صحيح ≥ 1، أصغر من طول النص |
| `leftType`   | `LineType` | نوع الجزء الأيسر (قبل `splitAt`)    | من `ALLOWED_LINE_TYPES`        |
| `rightType`  | `LineType` | نوع الجزء الأيمن (بعد `splitAt`)    | من `ALLOWED_LINE_TYPES`        |
| `confidence` | `number`   | درجة ثقة AI في القرار               | 0 إلى 1 شاملًا                 |
| `reason`     | `string`   | سبب القرار بالعربية                 | إلزامي، غير فارغ               |

### قواعد التطبيع عند التكرار

- إذا أصدر AI أوامر متعددة لنفس `itemId`، يُؤخذ الأمر ذو `confidence` الأعلى.
- الأوامر ذات `itemId` غير موجود في الطلب تُتجاهل بصمت.
- `newType` بقيمة `scene_header_1` أو `scene_header_2` يُطبَّع إلى `scene_header_top_line`.

---

## 7. AgentReviewResponsePayload

**الوصف**: الاستجابة الكاملة من `POST /api/final-review`. تحمل حالة المعالجة، الأوامر المُنتجة، والبيانات الوصفية اللازمة للتتبع والتشخيص.

### الحقول

| الحقل        | النوع                                            | الوصف                                      | القيود              |
| ------------ | ------------------------------------------------ | ------------------------------------------ | ------------------- |
| `apiVersion` | `"2.0"`                                          | إصدار واجهة API                            | ثابت                |
| `mode`       | `"auto-apply"`                                   | وضع تطبيق الأوامر                          | ثابت في هذا الإصدار |
| `importOpId` | `string`                                         | معرّف عملية الاستيراد (يُعكس من الطلب)     | إلزامي              |
| `requestId`  | `string`                                         | معرّف الطلب الفريد (UUID مُنشأ على الخادم) | إلزامي              |
| `status`     | `"applied" \| "partial" \| "skipped" \| "error"` | حالة معالجة الطلب                          | إلزامي              |
| `commands`   | `AgentCommand[]`                                 | الأوامر المُنتجة بعد التطبيع               | قد تكون فارغة       |
| `message`    | `string`                                         | رسالة وصفية للحالة                         | إلزامي              |
| `latencyMs`  | `number`                                         | زمن المعالجة الكامل بالميلي ثانية          | عدد صحيح ≥ 0        |
| `meta`       | `AgentReviewResponseMeta?`                       | بيانات وصفية تكميلية                       | اختياري             |
| `model`      | `string?`                                        | اسم النموذج المستخدم في المراجعة           | اختياري             |

### AgentReviewResponseMeta

| الحقل               | النوع            | الوصف                                                            |
| ------------------- | ---------------- | ---------------------------------------------------------------- |
| `totalInputTokens`  | `number \| null` | عدد رموز المدخلات المُرسلة لـ AI                                 |
| `totalOutputTokens` | `number \| null` | عدد رموز المخرجات المُستقبلة من AI                               |
| `retryCount`        | `number`         | عدد محاولات إعادة الإرسال (0 إذا نجح من المرة الأولى)            |
| `resolvedItemIds`   | `string[]`       | قائمة `itemId` التي حصلت على حكم صريح                            |
| `missingItemIds`    | `string[]`       | قائمة `requiredItemIds` التي لم تحصل على حكم (في حالة `partial`) |
| `isMockResponse`    | `boolean`        | هل الاستجابة من وضع mock                                         |

### دلالات حالات الاستجابة (status)

| الحالة      | المعنى                                                            | الشرط                                      |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `"applied"` | جميع `requiredItemIds` حُسمت                                      | `resolvedItemIds ⊇ requiredItemIds`        |
| `"partial"` | بعض `requiredItemIds` لم تُحسم، لكن لا `forcedItemIds` مفقودة     | `missingItemIds ∩ forcedItemIds = ∅`       |
| `"skipped"` | لا أسطر مشبوهة في الطلب، لم يُستدعَ AI                            | `suspiciousLines.length === 0`             |
| `"error"`   | فشل حرج: `forcedItemIds` لم تُحسم، أو خطأ في API غير قابل للتعافي | `missingItemIds ∩ forcedItemIds ≠ ∅`       |
| `"error"`   | مفتاح API غير موجود (`ANTHROPIC_API_KEY` غير مُعرَّف)             | لا يُستدعى AI — إرجاع فوري                 |
| `"partial"` | مفتاح API مشوّه (لا يبدأ بـ `sk-ant-` أو طول غير صالح)            | لا يُستدعى AI — تحذير + إرجاع بأوامر فارغة |

---

## 8. ReviewRoutingStats

**الوصف**: إحصائيات توزيع الأسطر عبر نطاقات التوجيه الأربعة. تُسجَّل بعد تطبيق محرك الشك وقبل بناء حزمة المراجعة النهائية. تُستخدم للـ telemetry والمراقبة.

### الحقول

| الحقل                 | النوع    | الوصف                                            |
| --------------------- | -------- | ------------------------------------------------ |
| `countPass`           | `number` | أسطر مرّت بدون شك (band=pass)                    |
| `countLocalReview`    | `number` | أسطر مُحالة للمراجعة المحلية (band=local-review) |
| `countAgentCandidate` | `number` | أسطر مُرشَّحة لمراجعة AI (band=agent-candidate)  |
| `countAgentForced`    | `number` | أسطر مُجبرة لمراجعة AI (band=agent-forced)       |

### قواعد التحقق

- `countPass + countLocalReview + countAgentCandidate + countAgentForced === totalReviewed`
- جميع الحقول أعداد صحيحة ≥ 0.

---

## العلاقات بين الكيانات

```
FinalReviewRequestPayload
  ├── 1:N → FinalReviewSuspiciousLinePayload (suspiciousLines)
  │         ├── 1:1 → FinalReviewEvidencePayload (evidence)
  │         │         ├── 0:N → GateBreakEvidence
  │         │         ├── 0:N → AlternativePullEvidence
  │         │         ├── 0:N → ContextContradictionEvidence
  │         │         ├── 0:N → RawCorruptionEvidence
  │         │         ├── 0:N → MultiPassConflictEvidence
  │         │         └── 0:N → SourceRiskEvidence
  │         ├── 1:1 → FinalReviewTraceSummary (trace)
  │         │         ├── 0:N → PassVote
  │         │         ├── 0:N → LineRepair
  │         │         └── 1:1 → FinalDecision
  │         ├── 1:1 → FinalReviewSourceHintsPayload (sourceHints)
  │         └── 0:N → FinalReviewContextLine (contextLines, نافذة ±2)
  ├── 1:1 → FinalReviewSchemaHints (schemaHints)
  │         └── 0:N → SchemaGateRule
  ├── requiredItemIds ⊆ suspiciousLines[*].itemId
  └── forcedItemIds ⊆ requiredItemIds

AgentReviewResponsePayload
  ├── 1:N → AgentCommand — discriminated union:
  │         ├── RelabelCommand (op: "relabel")
  │         └── SplitCommand  (op: "split")
  └── 1:1 → AgentReviewResponseMeta (meta, اختياري)
```

---

## حالات الاستجابة (State Transitions)

```
Request → validate (validateFinalReviewRequestBody)
               │
       ┌───────┴────────┐
       │                │
   [غير صالح]        [صالح]
       │                │
    400 error      check mock mode
                        │
             ┌──────────┴──────────┐
             │                     │
      [mock=error]           [mock=success]
             │                     │
        error response       mock commands
                                   │
                             [no mock] → check API key
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                       [مفتاح غير صالح]               [مفتاح صالح]
                              │                               │
                       partial/error                  check suspicious lines
                                                              │
                                               ┌──────────────┴──────────────┐
                                               │                             │
                                       [suspiciousLines فارغة]       [suspiciousLines مملوءة]
                                               │                             │
                                           skipped                   call Anthropic API
                                                                             │
                                                              ┌──────────────┼──────────────┐
                                                              │              │              │
                                                       [429/529/503]   [max_tokens]     [success]
                                                              │         مقطوعة               │
                                                        retry backoff       │          parse commands
                                                       (max 3 مرات)   retry × 2             │
                                                       3s → 6s → 12s   max_tokens      normalize
                                                                             │               │
                                                                       parse commands   coverage check
                                                                                             │
                                                                              ┌─────────────┼──────────────┐
                                                                              │             │              │
                                                                    [all required    [some missing]  [forced
                                                                      resolved]    (لكن لا forced)   unresolved]
                                                                              │             │              │
                                                                          applied        partial         error
```

---

## LineType — الأنواع المسموح بها

```
type LineType =
  | 'action'
  | 'dialogue'
  | 'character'
  | 'scene_header_1'
  | 'scene_header_2'
  | 'scene_header_3'
  | 'scene_header_top_line'
  | 'transition'
  | 'parenthetical'
  | 'basmala'
```

**ملاحظة**: قيم `scene_header_1` و`scene_header_2` في أوامر AI تُطبَّع إلى `scene_header_top_line` عند التطبيق (`normalizeSceneHeaderDecisionType`).

---

## ملاحظات عامة على التصميم

1. **Immutability**: `FinalReviewRequestPayload` و`FinalReviewSuspiciousLinePayload` للقراءة فقط بعد البناء. لا تُعدَّل عبر دورة حياة الطلب.
2. **Self-Contained**: كل `FinalReviewSuspiciousLinePayload` يحمل كل ما يحتاجه AI لاتخاذ قرار — لا يحتاج الخادم الرجوع لأي حالة خارجية.
3. **Evidence Integrity**: أكواد الأسباب `reasonCodes` تُستخلص من `SuspicionSignal.reasonCode` دون تعديل — الخادم لا يُفسّرها، يُمررها مباشرة لـ AI.
4. **Normalization First**: كل أوامر AI تمر عبر `normalizeCommandsAgainstRequest` قبل الإعادة — الأوامر غير الصالحة تُحذف، المكررة تُدمج، الأنواع الخاطئة تُطبَّع.
5. **Graceful Degradation**: فشل API لا يوقف المحرر — يُعاد `status: "partial"` أو `status: "error"` مع رسالة وصفية، والأسطر تبقى بتصنيفها الأصلي.
