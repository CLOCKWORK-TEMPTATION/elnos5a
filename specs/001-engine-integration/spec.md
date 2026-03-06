# Feature Specification: دمج المحرك داخل التطبيق

**Feature Branch**: `001-engine-integration`
**Created**: 2026-03-06
**Status**: Draft
**Input**: خطة دمج محرك karank داخل المستودع كنسخة vendored مستقلة عن `D:\karank`

## User Scenarios & Testing _(mandatory)_

### User Story 1 - فتح/استيراد ملف سيناريو (Priority: P1)

المستخدم يفتح ملف سيناريو (docx/doc/txt/fountain/fdx/pdf) من واجهة التطبيق.
النظام يستخرج النص ويمرره عبر المحرك المضمّن داخل المشروع، ثم يعرض النتيجة
المصنّفة في المحرر بعد مرورها بكامل طبقات المراجعة.

**Why this priority**: هذه هي نقطة الدخول الأساسية للمستخدم. بدون استيراد ملفات
لا توجد قيمة فعلية من التطبيق.

**Independent Test**: فتح ملف `1990.docx` ورؤية النص مصنّفاً في المحرر دون
أي اعتماد على `D:\karank`.

**Acceptance Scenarios**:

1. **Given** ملف docx عربي موجود على الجهاز, **When** المستخدم يفتحه عبر
   واجهة الاستيراد, **Then** يظهر النص مصنّفاً بالعناصر الصحيحة
   (action, dialogue, character, scene headers, etc.) في المحرر
2. **Given** ملف pdf يحتوي سيناريو عربي, **When** المستخدم يستورده,
   **Then** يُستخرج النص عبر OCR ثم يُصنَّف عبر المحرك المضمّن
3. **Given** المحرك المضمّن يعمل, **When** الاستجابة تعود من bridge,
   **Then** الـ payload يحتوي `method = "karank-engine-bridge"` وجميع حقول
   الـ envelope (`schemaText`, `schemaElements`, `structuredBlocks`, `rawExtractedText`)

---

### User Story 2 - لصق نص سيناريو (Priority: P2)

المستخدم يلصق نصاً عربياً في المحرر. النظام يرسل النص إلى backend عبر
`/api/text-extract`، ويمرره بالمحرك المضمّن، ثم يعيد النتيجة المصنّفة
لتدخل بقية pipeline التصنيف.

**Why this priority**: اللصق هو ثاني أكثر طريقة إدخال شيوعاً بعد الاستيراد.

**Independent Test**: لصق فقرة نص عربي سيناريو ورؤية التصنيف الصحيح دون
الحاجة لفتح ملف.

**Acceptance Scenarios**:

1. **Given** نص عربي ملصوق يحتوي عناصر سيناريو, **When** المستخدم يلصقه
   في المحرر, **Then** النص يُرسل إلى `/api/text-extract` ويعود مصنّفاً
2. **Given** الناتج من `/api/text-extract` بصيغة schema (`ELEMENT = VALUE`),
   **When** يصل إلى `paste-classifier`, **Then** يُحوَّل مباشرة إلى
   `ClassifiedDraft` دون heuristic classification
3. **Given** ناتج schema يحتوي `cene_header_1` + `cene_header_2`,
   **When** يمر بالتحويل, **Then** يتحولان إلى عنصر `scene_header_1` +
   `scene_header_2` منفصلين

---

### User Story 3 - استقلالية التطبيق الكاملة (Priority: P1)

التطبيق يعمل بشكل كامل حتى لو لم يكن `D:\karank` موجوداً على الجهاز.
لا يوجد أي runtime reference أو path lookup خارج حدود المشروع.

**Why this priority**: P1 لأنه شرط قبول إلزامي يؤثر على كل السيناريوهات الأخرى.

**Independent Test**: حذف/إعادة تسمية `D:\karank` والتأكد أن التطبيق يعمل
بالكامل (استيراد + لصق + تصنيف + مراجعة + عرض).

**Acceptance Scenarios**:

1. **Given** `D:\karank` غير موجود على الجهاز, **When** المستخدم يشغّل
   التطبيق ويستورد ملفاً, **Then** كل شيء يعمل بشكل طبيعي
2. **Given** المحرك المضمّن في `server/karank_engine/engine/`, **When**
   يُفحص الكود بحثاً عن أي reference لـ `D:\karank`, **Then** لا يوجد
   أي reference في أي ملف runtime
3. **Given** غياب `python` من PATH, **When** التطبيق يحاول تشغيل المحرك,
   **Then** يظهر خطأ صريح وواضح يشرح المشكلة (ليس crash صامت)

---

### User Story 4 - سلامة pipeline التصنيف بعد المحرك (Priority: P2)

بعد أن يعود الناتج من المحرك المضمّن، كل طبقات المراجعة الحالية تبقى تعمل:
`PostClassificationReviewer` → routing bands → agent review عند الحاجة.

**Why this priority**: ضمان أن دمج المحرك لا يُضعف جودة التصنيف النهائية.

**Independent Test**: استيراد ملف والتحقق أن الناتج يمر بطبقة الشك
و `/api/agent/review` عند وجود سطور مشبوهة.

**Acceptance Scenarios**:

1. **Given** ناتج محرك يحتوي سطور بثقة منخفضة, **When** يمر بـ
   `PostClassificationReviewer`, **Then** السطور المشبوهة تُوسم بعلامات
   الشك المناسبة
2. **Given** suspicion score >= 74 مع >= 2 detector findings, **When**
   يصل إلى routing, **Then** يُرسل إلى `/api/agent/review` للمراجعة

---

### Edge Cases

- ماذا يحدث عندما يموت bridge process أثناء معالجة طلب؟
  - محاولة إعادة تشغيل واحدة فقط. إذا فشلت → خطأ نهائي صريح للمستخدم
- ماذا يحدث عندما يحتوي الناتج على orphan `cene_header_1` بدون
  `cene_header_2`؟
  - يُحوَّل إلى `scene_header_1` جزئي مع telemetry واضح
- ماذا يحدث عندما يحتوي الناتج على element غير معروف؟
  - يُرفض الطلب بخطأ صريح
- ماذا يحدث عندما يكون ملف docx فارغاً أو تالفاً؟
  - يُعاد خطأ واضح للمستخدم دون crash

## Clarifications

### Session 2026-03-06

- Q: كم محاولة إعادة تشغيل bridge قبل إظهار خطأ نهائي؟ → A: البريدج عنصر ثابت وأساسي — محاولة إعادة تشغيل واحدة فقط، وإذا فشلت يظهر خطأ نهائي صريح للمستخدم فوراً.
- Q: ما إصدار Python المطلوب كحد أدنى؟ → A: Python 3.12

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: النظام MUST ينسخ محرك karank إلى `server/karank_engine/` كملفات
  tracked داخل المستودع
- **FR-002**: النظام MUST يشغّل `ts_bridge.py` كعملية طويلة العمر بتشغيل lazy
  عند أول طلب
- **FR-003**: النظام MUST يدعم `ping` عند بدء bridge للتحقق من الجاهزية
- **FR-004**: النظام MUST يعيد تشغيل bridge محاولة واحدة فقط عند موت العملية.
  إذا فشلت المحاولة، يظهر خطأ نهائي صريح فوراً (البريدج عنصر ثابت وأساسي)
- **FR-005**: النظام MUST يفشل صراحةً مع رسالة واضحة إذا غاب Python 3.12+
  أو ملفات المحرك
- **FR-006**: النظام MUST لا يحتوي أي fallback أو reference لـ `D:\karank`
  في runtime
- **FR-007**: `server/file-import-server.mjs` MUST يتعامل مع كل أنواع
  الملفات (docx/doc/txt/fountain/fdx/pdf) عبر المحرك المضمّن
- **FR-008**: النظام MUST يوفر endpoint جديد `POST /api/text-extract`
  للنصوص الملصوقة بنفس envelope الخاص بـ `/api/file-extract`
- **FR-009**: `paste-classifier` MUST يفهم صيغة `ELEMENT = VALUE` ويحولها
  مباشرة إلى `ClassifiedDraft` دون heuristic classification
- **FR-010**: `cene_header_1` + `cene_header_2` MUST يتحولان إلى
  `scene_header_1` + `scene_header_2`
- **FR-011**: `scene_header_3` MUST يتحول إلى `scene_header_3`
- **FR-012**: أي element غير معروف في ناتج المحرك MUST يُرفض بخطأ صريح
- **FR-013**: طبقات المراجعة (`PostClassificationReviewer`, `/api/agent/review`)
  MUST تبقى فعّالة بعد ناتج المحرك
- **FR-014**: الـ payload الموحد MUST يحتوي: `text`, `rawExtractedText`,
  `schemaText`, `schemaElements`, `structuredBlocks`, `method`

### Key Entities

- **KarankBridge**: مدير عملية Python bridge — يتولى التشغيل، المراقبة،
  وإعادة التشغيل
- **SchemaElement**: زوج `{ element: string; value: string }` ناتج من المحرك
- **FileExtractionResult (موسّع)**: يضاف له `schemaText`, `schemaElements`,
  `rawExtractedText`
- **ExtractionMethod (موسّع)**: يضاف له `karank-engine-bridge`
- **ClassificationMethod (موسّع)**: يضاف له `external-engine`

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: المستخدم يستطيع فتح ملف docx عربي ورؤية التصنيف الصحيح في
  المحرر خلال زمن معقول (< 10 ثوانٍ لملف 50 صفحة)
- **SC-002**: المستخدم يستطيع لصق نص عربي ورؤية التصنيف خلال < 3 ثوانٍ
- **SC-003**: التطبيق يعمل بالكامل بدون وجود `D:\karank` على الجهاز
- **SC-004**: كل أنواع الملفات المدعومة (docx/doc/txt/fountain/fdx/pdf)
  تُستخرج وتُصنَّف بنجاح عبر المحرك المضمّن
- **SC-005**: pipeline المراجعة (شك + agent review) تعمل بشكل طبيعي
  على ناتج المحرك المضمّن
- **SC-006**: عند غياب `python`، المستخدم يرى رسالة خطأ واضحة ومفهومة
  (ليس stack trace)
- **SC-007**: عند موت bridge أثناء العمل، يُعاد تشغيله تلقائياً (محاولة واحدة).
  إذا فشلت المحاولة، يظهر خطأ واضح للمستخدم فوراً
