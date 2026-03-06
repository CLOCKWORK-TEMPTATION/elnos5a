# دمج المحرك داخل `C:\Users\Mohmed Aimen Raed\elnos5a` كجزء من التطبيق نفسه

## الملخص

- يبدأ التنفيذ من فرع جديد `elmo7rk` منشأ من `main`.
- هذه الخطة تستبدل الاعتماد الخارجي على `D:\karank` في وقت التشغيل بالكامل.
- المحرك سيُنقل إلى داخل المستودع نفسه كـ vendored runtime tracked files، ويصبح مساره التشغيلي الثابت داخل التطبيق:
  - `C:\Users\Mohmed Aimen Raed\elnos5a\server\karank_engine\engine\...`
  - ويُشغَّل الـ bridge من:
    - `C:\Users\Mohmed Aimen Raed\elnos5a\server\karank_engine\engine\ts_bridge.py`
- `D:\karank` سيُستخدم فقط مرة واحدة كمصدر نسخ أولي أثناء التنفيذ، ثم يصبح التطبيق مستقلًا تمامًا عنه. لا `submodule`، لا `symlink`، ولا اعتماد runtime خارجي.
- كل الإدخال سيمر بالمحرك:
  - `open/import` للملفات
  - `paste` للنصوص
  - `docx` عبر `parseDocx`
  - بقية الصيغ عبر استخراج النص أولًا ثم `parseText`

## التغييرات الأساسية

- إضافة نسخة مملوكة للمشروع من المحرك داخل `server/karank_engine/` مع الحفاظ على بنية بايثون الأصلية حتى يعمل `ts_bridge.py` دون تعديل جذري في imports.
- إضافة مدير bridge داخل `server/` يشغّل `python <repo>/server/karank_engine/engine/ts_bridge.py` كعملية طويلة العمر:
  - تشغيل lazy
  - `ping` عند البدء
  - إعادة تشغيل تلقائي عند الموت
  - فشل صريح إذا غاب `python` أو ملفات المحرك المضمّنة داخل المستودع
  - لا fallback إلى المسار القديم
- تعديل `server/file-import-server.mjs` ليصبح هو بوابة "الاستخراج + تشغيل المحرك":
  - `docx`: حفظ مؤقت ثم `parseDocx(path)`
  - `doc`/`txt`/`fountain`/`fdx`/`pdf`: استخراج النص الحالي ثم `parseText(text)`
  - الاستجابة ستخرج من bridge ثم تُطبع إلى payload موحد:
    - `text = schema_text`
    - `rawExtractedText`
    - `schemaText`
    - `schemaElements`
    - `structuredBlocks`
    - `method = "karank-engine-bridge"`
- إضافة `POST /api/text-extract` للنصوص الملصوقة أو النص الخام، بنفس envelope الخاص بـ `/api/file-extract`.
- تعديل الواجهة بحيث لا تعتمد على المحرك الخارجي:
  - `open/import` يستخدم backend engine-backed كما في الخطة الأصلية
  - `paste` يرسل النص أولًا إلى `/api/text-extract`
  - الناتج الراجع يدخل بقية البايب لاين الحالية
- تعديل `paste-classifier` ليفهم `ELEMENT = VALUE` مباشرة:
  - لا يعيد heuristic classification عندما يكون الإدخال schema-style
  - يحول schema lines مباشرة إلى `ClassifiedDraft`
  - `cene_header_1 + cene_header_2` يتحولان إلى `sceneHeaderTopLine`
  - `scene_header_3` إلى `sceneHeader3`
  - حالات orphan headers تُحوَّل إلى `sceneHeaderTopLine` جزئي مع telemetry واضح
  - أي element غير معروف يرفض الطلب بخطأ صريح
- الإبقاء على طبقة الشك والمراجعة الحالية بعد ناتج المحرك كما هي:
  - `PostClassificationReviewer`
  - `/api/agent/review`
  - ثم العرض النهائي في Tiptap

## تغييرات الواجهات والأنواع

- runtime path الجديد للمحرك ثابت داخل المشروع، وليس `D:\karank`.
- `FileExtractionResult` يتوسع بالحقول:
  - `schemaText?: string`
  - `schemaElements?: Array<{ element: string; value: string }>`
  - `rawExtractedText?: string`
- `ExtractionMethod` يتوسع بقيمة:
  - `karank-engine-bridge`
- `ClassificationMethod` يتوسع بقيمة:
  - `external-engine`
- رسائل الخطأ والتشخيص يجب أن تشير إلى المسار vendored داخل `C:\Users\Mohmed Aimen Raed\elnos5a` فقط، لا إلى `D:\karank`.

## خطة الاختبار

- اختبارات وحدة/منطق:
  - parser صيغة `ELEMENT = VALUE`
  - تحويل `cene_header_1/2` إلى `sceneHeaderTopLine`
  - orphan headers
  - mapping من `schemaElements` إلى `structuredBlocks`
- اختبارات تكامل حقيقي للـ backend:
  - تشغيل backend مع المحرك المضمَّن داخل `server/karank_engine`
  - `POST /api/file-extract` على `C:\Users\Mohmed Aimen Raed\elnos5a\نسخ الملفات ال docanddocx\1990.docx`
  - `POST /api/text-extract` على نص عربي حقيقي
  - التحقق من `method = karank-engine-bridge` وأن `text` هو `schema_text`
- اختبارات تكامل/E2E:
  - فتح `1990.docx` حتى الظهور على الشاشة
  - لصق نص عربي حتى الظهور على الشاشة
  - التحقق أن البايب لاين تظل: محرك مضمَّن → فهم schema → طبقة الشك → `/api/agent/review` → العرض
- معيار قبول إضافي إلزامي:
  - التطبيق يجب أن يعمل حتى لو لم يعد `D:\karank` موجودًا أصلًا على الجهاز
  - لا يوجد أي استدعاء runtime أو path lookup خارج `C:\Users\Mohmed Aimen Raed\elnos5a`

## الافتراضات المعتمدة

- المحرك سيُنسخ إلى داخل المستودع كنسخة مضمّنة tracked files، وليس كرابط خارجي.
- المسار التشغيلي المعتمد داخل المشروع هو `server/karank_engine/engine/ts_bridge.py`.
- `python` متاح على `PATH`.
- المطلوب إبقاء طبقة الشك والمراجعة، لا تجاوزها.
- المطلوب أن يصبح المشروع self-contained: أي شخص يشغّل `C:\Users\Mohmed Aimen Raed\elnos5a` يحصل على المحرك ضمن التطبيق نفسه دون الحاجة إلى `D:\karank`.
