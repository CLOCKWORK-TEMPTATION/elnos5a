# Research: LangChain Review Provider Migration

## Verification Date

تمت إعادة التحقق من هذه الوثيقة بتاريخ:

`2026-03-08`

وتمت مراجعتها على أساس:

- السجل الحالي لحزم
  `npm`
  عبر
  `pnpm view`
  في نفس اليوم.
- التوثيق الرسمي الحالي لكل من
  `LangChain`
  و
  `Anthropic`
  و
  `OpenAI`
  و
  `Google Gemini`
  و
  `DeepSeek`
  .

## Official Sources Checked On 2026-03-08

- توثيق
  `Anthropic`
  الرسمي أكد أن صفحة
  `Models overview`
  تعرض حاليًا:
  `Claude Opus 4.6`
  و
  `Claude Sonnet 4.6`
  و
  `Claude Haiku 4.5`
  مع المعرّفات:
  `claude-opus-4-6`
  و
  `claude-sonnet-4-6`
  و
  `claude-haiku-4-5-20251001`
  .
- توثيق
  `OpenAI`
  الرسمي أكد أن صفحة النماذج الحالية تعرض:
  `GPT-5.4`
  و
  `GPT-5 mini`
  وأن
  `GPT-4.1`
  ما زال متاحًا لكنه ليس الأحدث، بينما صفحات النماذج المخصصة تعرض snapshot identifiers:
  `gpt-5.4-2026-03-05`
  و
  `gpt-5-mini-2025-08-07`
  .
- توثيق
  `Gemini`
  الرسمي أكد أن
  `Gemini 3 Pro Preview`
  موقوف في
  `2026-03-09`
  وأن خط
  `Gemini 3.1`
  ما زال
  `Preview`
  بينما يظل
  `gemini-2.5-flash`
  و
  `gemini-2.5-pro`
  أنسب خط مستقر للإنتاج.
- توثيق
  `LangChain`
  الرسمي الحالي يحتوي على تباين مهم:
  - صفحة
    `ChatGoogle`
    المخصصة تعرض الحزمة:
    `@langchain/google`
    والفئة:
    `ChatGoogle`
    مع مثال مباشر على
    `model: "gemini-2.5-flash"`
    .
  - صفحة
    `Models`
    العامة ما زالت تعرض ضمن أمثلة
    `initChatModel`
    صيغة:
    `google-genai:gemini-2.5-flash-lite`
    وحزمة:
    `@langchain/google-genai`
    .
  - لذلك فاختيارنا هنا **استنتاج توثيقي محافظ**:
    نبقي اسم المزود التطبيقي:
    `google-genai`
    للتوافق،
    لكن ننفذ التكامل المباشر عبر:
    `@langchain/google`
    لأن صفحة التكامل المخصصة هي الأحدث والأوضح لمسار
    `ChatGoogle`
    .
- توثيق
  `DeepSeek`
  الرسمي أكد أن:
  `deepseek-chat`
  و
  `deepseek-reasoner`
  هما الاسمان الحاليان في
  `chat completions`
  وأنهما يقابلان
  `DeepSeek-V3.2`
  في وضعي
  `Non-thinking`
  و
  `Thinking`
  .

## Parallel Research Tracks

تم تنفيذ البحث بالتوازي على خمسة محاور:

1. أحدث إصدارات حزم
   `LangChain JS`
   وحزم المزودين.
2. الحزمة الموصى بها حاليًا لتكامل
   Google
   في
   `LangChain`
   .
3. أحدث النماذج الحالية في
   `Anthropic`
   .
4. أحدث النماذج الحالية في
   `OpenAI`
   مع تمييز "الأحدث" عن "الأنسب لهذه الميزة".
5. الحالة الحالية لنماذج
   `Gemini`
   و
   `DeepSeek`
   مع مراعاة الاستقرار، الإيقاف القريب، والتوافق مع الإنتاج.

## Registry Versions To Use

تم التحقق من هذه الإصدارات مباشرة من السجل اليوم:

| Package                   | Verified on 2026-03-08 | Decision |
| ------------------------- | ---------------------- | -------- |
| `langchain`               | `1.2.30`               | نعتمده   |
| `@langchain/core`         | `1.1.31`               | نعتمده   |
| `@langchain/anthropic`    | `1.3.22`               | نعتمده   |
| `@langchain/openai`       | `1.2.12`               | نعتمده   |
| `@langchain/google-genai` | `2.1.24`               | نعتمده   |

## Decision 1: استخدام نماذج المحادثة وليس الوكلاء

- **Decision**: الاعتماد على
  `chat models`
  في
  `LangChain`
  بدل
  agents
  متعددة الخطوات.
- **Rationale**: مسارا
  `agent-review`
  و
  `final-review`
  هما
  single-shot
  فقط: نظام prompt ثابت + user payload + JSON output. لا توجد أدوات ولا حاجة إلى state orchestration.
- **Alternatives considered**:
  - `createAgent`
    أو
    `deep agents`
    : مرفوض لأنها تضيف تعقيدًا لا تحتاجه هذه الطبقة.
  - الاستمرار على
    SDKs
    المباشرة: مرفوض لأنه يبقي التشابك مع مزود واحد.

## Decision 2: طبقة مشتركة صغيرة داخل `server/review-provider/`

- **Decision**: تجميع منطق
  `provider:model`
  والتحقق من الاعتماديات وتصنيف الأخطاء و
  `retry/fallback`
  وحالة
  `runtime`
  في طبقة مشتركة.
- **Rationale**: الملفان الحاليان كبيران أصلًا، ومنع التكرار هنا أهم من كتابة شرطيات منفصلة مرتين.
- **Alternatives considered**:
  - منطق منفصل داخل كل endpoint
    : مرفوض لأنه يضاعف نقاط الانحراف.
  - ملف واحد ضخم لكل شيء
    : مرفوض لأنه يخلط
    `config`
    و
    `factory`
    و
    `execution`
    و
    `health`
    في وحدة واحدة.

## Decision 3: صيغة التكوين تبقى `provider:model`

- **Decision**: الإبقاء على الصيغة:
  `provider:model`
  مع افتراض
  `anthropic`
  عندما لا يوجد
  `prefix`
  .
- **Rationale**: هذا يحقق المواصفة ويحافظ على التوافق الخلفي مع الإدخالات القديمة.
- **Alternatives considered**:
  - فصل
    `PROVIDER`
    عن
    `MODEL`
    : مرفوض لأن المواصفة حسمت الصيغة المختصرة.
  - رفض القيم بلا
    `prefix`
    : مرفوض لأنه يكسر التوافق الخلفي.

## Decision 4: الاعتماد على `Node.js >= 20`

- **Decision**: جعل الحد الأدنى الرسمي للتشغيل:
  `Node.js >= 20`
  .
- **Rationale**: الحزم الحالية:
  `langchain`
  و
  `@langchain/openai`
  و
  `@langchain/anthropic`
  و
  `@langchain/google-genai`
  تعلن هذا الشرط. البيئة المحلية الحالية متوافقة بالفعل:
  `v24.0.0`
  .
- **Alternatives considered**:
  - دعم
    `Node 18`
    : مرفوض لأنه خارج نطاق دعم الحزم الحالية.

## Decision 5: استخدام `@langchain/google-genai` في التنفيذ الفعلي الحالي

- **Decision**: استخدام:
  `@langchain/google-genai`
  في التنفيذ الجديد.
- **Rationale**: توثيق
  `LangChain JS`
  الحالي ما زال يوفّر تكامل
  `google-genai`
  بشكل مباشر، وهو ما يطابق اسم المزود المحدد في المواصفة،
  والاعتماد الموجود فعليًا في المشروع،
  والطبقة المنفذة في
  `server/langchain-model-factory.mjs`
  .
- **Alternatives considered**:
  - التحويل إلى
    `@langchain/google`
    :
    مؤجل لأنه يفتح انحرافًا إضافيًا عن المواصفة الحالية
    وعن الاعتمادية المستخدمة فعليًا في
    `package.json`
    دون قيمة مباشرة لهذا الترحيل.

## Decision 6: اسم المزود والحزمة يبقيان متطابقين في هذه النسخة

- **Decision**: داخل التطبيق ستبقى صيغة المزود:
  `google-genai:model`
  وطبقة التنفيذ الداخلية ستستخدم:
  `@langchain/google-genai`
  و
  `ChatGoogleGenerativeAI`
  .
- **Rationale**: هذا يحافظ على المواصفة الحالية وأمثلة
  `env`
  الموجودة، ويمنع التشتت بين اسم المزود الخارجي والحزمة الداخلية.
- **Alternatives considered**:
  - تغيير اسم المزود في التطبيق إلى
    `google`
    : مرفوض لأنه يضيف تغييرًا سلوكيًا غير مطلوب.

## Decision 7: أحدث `Anthropic` الحالية في 8 مارس 2026

- **Decision**: اعتماد المعلومات التالية كحقيقة حالية من التوثيق الرسمي:
  - أحدث مقارنة نماذج حاليًا تعرض:
    `Claude Opus 4.6`
    و
    `Claude Sonnet 4.6`
    و
    `Claude Haiku 4.5`
  - معرّفات
    `API`
    الحالية:
    `claude-opus-4-6`
    و
    `claude-sonnet-4-6`
    و
    `claude-haiku-4-5-20251001`
  - aliases الحالية:
    `claude-opus-4-6`
    و
    `claude-sonnet-4-6`
    و
    `claude-haiku-4-5`
    .
- **Rationale**: هذا هو الوضع الحالي الظاهر في صفحة النماذج الرسمية بتاريخ اليوم، لذلك أي توصية أقدم من ذلك ليست محدثة بما يكفي.
- **Alternatives considered**:
  - الإبقاء على أسماء قديمة من عائلة
    `3.5`
    أو
    `3.7`
    كأساس جديد: مرفوض لأنها ليست أحدث خط الإنتاج الحالي.

## Decision 8: اختيار `Anthropic` الفعلي لهذه الميزة

- **Decision**:
  - النموذج الأساسي:
    `claude-sonnet-4-6`
  - البديل الأقل كلفة داخل نفس المزود:
    `claude-haiku-4-5-20251001`
  - النموذج الأعلى قدرة غير المختار افتراضيًا:
    `claude-opus-4-6`
    .
- **Rationale**: اختيار
  `Sonnet 4.6`
  هنا هو **استنتاج تصميمي**
  من التوثيق: الصفحة تصفه بأنه أفضل توازن بين السرعة والذكاء، وهذا يلائم طبقة مراجعة قصيرة وحساسة للكمون أكثر من
  `Opus 4.6`
  .
- **Alternatives considered**:
  - `claude-opus-4-6`
    : قوي جدًا لكنه أثقل وأغلى لهذه الطبقة.
  - `claude-haiku-4-5-20251001`
    كافتراضي: مرفوض لأننا نريد جودة أعلى في القرار الأولي.

## Decision 9: أحدث `OpenAI` الحالية في 8 مارس 2026

- **Decision**: اعتماد الحقائق التالية من التوثيق الرسمي الحالي:
  - صفحة النماذج تعرض ضمن الواجهة الحالية:
    `GPT-5.4`
    و
    `GPT-5.2`
    و
    `GPT-5 mini`
    و
    `GPT-5 nano`
    ، مع بقاء
    `GPT-4.1`
    متاحًا لكن ليس الأحدث.
  - صفحة
    `GPT-5.4`
    تعرض snapshot حاليًا:
    `gpt-5.4-2026-03-05`
    .
  - صفحة
    `GPT-5 mini`
    تعرض snapshot حاليًا:
    `gpt-5-mini-2025-08-07`
    .
- **Rationale**: هذا يجعل أي توصية سابقة تقول إن
  `gpt-4.1`
  هو أحدث خيار
  OpenAI
  توصية قديمة فعلًا على معيار
  `2026-03-08`
  .
- **Alternatives considered**:
  - الاستمرار في معاملة
    `gpt-4.1`
    كخيار أحدث:
    مرفوض لأنه لم يعد كذلك.

## Decision 10: اختيار `OpenAI` الفعلي لهذه الميزة

- **Decision**:
  - الخيار الحالي الأعلى قدرة عند الحاجة:
    `gpt-5.4`
  - معرّفه المثبّت المتاح حاليًا:
    `gpt-5.4-2026-03-05`
  - الخيار العملي الذي سنختاره كبديل افتراضي لهذه الميزة:
    `gpt-5-mini`
  - ومعرّفه المثبّت المتاح حاليًا:
    `gpt-5-mini-2025-08-07`
    .
- **Rationale**: اختيار
  `gpt-5-mini`
  هنا هو **استنتاج تصميمي**
  من التوثيق:
  `OpenAI`
  تصفه بأنه أسرع وأوفر للتعامل مع المهام المحددة والواضحة، وهذه الطبقة في جوهرها مراجعة structured ومخرجات JSON دقيقة، لا جلسة reasoning طويلة.
- **Alternatives considered**:
  - `gpt-5.4`
    كافتراضي: مرفوض مبدئيًا بسبب الكمون والكلفة الأعلى.
  - `gpt-4.1`
    : مرفوض كخيار افتراضي جديد لأنه لم يعد أحدث، رغم أنه ما زال متاحًا.

## Decision 11: أحدث `Gemini` الحالية في 8 مارس 2026

- **Decision**: اعتماد الحقائق التالية من التوثيق الرسمي الحالي:
  - هناك خط
    `Gemini 3`
    الحالي، ويشمل:
    `Gemini 3.1 Pro`
    و
    `Gemini 3 Flash`
    و
    `Gemini 3.1 Flash-Lite`
    بصيغة
    `Preview`
    .
  - توثيق
    `Gemini`
    يحذّر صراحة من أن:
    `Gemini 3 Pro Preview`
    سيتوقف في
    `March 9, 2026`
    .
  - النماذج المستقرة المناسبة للإنتاج ما زالت تشمل:
    `gemini-2.5-flash`
    و
    `gemini-2.5-pro`
    .
- **Rationale**: هذا يوضح أن "الأحدث المتاح" ليس دائمًا "الأفضل للإنتاج"، خصوصًا عندما يكون من نوع
  `Preview`
  أو على وشك الإيقاف.
- **Alternatives considered**:
  - استخدام
    `Gemini 3 Pro Preview`
    : مرفوض لأنه متجه إلى الإيقاف في اليوم التالي مباشرة، أي
    `March 9, 2026`
    .

## Decision 12: اختيار `Gemini` الفعلي لهذه الميزة

- **Decision**:
  - الافتراضي لهذه الطبقة:
    `gemini-2.5-flash`
  - خيار الجودة الأعلى عند الحاجة:
    `gemini-2.5-pro`
    .
- **Rationale**: هذا أيضًا **استنتاج تصميمي**
  من التوثيق:
  `gemini-2.5-flash`
  موصوف بأنه أفضل توازن سعر/أداء للمهام منخفضة الكمون وعالية الحجم التي ما زالت تحتاج reasoning، وهذا يلائم طبقة المراجعة أكثر من ربطها بنموذج
  `Preview`
  سريع التغير.
- **Alternatives considered**:
  - `gemini-3.1-pro-preview`
    : غير مختار افتراضيًا بسبب كونه
    `Preview`
    .
  - `gemini-2.5-pro`
    كافتراضي: مؤجل لأننا نفضّل سرعة أعلى في المسار الافتراضي.

## Decision 13: `DeepSeek` يبقى مزودًا مستقلًا عبر `OpenAI-compatible transport`

- **Decision**:
  - عنوان الأساس:
    `https://api.deepseek.com`
  - ويمكن استخدام:
    `https://api.deepseek.com/v1`
    للتوافق مع بعض العملاء.
  - النموذجان الحاليان في
    `chat completions`
    هما:
    `deepseek-chat`
    و
    `deepseek-reasoner`
    .
- **Rationale**: التوثيق الرسمي يذكر أن
  `deepseek-chat`
  و
  `deepseek-reasoner`
  يطابقان
  `DeepSeek-V3.2`
  ، وأن
  `deepseek-chat`
  هو وضع
  non-thinking
  و
  `deepseek-reasoner`
  هو وضع
  thinking
  .
- **Alternatives considered**:
  - دمج
    `DeepSeek`
    تحت اسم
    `openai`
    : مرفوض لأنه يخفي المزود الحقيقي في
    health
    واللوغات.

## Decision 14: اختيار `DeepSeek` الفعلي لهذه الميزة

- **Decision**:
  - الافتراضي:
    `deepseek-chat`
  - النموذج reasoning الاختياري:
    `deepseek-reasoner`
    .
- **Rationale**: اختيار
  `deepseek-chat`
  هنا هو **استنتاج تصميمي**
  من طبيعة المسار: نحن نحتاج وضعًا أسرع وأبسط افتراضيًا، لا reasoning مطوّل مع
  `CoT`
  ظاهر.
- **Alternatives considered**:
  - `deepseek-reasoner`
    كافتراضي: مرفوض مبدئيًا بسبب السلوك الأثقل.

## Decision 15: الإبقاء على `retry/fallback` داخل التطبيق

- **Decision**: يبقى
  `LangChain`
  مسؤولًا عن
  `invoke`
  فقط، بينما يظل تصنيف الأخطاء وإعادة المحاولة والتحويل إلى
  `fallback`
  داخل طبقة التطبيق.
- **Rationale**: سياسة المنتج تشترط أن يعمل
  `fallback`
  فقط مع الأخطاء المؤقتة، لا مع أخطاء التهيئة الدائمة.
- **Alternatives considered**:
  - الاعتماد على سلوك المكتبة الافتراضي:
    مرفوض لأنه لا يعكس قواعد المنتج.

## Decision 16: عدم تغيير `prompts` أو `parsing` أو `coverage logic`

- **Decision**: لا تعديل على
  `buildReviewUserPrompt`
  أو
  `parseReviewCommands`
  أو
  `normalizeCommandsAgainstRequest`
  أو
  منطق التغطية.
- **Rationale**: هذه الهجرة تخص طبقة الاستدعاء لا سلوك المراجعة نفسه.
- **Alternatives considered**:
  - إعادة كتابة
    `prompts`
    لكل مزود:
    مرفوض لأنها تنقل المهمة من ترحيل إلى إعادة تصميم.

## Decision 17: `mock mode` و`/health` يبقيان فوق طبقة المزود

- **Decision**:
  `mock mode`
  يبقى
  short-circuit
  قبل إنشاء أي نموذج حقيقي، و
  `/health`
  يعتمد على
  `runtime snapshot`
  محفوظ في الذاكرة.
- **Rationale**: هذا يحافظ على اختبارات العقد الحالية، ويجعل تقرير الصحة يعكس ما حدث فعليًا لا مجرد ما كُتب في
  `env`
  .

## Final Version Matrix For This Feature

| Area                                 | Latest current fact on 2026-03-08                                        | Chosen for this feature     |
| ------------------------------------ | ------------------------------------------------------------------------ | --------------------------- |
| `Node.js`                            | `>=20` required by the package set                                       | `>=20`                      |
| `langchain`                          | `1.2.30`                                                                 | `1.2.30`                    |
| `@langchain/core`                    | `1.1.31`                                                                 | `1.1.31`                    |
| `@langchain/anthropic`               | `1.3.22`                                                                 | `1.3.22`                    |
| `@langchain/openai`                  | `1.2.12`                                                                 | `1.2.12`                    |
| `@langchain/google-genai`            | `2.1.24`                                                                 | `2.1.24`                    |
| `Anthropic latest`                   | `claude-opus-4-6` / `claude-sonnet-4-6` / `claude-haiku-4-5-20251001`    | `claude-sonnet-4-6`         |
| `Anthropic cheaper fallback`         | `claude-haiku-4-5-20251001`                                              | `claude-haiku-4-5-20251001` |
| `OpenAI latest frontier`             | `gpt-5.4`                                                                | غير مختار افتراضيًا         |
| `OpenAI latest frontier snapshot`    | `gpt-5.4-2026-03-05`                                                     | مرجع فقط                    |
| `OpenAI practical fallback`          | `gpt-5-mini`                                                             | `gpt-5-mini`                |
| `OpenAI practical fallback snapshot` | `gpt-5-mini-2025-08-07`                                                  | `gpt-5-mini-2025-08-07`     |
| `Gemini latest preview track`        | `gemini-3.1-pro-preview` مع إيقاف `gemini-3-pro-preview` في `2026-03-09` | غير مختار                   |
| `Gemini stable production track`     | `gemini-2.5-flash` / `gemini-2.5-pro`                                    | `gemini-2.5-flash`          |
| `DeepSeek current chat models`       | `deepseek-chat` / `deepseek-reasoner`                                    | `deepseek-chat`             |

## Resolved Clarifications

- نعم، جزء من المعلومات السابقة كان قديمًا فعلًا إذا قيس على
  `2026-03-08`
  ، خاصة في:
  `OpenAI`
  واسم حزمة
  `Google`
  .
- اسم المزود في التطبيق سيبقى:
  `google-genai`
  والتنفيذ الداخلي سيستخدم أيضًا:
  `@langchain/google-genai`
  .
- سنبقي
  `GEMINI_API_KEY`
  داخل التطبيق للتوافق مع البيئة الحالية، ثم نمرّره إلى
  `ChatGoogleGenerativeAI`
  باعتباره
  `apiKey`
  بدل فرض تغيير بيئي أوسع الآن.

## Verified Source Links

- `Anthropic models overview`
  :
  https://docs.anthropic.com/en/docs/about-claude/models/overview
- `OpenAI models index`
  :
  https://platform.openai.com/docs/models
- `OpenAI GPT-5.4 model page`
  :
  https://developers.openai.com/api/docs/models/gpt-5.4
- `OpenAI GPT-5 mini model page`
  :
  https://developers.openai.com/api/docs/models/gpt-5-mini
- `Gemini models`
  :
  https://ai.google.dev/gemini-api/docs/models
- `LangChain ChatGoogle integration`
  :
  https://docs.langchain.com/oss/javascript/integrations/chat/google
- `LangChain models`
  :
  https://docs.langchain.com/oss/javascript/langchain/models
- `DeepSeek quick start`
  :
  https://api-docs.deepseek.com/
- `DeepSeek models and pricing`
  :
  https://api-docs.deepseek.com/quick_start/pricing
