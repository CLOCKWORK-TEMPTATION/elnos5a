# Feature Specification: محرك الاشتباه (Suspicion Engine)

**Feature Branch**: `002-suspicion-engine`
**Created**: 2026-03-07
**Status**: Draft
**Input**: بناء محرك اشتباه مستقل يعمل كـ Bounded Context بين المصنّف وطبقات الحسم

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - تسجيل أثر التصنيف (Classification Trace) (Priority: P1)

المستخدم يلصق نصًا عربيًا طويلًا يحتوي على مشاهد وحوارات وشخصيات وتعليمات إخراجية. في الوضع الحالي، كل ممر من ممرات التصنيف (forward, retroactive, reverse, viterbi) ينتج نتيجته ثم يختفي. إذا اختلف الممر الأول مع الممر الأخير، لا يوجد سجل لهذا الخلاف. المحرك الجديد يجمع من كل ممر تصويته المهيكل (نوع مقترح + ثقة + رمز السبب) في trace موحد لكل سطر، بما يشمل الإصلاحات التي طرأت عليه (دمج، تقسيم، إعادة كتابة) ومؤشرات جودة النص الخام.

**Why this priority**: بدون trace كامل، طبقة الاشتباه تعمل على النتيجة النهائية فقط وتفقد كل السياق الذي أفضى إليها. هذا هو الأساس الذي تقوم عليه بقية المكونات.

**Independent Test**: يمكن اختباره باستقلالية عن طبقة الاشتباه بالكامل: تمرير نص، تشغيل ممرات التصنيف، ثم التحقق من أن الـ trace يحتوي على تصويت لكل ممر شارك، وأن حقل finalDecision مكتمل، وأن الإصلاحات مسجلة بترتيب حدوثها.

**Acceptance Scenarios**:

1. **Given** سطر مر عبر ممري forward و reverse، **When** يكتمل التصنيف، **Then** يحتوي الـ trace على تصويتين متمايزين أحدهما من stage "forward" والآخر من "reverse".
2. **Given** سطر خضع لعملية دمج مع السطر التالي، **When** يكتمل التصنيف، **Then** يحتوي الـ trace على سجل repair من نوع "merge" يبين النص قبل الدمج وبعده.
3. **Given** سطر ذو جودة نص منخفضة (نص OCR مشوه)، **When** يكتمل التصنيف، **Then** يعكس الـ trace مؤشر lineQuality بقيمة score أقل من عتبة محددة مسبقًا.
4. **Given** ممران يقترحان نوعين مختلفين لنفس السطر، **When** يُنشأ الـ trace، **Then** تكون كلا التصويتين محفوظتين ولا يُحذف أي منهما لصالح الآخر.

---

### User Story 2 - كشف الشكوك تلقائياً (Detector Suite) (Priority: P2)

المستخدم يلصق سيناريو يحتوي على اسم شخصية بدون النقطتين المميزتين له، وعلى حوار يتبع مباشرة سطر تعليمات إخراجية بدون شخصية تسبقه (حوار يتيم). النظام الحالي يفحص هذه الحالات داخل كتلة مركزية واحدة لا يمكن توسيعها أو اختبار أجزائها بشكل مستقل. المحرك الجديد يقسم الكشف إلى كواشف مستقلة موزعة في عائلات: gate-break (كسر بوابة العنصر)، context (تناقض السياق)، corruption (فساد النص)، cross-pass (تضارب الممرات)، source (تناقض مصدر الاستيراد). كل كاشف ينتج SuspicionSignal مهيكلة ذات reasonCode وevidence typed لا نصًا حرًا فقط.

**Why this priority**: الكواشف هي مصدر الأدلة التي تستهلكها بقية المكونات. جودة الكشف وقابليته للتوسعة والاختبار ترسم حدود دقة النظام كله.

**Independent Test**: يمكن تشغيل أي كاشف منفردًا بتمريره trace مُعدًّا يدويًا، والتحقق من أن الإشارة المنتجة تحتوي على signalId، وfamily صحيحة، وscore ضمن النطاق المتوقع، وevidence يحتوي على القيم المتعلقة بالحالة.

**Acceptance Scenarios**:

1. **Given** سطر مصنف كـ character لا ينتهي بنقطتين ولا يتبعه سطر حوار، **When** يشتغل character-gate detector، **Then** ينتج SuspicionSignal من family "gate-break" مع reasonCode يحدد المشكلة وscore أعلى من صفر.
2. **Given** سطر مصنف كـ dialogue لم يسبقه character في السياق المباشر، **When** يشتغل orphan-dialogue detector، **Then** ينتج إشارة من family "context-contradiction".
3. **Given** سطر قدّم له forward نوع A وقدّم له reverse نوع B مختلف، **When** يشتغل reverse-conflict detector، **Then** ينتج إشارة من family "multi-pass-conflict" تتضمن كلا النوعين في حقل evidence.
4. **Given** كاشفان ينتجان إشارتين متعارضتين (مثل gate-break مع اقتراح type مختلف وcontext-contradiction تؤكد النوع الأصلي)، **When** تعمل عليهما طبقة التجميع، **Then** يُحتفظ بكلتا الإشارتين في قضية الشك دون أن يُحذف أي منهما.
5. **Given** كاشف يعمل على trace سطر لا يمتلك أي ممر اختلف مع النوع النهائي، **When** ينتهي الكشف، **Then** لا ينتج الكاشف أي إشارة (score = 0 أو عدم وجود SuspicionSignal).

---

### User Story 3 - تجميع الأدلة وحساب الدرجة (Evidence Aggregation) (Priority: P3)

المستخدم يلصق نصًا به سطر واحد حدودي: كُسرت بوابته، وتضارب حوله ممران، واقترح ثلاثة كواشف نوعًا بديلًا واحدًا. النظام الحالي يحسب الدرجة إما كأعلى إشارة (max) أو كمجموع بسيط (sum)، فلا يستفيد من التنوع ولا يُضخم الحالات الحرجة بشكل مناسب. المحرك الجديد يجمع جميع الإشارات في SuspicionCase واحدة لكل سطر، ويحسب درجة متعددة العوامل تأخذ في الحسبان: أعلى إشارة حرجة، وتنوع الإشارات عبر العائلات، ووجود اقتراح type متكرر، وشدة التضارب بين الممرات، وجودة النص الخام، وهشاشة القرار الأصلي. تتحكم في هذا الحساب SuspicionWeightPolicy قابلة للتهيئة مع profiles جاهزة.

**Why this priority**: التجميع الذكي يمنع إرسال حالات بسيطة إلى AI مما يخفض التكلفة، ويضمن ألا تفوت الحالات المعقدة فعلًا.

**Independent Test**: يمكن اختباره بتمرير مجموعة إشارات مُعدَّة يدويًا وملاحظة أن: إشارة واحدة حرجة وحدها تنتج درجة أعلى مما تنتجه ثلاث إشارات بسيطة من نفس العائلة، وأن وجود اقتراح type مكرر يرفع primarySuggestedType في السكور النهائي.

**Acceptance Scenarios**:

1. **Given** سطر به إشارة gate-break واحدة فقط بدون إشارات أخرى، **When** يُحسب السكور بـ balanced-paste policy، **Then** تكون درجة الشك ضمن نطاق local-review ولا ترقى إلى agent-candidate.
2. **Given** سطر به إشارات من ثلاث عائلات مختلفة وكلها تقترح نفس النوع البديل، **When** يُحسب السكور، **Then** يُسجَّل الـ primarySuggestedType في SuspicionCase ويكون الـ band أعلى مما لو كانت الإشارات في عائلة واحدة.
3. **Given** تغيير SuspicionWeightPolicy بمضاعفة وزن rawCorruption، **When** يُعاد حساب نفس الإشارات، **Then** تتغير درجة الشك وفق النسبة المتوقعة رياضيًا.
4. **Given** سطر ذو نص OCR مشوه مع إشارة واحدة خفيفة، **When** يُطبق profile ocr-heavy، **Then** يكون الـ band أعلى مما لو طُبّق profile balanced-paste على نفس الإشارات.

---

### User Story 4 - توجيه وحسم محلي (Local Resolution) (Priority: P4)

المستخدم يلصق سيناريو فيه عشرة أسطر مصنفة خطأ بسبب غياب النقطتين بعد أسماء الشخصيات. هذه الحالات قابلة للتصحيح الآلي الحتمي (اسم بلا نقطتين + حوار يتبعه = character). في الوضع الحالي، تنتظر هذه الحالات المراجعة بعد العرض. المحرك الجديد يطبق الإصلاحات الحتمية المحلية قبل العرض الأول (render-first guarantee)، ويمرر الحالات الغامضة أو المتضاربة إلى مسارات داخلية مناسبة (repair-then-reclassify, local-review, agent-candidate, agent-forced) دون المساس بالعقود الخارجية الحالية للمسارات الأربعة (pass, local-review, agent-candidate, agent-forced).

**Why this priority**: المستخدم لا يجب أن يرى أخطاء واضحة على الشاشة يمكن إصلاحها حتميًا. الإصلاح المحلي الحتمي هو الخط الأول قبل أي AI.

**Independent Test**: يمكن اختباره بتجهيز مجموعة SuspicionCases بـ bands مختلفة، تشغيل ResolutionCoordinator بدون AI resolver، والتحقق من أن الحالات المؤهلة لـ auto-local-fix تُصحَّح وأن النتيجة تُعاد برمجيًا قبل أن تصل إلى العرض.

**Acceptance Scenarios**:

1. **Given** سطر به gate-break حاسم لـ character وبديل واضح مقترح ولا يوجد تضارب ممرات، **When** يعمل ResolutionCoordinator، **Then** يُطبَّق الإصلاح محليًا وتُعاد درجة الثقة بحالة "relabel" قبل العرض.
2. **Given** سطر مصنف من نوع action لكنه في الواقع حوار مقسوم عبر سطرين، **When** يُطبَّق LocalRepairResolver، **Then** يُدمج السطران ويُعاد تصنيف الناتج ضمن نفس الرهان الزمني للعرض.
3. **Given** حالة شك غامضة بـ band=local-review، **When** يعمل ResolutionCoordinator، **Then** تُسجَّل في ResolutionOutcome بحالة "deferred" ولا يتغير assignedType حتى يصل قرار مراجعة.
4. **Given** تغيير في routing policy يجعل عتبة agent-candidate أعلى، **When** تُعاد معالجة نفس الحالات، **Then** ينعكس التغيير على توزيع الـ bands في SuspicionEngineOutput.routing.

---

### User Story 5 - تصعيد ذكي إلى AI (Remote AI Resolution) (Priority: P5)

المستخدم يلصق نصًا فيه خمس حالات شك عالية لا تستطيع الإصلاحات المحلية حسمها. في الوضع الحالي، ترسل حزمة المراجعة إلى AI نصًا وأسبابًا وسياقًا وأنواعًا مقترحة كنص غير مهيكل. المحرك الجديد يبني حزمة مراجعة مهيكلة لكل حالة تحتوي على evidence مُصنَّفة (gateBreaks, alternativePulls, contextContradictions, rawCorruptionSignals, multiPassConflicts) تسمح لـ AI بمراجعة القضية لا مجرد السطر. تُرسل الحزم بشكل async بعد العرض الأول ولا تحجب إظهار النتيجة. AI هو resolver خارجي اختياري لا جزء من النواة.

**Why this priority**: AI يمكنه اتخاذ قرارات أفضل إذا رأى الأدلة المهيكلة كاملة بدلًا من نص + أسباب نصية. كذلك فصله كـ adapter خارجي يجعل النظام يعمل بدونه ولا يُكسر عند timeout.

**Independent Test**: يمكن اختباره بـ mock لـ AI resolver يتحقق من شكل الـ payload المُرسل: أن يحتوي على suspicionScore وevidence بعائلاتها وcontextLines وprimarySuggestedType. وبالتحقق أيضًا من أن النتيجة عند AI timeout تكون ResolutionOutcome بحالة "deferred" لا خطأ.

**Acceptance Scenarios**:

1. **Given** حالة شك بـ band=agent-forced، **When** يُبنى الـ payload، **Then** يحتوي على suspicionScore وجميع حقول evidence المهيكلة وcontextLines ولا يحتوي فقط على text وreasons[].
2. **Given** انتهاء مهلة AI (timeout)، **When** يعود RemoteAIResolver، **Then** تُسجَّل ResolutionOutcome بحالة "deferred" دون رمي استثناء يُوقف المسار.
3. **Given** AI يُعيد verdict بنوع مختلف عن assignedType مع confidence > 0.8، **When** يُطبَّق الـ verdict، **Then** تتحول حالة السطر إلى النوع الجديد وتُسجَّل بـ resolver = "remote-ai".
4. **Given** AI معطَّل تمامًا (مفتاح API غير موجود)، **When** يعمل المحرك، **Then** تُعامَل جميع حالات agent-candidate و agent-forced كـ "deferred" وتكمل بقية الإصلاحات المحلية عملها بشكل طبيعي.
5. **Given** مجموعة من 20 حالة منها 3 بـ band=agent-forced و5 بـ band=agent-candidate، **When** يُرسَل التصعيد، **Then** تُرسَل حزم agent-forced أولًا بترتيب أولوية قبل agent-candidate.

---

### Edge Cases

- **نص فارغ**: عند تمرير نص فارغ إلى المحرك، يُعيد SuspicionEngineOutput بـ cases=[] وrouting يُظهر أصفارًا في جميع الفئات دون رمي استثناء.
- **سطر واحد فقط**: سطر وحيد بلا سياق سابق أو لاحق يُعالَج بكواشف gate-break فقط؛ تُعطَّل كواشف context التي تحتاج سياقًا ولا تُنتج إشارات.
- **جميع الأسطر من نفس النوع**: نص كله action مثلًا يُعيد SuspicionCases بـ band=pass لجميعها ما لم يكشف كاشف تناقضًا في النوع الموحد نفسه.
- **نص OCR ثقيل**: نسبة عالية من arabicRatio المنخفض وweirdCharRatio المرتفع يُنشّط profile ocr-heavy تلقائيًا ويرفع أوزان عائلة corruption دون الحاجة إلى تدخل يدوي.
- **كاشفان متعارضان على نفس السطر**: كاشف يقترح نوعًا بديلًا وكاشف آخر يؤكد النوع الأصلي لا يُلغي أي منهما الآخر؛ يحتفظ EvidenceAggregator بكلا الإشارتين ويترك قرار الترجيح لسياسة السكور.
- **AI timeout متكرر**: إذا تجاوز عدد timeout متتالية عتبة محددة في السياسة، يُعطَّل RemoteAIResolver تلقائيًا للجلسة الحالية وتُسجَّل جميع الحالات المتبقية كـ "deferred" مع إشعار telemetry.
- **trace ناقص (ممر لم يُسجَّل)**: إذا لم يُسجَّل ممر ما تصويته (بسبب اختصار مسار التنفيذ)، تعمل كواشف cross-pass على الممرات المتاحة فقط دون أن تُنتج إشارات زائفة لممر غائب.
- **جميع الأسطر تحصل على band=agent-forced**: إذا رفع إعداد policy الأوزان بحيث يتجاوز كل سطر عتبة agent-forced، يجب أن يُطبّق المحرك أولًا الإصلاحات المحلية الحتمية قبل الإرسال ويُخفّف من band حسب نتائجها.

---

## Clarifications

### Session 2026-03-07

- Q: ما القيم الكانونية لـ `SuspicionSignal.family`؟ المواصفات تستخدم أسماء تجميعية والخطة تستخدم أسماء تنفيذية مختلفة. → A: حقلان منفصلان: `family` (تصنيف عام ثابت بخمس قيم: gate-break, context, corruption, cross-pass, source) و`signalType` (قيمة تنفيذية دقيقة للسكور: gate-break, alternative-pull, context-contradiction, raw-corruption, multi-pass-conflict, source-risk). كل family يقيّد signalTypes المسموحة تحته.
- Q: ما استراتيجية typing لـ `SuspicionSignal.evidence`؟ FR-004 والدستور يشترطان typed لكن التعريف الفعلي `Record<string, unknown>`. → A: discriminated union strict مفتاح التمييز فيه هو `signalType` (لا family). لكل signalType واجهة evidence مسمّاة (GateBreakEvidence, AlternativePullEvidence, ContextContradictionEvidence, RawCorruptionEvidence, MultiPassConflictEvidence, SourceRiskEvidence). يمكن تضييق الحقول أكثر عبر reasonCode عند الحاجة. حقل debug اختياري منفصل `Record<string, string | number | boolean | null>` للبيانات غير الكانونية.
- Q: كيف يُقاس SC-005 (200ms render-first)؟ "جهاز مرجعي موحد" غير معرّف. → A: SC-005 يبقى SLA مطلق (200ms) يُقاس عبر benchmark يدوي أو dedicated runner على جهاز مرجعي موثق في docs/performance-reference.md. يُضاف SC-005a كحارس انحدار نسبي مستقل في CI (لا يزيد عن 30% overhead مقارنة بـ baseline مُخزَّن). B ليس بديلاً عن C بل مكمّل.
- Q: ما عقد circuit-breaker لـ AI timeout المتكرر؟ العتبة غير معرّفة ولا FR لها. → A: إضافة FR-017 بسلوك circuit-breaker صريح. العتبة والمهلات تعيش في سياسة مستقلة RemoteAIResolverPolicy (لا داخل SuspicionWeightPolicy) لفصل منطق السكور عن المرونة التشغيلية. الحقول الإلزامية: requestTimeoutMs, consecutiveTimeoutThreshold, circuitOpenDurationMs, halfOpenProbeLimit. الحالات: closed → open (عند بلوغ العتبة) → half-open (بعد المهلة) → closed (عند نجاح probe).
- Q: مجموعة الاختبار المرجعية (200 سطر) غير موجودة. كيف تُقيَّم SC-001 وSC-002؟ → A: إنشاء corpus المرجعي مهمة مستقلة سابقة (PR-001) وليس جزءًا من تنفيذ الميزة. SC-001 وSC-002 يبقيان بأرقامهما لكن غير قابلين للتقييم قبل إنجاز PR-001. الـ corpus يُخزَّن كـ JSONL fixture مُنسَّخ (versioned) بحقول: id, text, goldLabel, sourceCategory, isAmbiguous, adjudicationStatus. يُمنع تقييم SC-001/SC-002 على أمثلة ad hoc أو unit test data.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: يجب أن يُسجَّل تصويت كل ممر تصنيف (forward, retroactive, reverse, viterbi, hybrid, schema-hint) في ClassificationTrace الخاص بكل سطر مع النوع المقترح ودرجة الثقة ورمز السبب، ولا يُحذف أي تصويت عند اختيار النوع النهائي.

- **FR-002**: يجب أن يُسجَّل كل تعديل طرأ على السطر (دمج، تقسيم، إعادة كتابة جزئية) في قسم repairs من الـ trace بترتيب حدوثه مع حالة النص قبل التعديل وبعده.

- **FR-003**: يجب أن يعمل كل كاشف في DetectorSuite باستقلالية تامة: مدخله ClassificationTrace وسياق السطر، ومخرجه صفر أو أكثر من SuspicionSignal، ولا يستدعي كاشف آخر ولا يعدّل الـ trace.

- **FR-004**: يجب أن تنتج كل SuspicionSignal حقلين تصنيفيين: family (تصنيف عام من خمس قيم ثابتة) وsignalType (قيمة تنفيذية دقيقة مقيدة بالـ family)، إضافة إلى reasonCode مُعرَّف مسبقًا (لا نصًا حرًا) وحقل evidence من نوع discriminated union strict مفتاحه signalType (لكل signalType واجهة evidence مسمّاة خاصة به). يُمنع استخدام `Record<string, unknown>` كنوع evidence أساسي. حقل debug اختياري منفصل للبيانات غير الكانونية.

- **FR-005**: يجب أن تُوزَّع الكواشف في عائلات منفصلة (gate-break, context, corruption, cross-pass, source)، وأن تُصنَّف كل SuspicionSignal بعائلتها الصحيحة ضمن SuspicionCase.summary.

- **FR-006**: يجب أن يحسب EvidenceAggregator درجة الشك كدالة متعددة العوامل تأخذ في الحسبان أعلى إشارة حرجة وتنوع الإشارات عبر العائلات وتكرار اقتراح نوع بديل واحد وشدة التضارب بين الممرات وجودة النص الخام وهشاشة القرار الأصلي، ولا تعتمد فقط على max() أو sum().

- **FR-007**: يجب أن تكون SuspicionWeightPolicy قابلة للتهيئة كاملًا من خارج المحرك، وأن يوفر النظام ثلاثة profiles جاهزة: strict-import و balanced-paste و ocr-heavy، مع إمكانية اختيار profile حسب مصدر الاستيراد.

- **FR-008**: يجب أن يحتفظ النظام بأربعة مسارات خارجية بالأسماء الحالية بالضبط (pass, local-review, agent-candidate, agent-forced) للتوافق مع العقود الخارجية، بينما يستخدم داخليًا ستة مسارات (none, auto-local-fix, repair-then-reclassify, local-review, agent-candidate, agent-forced).

- **FR-009**: يجب أن تُطبَّق جميع الإصلاحات الحتمية المحلية (InternalResolutionRoute = "auto-local-fix") قبل العرض الأول للمستخدم (render-first guarantee)، وأن يُعاد الـ assignedType المصحح في النتيجة الأولى دون انتظار أي رد خارجي.

- **FR-010**: يجب أن يعمل LocalRepairResolver على حالات split/merge/wrapped-line ويُعيد تصنيف الناتج ضمن نفس الدورة المحلية قبل العرض عند إمكانية تحديد الإصلاح الصحيح بثقة كافية.

- **FR-011**: يجب أن يكون RemoteAIResolver adapter خارجيًا اختياريًا: إذا لم يكن متاحًا أو تجاوز مهلة الاستجابة، يُكمل المحرك عمله ويسجل الحالات كـ "deferred" دون إيقاف المسار أو رمي استثناء يصل إلى المستخدم.

- **FR-012**: يجب أن يحتوي الـ payload المُرسَل إلى AI على: lineIndex وtext وassignedType وoriginalConfidence وsuspicionScore وprimarySuggestedType وevidence مُصنَّفة بعائلاتها وcontextLines، ولا يُقبَل payload يحتوي فقط على text وreasons[] نصية.

- **FR-013**: يجب أن توفر جميع resolvers واجهة ResolutionOutcome موحدة تحتوي على: lineIndex وstatus وcorrectedType وconfidence واسم الـ resolver المستخدم وقائمة الأدلة المستخدمة في القرار.

- **FR-014**: يجب أن يُسجَّل كل قرار يتخذه المحرك (اشتباه، توجيه، حسم) في طبقة telemetry مستقلة تتضمن التوقيت وعدد الإشارات وband القرار ونوع الـ resolver، دون أن تؤثر هذه الطبقة على سير المعالجة.

- **FR-015**: يجب أن يُنتج المحرك SuspicionEngineOutput يتضمن حصيلة التوجيه الكمية (عدد الحالات في كل band + عدد الحالات المُصلحة محليًا تلقائيًا) حتى يمكن قياس أداء المحرك بشكل مستمر.

- **FR-016**: يجب أن يُعالج المحرك السطور الفارغة وسطور الفراغ الهيكلي (whitespace-only) دون توليد إشارات شك زائفة، ودون احتساب الممرات الغائبة عنها كتضاربات.

- **FR-017**: يجب أن يُطبّق RemoteAIResolver نمط circuit-breaker صريح: عند بلوغ عدد timeout متتالية العتبة المحددة في RemoteAIResolverPolicy (consecutiveTimeoutThreshold)، يُفتح الـ circuit ويُمنع أي استدعاء AI جديد. أثناء الفتح تُوجَّه الحالات إلى local-review أو deferred. بعد انقضاء circuitOpenDurationMs ينتقل إلى half-open ويسمح بعدد محدود من الطلبات الاستكشافية (halfOpenProbeLimit). نجاح الاستكشاف يُغلق الـ circuit؛ فشله يُعيد الفتح. هذه السياسة مستقلة عن SuspicionWeightPolicy.

---

### Key Entities

- **ClassificationTrace**: سجل موحد لكل سطر يجمع: رقم السطر، النص الخام، النص المعيَّر، passVotes (تصويت كل ممر)، repairs (قائمة التعديلات المتسلسلة)، sourceHints (مصدر الاستيراد وجودة النص)، finalDecision (النوع النهائي والثقة والطريقة). هو المصدر الوحيد الذي يستهلكه Suspicion Domain.

- **SuspicionSignal**: إشارة شك منتجة من كاشف واحد، تحتوي على: signalId فريد، family (تصنيف عام من خمس قيم: gate-break, context, corruption, cross-pass, source)، signalType (قيمة تنفيذية دقيقة: gate-break, alternative-pull, context-contradiction, raw-corruption, multi-pass-conflict, source-risk)، score رقمي، reasonCode مُعرَّف مسبقًا، message بشري-قابل للقراءة، suggestedType اختياري، evidence من نوع discriminated union strict مفتاحه signalType (GateBreakEvidence, AlternativePullEvidence, ContextContradictionEvidence, RawCorruptionEvidence, MultiPassConflictEvidence, SourceRiskEvidence)، مع حقل debug اختياري منفصل. كل family يقيّد قيم signalType المسموحة تحته.

- **SuspicionCase**: قضية شك مُجمَّعة لسطر واحد، تحتوي على: رقم السطر، السطر المصنَّف، الـ trace الكامل، قائمة جميع الإشارات، ملخص مُصنَّف بالعائلات، الدرجة الإجمالية، الـ band المحسوب، علامة critical، والنوع البديل الأرجح.

- **SuspicionFeature**: خاصية مُستخلصة من الـ trace تمثل مدخلًا موحدًا للكواشف، مصنفة في ست فئات: Gate, Context, RawQuality, CrossPass, Competition, Stability. تُنشئها SuspicionFeatureAssembler من الـ trace والسياق.

- **ResolutionOutcome**: نتيجة موحدة من أي resolver، تحتوي على: رقم السطر، status (confirmed / relabel / repair-and-reclassify / deferred)، النوع المصحح اختياريًا، الثقة اختياريًا، اسم الـ resolver، وقائمة الأدلة المستخدمة. هي العقد الوحيد بين resolvers وبقية النظام.

- **SuspicionWeightPolicy**: كائن تهيئة يحدد أوزان كل عائلة من عائلات الإشارات (gateBreak, contextContradiction, rawCorruption, multiPassConflict, alternativePull) إضافة إلى معاملات التعزيز (diversityBoost, criticalMismatchBoost) ومعاملات العقوبة (lowConfidencePenalty). ينتمي إلى Infrastructure ويُحقَن في المحرك عند التهيئة. مسؤول عن السكور فقط، لا عن المرونة التشغيلية.

- **RemoteAIResolverPolicy**: سياسة مستقلة عن SuspicionWeightPolicy تتحكم في سلوك الـ Remote AI resolver التشغيلي. تحتوي على: requestTimeoutMs (مهلة الطلب الواحد)، consecutiveTimeoutThreshold (عتبة فتح circuit-breaker)، circuitOpenDurationMs (مدة بقاء الـ circuit مفتوحًا)، halfOpenProbeLimit (عدد الطلبات الاستكشافية عند half-open). تنتمي إلى Infrastructure وتُحقَن في RemoteAIResolver عند التهيئة.

- **InternalResolutionRoute**: تعداد داخلي بستة قيم: none, auto-local-fix, repair-then-reclassify, local-review, agent-candidate, agent-forced. يحدده RoutingPolicy بناءً على SuspicionCase ولا يُكشَف مباشرة في الواجهة الخارجية.

- **SuspicionEngineInput**: مدخل المحرك الرئيسي يحتوي على: classifiedLines (للقراءة فقط)، traces (للقراءة فقط)، نتيجة sequence optimization الاختيارية، وخريطة LineQuality الاختيارية مفهرسة برقم السطر.

- **SuspicionEngineOutput**: مخرج المحرك الرئيسي يحتوي على: cases (قائمة SuspicionCase للقراءة فقط)، routing (حصيلة كمية بعدد كل band وعدد الحالات المُصلحة محليًا)، actions (قائمة ResolutionOutcome للقراءة فقط للإصلاحات المطبَّقة فعلًا).

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **PR-001 - جاهزية المجموعة المرجعية (Prerequisite)**: يجب أن توجد مجموعة مرجعية مُعلَّمة يدويًا من 200 سطر سيناريو عربي على الأقل، مُنسَّخة ومُراجَعة، مخزّنة كـ JSONL fixture بحقول: id, text, goldLabel, sourceCategory, isAmbiguous, adjudicationStatus. هذا شرط إلزامي سابق لتقييم SC-001 وSC-002. إنشاء المجموعة مهمة مستقلة خارج نطاق تنفيذ الميزة.

- **SC-001 - تحسين دقة التصنيف** _(يتطلب PR-001)_: بعد تطبيق المحرك على المجموعة المرجعية، يجب أن تتحسن دقة التصنيف النهائي (accuracy على النوع الصحيح) بما لا يقل عن 8 نقاط مئوية مقارنةً بالنظام الحالي بدون المحرك.

- **SC-002 - معدل الإصلاح المحلي** _(يتطلب PR-001)_: لا يقل 60% من الحالات التي كانت تُرسَل سابقًا إلى AI عن إصلاحها محليًا (auto-local-fix أو local-repair) دون الحاجة إلى remote AI resolver، مقيسًا على المجموعة المرجعية.

- **SC-003 - تخفيض استدعاءات AI**: لا يتجاوز عدد استدعاءات RemoteAIResolver 25% من مجموع السطور في أي جلسة لصق نموذجية (100-300 سطر)، مع الحفاظ على دقة مكافئة أو أعلى مقارنةً بالإرسال الشامل.

- **SC-004 - اكتمال الـ trace**: في 100% من حالات التصنيف الناجح، يجب أن يحتوي ClassificationTrace على تصويت على الأقل من ممر واحد ونوع نهائي مُسجَّل. لا يُقبَل trace بـ passVotes فارغ وفي نفس الوقت finalDecision مكتمل.

- **SC-005 - ضمان العرض أولًا (Render-First Timing)**: يجب أن يكتمل تطبيق جميع الإصلاحات الحتمية المحلية وإعادة النتيجة المصححة للعرض خلال لا يزيد عن 200 ميلي ثانية إضافية على وقت تصنيف pipeline الحالي لمجموعة مكونة من 100 سطر. يُقاس عبر benchmark مخصص على جهاز مرجعي موثق في docs/performance-reference.md (لا في CI العام). هذا SLA منتج مطلق.

- **SC-005a - حارس الانحدار في CI**: في CI العام، يجب ألا يتجاوز الـ median execution time لـ benchmark محرك الاشتباه نسبة 30% overhead مقارنة بـ baseline مُخزَّن لنفس الـ fixture. هذا حارس انحدار نسبي مكمّل لـ SC-005 وليس بديلًا عنه.

- **SC-006 - تغطية عائلات الكشف**: يجب أن يكون لكل عائلة من العائلات الخمس (gate-break, context, corruption, cross-pass, source) على الأقل ثلاثة كواشف مُختبَرة بحالات اختبار مستقلة تثبت أن كل كاشف ينتج إشارة في حالة إيجابية حقيقية ولا ينتج في حالة سلبية حقيقية.

- **SC-007 - صحة payload AI**: في 100% من الحالات المرسلة إلى RemoteAIResolver، يجب أن يحتوي الـ payload المُبنى على جميع الحقول الإلزامية: suspicionScore وevidence بجميع عائلاتها (حتى الفارغة) وcontextLines وprimarySuggestedType. أي payload ناقص يُعدّ فشلًا في الاختبار.
