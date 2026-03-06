# Research: دمج المحرك داخل التطبيق

**Date**: 2026-03-06 (updated)
**Branch**: `001-engine-integration`

## الإصدارات الفعلية المعتمدة

| التقنية            | الإصدار | ملاحظات                                   |
| ------------------ | ------- | ----------------------------------------- |
| Node.js            | v24.0.0 | يدعم `Symbol.dispose` (مستقر منذ v24.2.0) |
| Python             | 3.12.10 | حد أدنى مطلوب: 3.12                       |
| pnpm               | 10.28.2 |                                           |
| TypeScript         | ^5.7.0  |                                           |
| Express            | ^5.2.1  | path-to-regexp v8 — تغييرات routing مهمة  |
| React              | ^19.2.4 |                                           |
| Next.js            | ^15.3.3 |                                           |
| Tiptap             | ^3.0.0  | Extension.create API متوافق               |
| Vitest             | ^4.0.18 | تغييرات mock behavior                     |
| Playwright         | ^1.56.1 |                                           |
| mammoth            | ^1.11.0 | لاستخراج DOCX                             |
| express-rate-limit | ^8.2.1  | متوافق رسمياً مع Express 5                |

---

## R1: بروتوكول التواصل مع Python Bridge

**Decision**: stdio (stdin/stdout) بصيغة JSON lines — سطر واحد JSON لكل رسالة.

**Rationale**:

- أبسط طريقة لتشغيل subprocess والتواصل معه
- لا يحتاج منافذ شبكية أو HTTP server في Python
- `child_process.spawn` في Node.js يدعم stdio مباشرة
- JSON lines يمنع مشاكل التحليل مع multiline JSON

**Implementation details (من البحث)**:

- استخدام `readline.createInterface` مع حدث `'line'` (أفضل من manual buffer splitting)
- تحذير: **لا تستخدم** `for await...of rl` — أبطأ بشكل ملحوظ من `rl.on('line', ...)`
- لا حاجة لمكتبة خارجية (مثل vscode-jsonrpc) — بروتوكول JSON lines بسيط يكفي

**Alternatives considered**:

- HTTP server في Python (Flask/FastAPI): تعقيد إضافي غير مبرر، منفذ إضافي
- Unix sockets: غير مدعوم على Windows بشكل أصلي
- gRPC: overhead كبير لحالة subprocess واحد
- `vscode-jsonrpc`: ناضج لكن مرتبط بنظام LSP headers (Content-Length framing)
- `python-shell` npm: صيانة محدودة (آخر إصدار قبل 3 سنوات)

## R2: إدارة دورة حياة Bridge Process

**Decision**: lazy spawn عند أول طلب + ping readiness check + single retry on death.

**Rationale**:

- البريدج عنصر ثابت وأساسي (قرار من clarification session)
- التشغيل lazy يوفر موارد عند عدم الحاجة
- `ping` يضمن جاهزية المحرك قبل أول طلب حقيقي
- محاولة إعادة تشغيل واحدة فقط — إذا فشلت يظهر خطأ نهائي

**Implementation approach**:

```
KarankBridge class (server/karank-bridge.mjs):
  - spawn(): يشغّل python -u ts_bridge.py (مع -u flag لمنع buffering)
  - ping(): يرسل {"cmd":"ping"} وينتظر {"status":"ok"}
  - request(method, params): يرسل JSON ويقرأ الاستجابة
  - _handleDeath(): محاولة واحدة لإعادة التشغيل
  - destroy(): يقتل العملية عند إغلاق الخادم
```

**Node.js v24 APIs ذات صلة (من البحث)**:

- `Symbol.dispose` مستقر منذ v24.2.0 — لكن للـ long-lived subprocess،
  النمط اليدوي أفضل تحكماً
- `AbortController/AbortSignal` — متاح لإلغاء العملية عبر `controller.abort()`
- إلزامية array للـ arguments في `spawn()` (أمان ضد shell injection)

**Python stdout buffering (مهم)**:

- Python عند الكتابة لـ pipe يُفعّل full buffering تلقائياً (ليس line buffering)
- **الحل**: تشغيل بـ `-u` flag: `spawn('python', ['-u', 'ts_bridge.py'])`
- أو داخل Python: `print(..., flush=True)` أو `sys.stdout.reconfigure(line_buffering=True)`
- **إضافي على Windows**: `PYTHONUTF8=1` أو `sys.stdout.reconfigure(encoding='utf-8')`
  لأن encoding الافتراضي قد يكون CP1256 وليس UTF-8

**JSON والنصوص العربية**:

- `json.dumps(data, ensure_ascii=False)` ضروري لإخراج العربية مباشرة بدون `\uXXXX`
- بدون هذا الخيار، الحجم يتضخم والنص غير مقروء

**Graceful shutdown على Windows (مهم)**:

- `SIGTERM` لا يعمل على Windows بالمفهوم Unix — `kill()` يُنهي فوراً
- **الحل**: إرسال رسالة JSON خاصة `{"cmd":"shutdown"}` عبر stdin قبل `kill()`
- ترتيب: إرسال shutdown → انتظار حدث `'close'` (5s timeout) → `kill()` إجباري

**stderr handling**:

- pipe منفصل: `stdio: ['pipe', 'pipe', 'pipe']`
- تسجيل stderr كـ `warn`، وعند exit code غير صفر كـ `error`
- لا ترفع exception على كل stderr data (Python يُرسل تحذيرات عادية)

## R3: دمج ناتج المحرك مع Pipeline الحالي

**Decision**: ناتج المحرك (schema-style) يدخل `paste-classifier` عبر مسار جديد
يتجاوز HybridClassifier لكن لا يتجاوز PostClassificationReviewer.

**Rationale**:

- المحرك يُرجع `ELEMENT = VALUE` وهو أدق من regex heuristics
- لا حاجة لإعادة تصنيف ما صنّفه المحرك
- لكن طبقة الشك والمراجعة MUST تبقى (Constitution Principle II)
- routing bands تبقى كما هي

**Flow**:

```
Engine output (schema lines)
  → parseSchemaLines() → ClassifiedDraft[] مع method="external-engine"
  → PostClassificationReviewer (كشف شبهات)
  → routing bands (pass/local-review/agent-candidate/agent-forced)
  → /api/agent/review (إذا لزم)
  → عرض في Tiptap
```

**Async handlePaste في ProseMirror/Tiptap 3 (من البحث)**:

- `handlePaste` في ProseMirror **ليس مصمماً للـ async** بشكل أصلي
- النمط المعتمد: `return true` لمنع الـ paste الافتراضي، ثم dispatch
  transaction بعد اكتمال الـ fetch — وهو **بالضبط ما يفعله كودنا الحالي**
  في `applyPasteClassifierFlowToView` (يستخدم `void` لتشغيل async دون انتظار)
- **لا تغيير مطلوب** في نمط handlePaste — الكود الحالي يتبع النمط الصحيح

## R4: mapping عناصر المحرك إلى ElementType

**Decision**: mapping مباشر مع validation صارم.

| Engine Element   | ElementType      | ملاحظات                      |
| ---------------- | ---------------- | ---------------------------- |
| `cene_header_1`  | `scene_header_1` | الجزء الأول من عنوان المشهد  |
| `cene_header_2`  | `scene_header_2` | الجزء الثاني (مكان/زمان)     |
| `scene_header_3` | `scene_header_3` | وصف إضافي للمشهد             |
| `ACTION`         | `action`         |                              |
| `DIALOGUE`       | `dialogue`       |                              |
| `CHARACTER`      | `character`      |                              |
| `TRANSITION`     | `transition`     |                              |
| `PARENTHETICAL`  | `parenthetical`  |                              |
| `BASMALA`        | `basmala`        |                              |
| أي شيء آخر       | **ERROR**        | رفض صريح — element غير معروف |

**Orphan handling**:

- `cene_header_1` بدون `cene_header_2` → `scene_header_1` جزئي + telemetry warning

## R5: توسيع Types الحالية

**Decision**: توسيع الأنواع الموجودة بدل إنشاء أنواع جديدة.

**Changes needed**:

- `ExtractionMethod` يضاف له: `"karank-engine-bridge"`
- `ClassificationMethod` يضاف له: `"external-engine"`
- `FileExtractionResult` يضاف له:
  - `schemaText?: string`
  - `schemaElements?: Array<{ element: string; value: string }>`
  - `rawExtractedText?: string`

## R6: نسخ ملفات المحرك من D:\karank

**Decision**: نسخ مرة واحدة يدوياً أثناء التنفيذ إلى `server/karank_engine/`.

**Rationale**:

- PLAN.md ينص على أن `D:\karank` مصدر نسخ أولي فقط
- بعد النسخ، الملفات tracked في git
- بنية Python الأصلية محفوظة حتى يعمل `ts_bridge.py` دون تعديل imports

**Target structure**:

```
server/karank_engine/
└── engine/
    ├── ts_bridge.py        # نقطة الدخول
    ├── parser/             # منطق التحليل
    ├── schema/             # تعريف العناصر
    └── requirements.txt    # اعتمادات Python
```

## R7: Endpoint جديد POST /api/text-extract

**Decision**: endpoint جديد في `server/routes/` بنفس envelope الخاص بـ
`/api/file-extract`.

**Rationale**:

- النص الملصوق لا يمر بمرحلة استخراج الملفات
- يحتاج مسار مباشر: نص → `parseText(text)` عبر bridge → نفس envelope
- الفصل عن `/api/file-extract` يحافظ على وضوح المسؤوليات

**Request**: `{ text: string }`
**Response**: نفس `FileExtractionResult` الموسّع مع `method: "karank-engine-bridge"`

## R8: Express 5 — تأثير على التنفيذ (من البحث)

**Decision**: Express 5 متوافق مع التنفيذ المخطط — لكن يجب الانتباه لتغييرات routing.

**تغييرات مهمة في Express 5 (path-to-regexp v8)**:

- Wildcard: `/*` → `/*splat` أو `/{*splat}`
- Optional param: `/:name?` → `{/:name}`
- Regex في route: **محذوف نهائياً** (حماية من ReDoS)
- **Async errors تلقائية**: إذا رمى async middleware خطأً أو Promise rejected،
  يُمرَّر تلقائيًا لـ error handler دون الحاجة لـ `next(err)` — هذا يبسّط الكود
- `req.query` أصبح read-only getter

**express-rate-limit ^8.2.1**: متوافق رسمياً مع Express 5 (منذ v7.1.3).

**تأثير على التنفيذ**:

- Routes الجديدة (`POST /api/text-extract`) لا تستخدم wildcards أو regex — لا مشكلة
- الـ async error handling التلقائي يُبسّط كتابة controllers الجديدة

## R9: Vitest 4 — تأثير على الاختبارات (من البحث)

**Decision**: Vitest 4 متوافق — تغييرات mock behavior يجب مراعاتها.

**تغييرات مهمة**:

- `spy.mockReset` يعيد التطبيق الأصلي بدل noop فارغ
- `vi.fn().getMockName()` يعود `"vi.fn()"` بدل `"spy"` — يؤثر على snapshots
- `vi.restoreAllMocks` لا يعيد ضبط حالة spies — فقط يستعيد spies يدوية
- `poolOptions` محذوف — الخيارات تُضبط على مستوى top-level

**تأثير على التنفيذ**:

- اختبارات child_process.spawn: استخدام `vi.mock('node:child_process')` مع
  mock واضح لـ `spawn` يعيد EventEmitter مع stdin/stdout/stderr streams
- اختبارات Express endpoints: استخدام `supertest` (^7.1.4 — موجود بالفعل)

## R10: Tiptap 3 — تأثير على paste-classifier (من البحث)

**Decision**: Tiptap 3 لا يتطلب تغييرات جوهرية في نمط handlePaste الحالي.

**تغييرات في Extension.create API**:

- Config options أصبحت strongly typed — لا تأثير على PasteClassifier
- Extension storage typing جديد — لا يُستخدم في PasteClassifier
- Import structure changes — لا تأثير على extensions مخصصة

**ProseMirror plugin API**:

- `addProseMirrorPlugins()` لم يتغير في Tiptap 3
- `handlePaste` في `Plugin.props` يعمل بنفس الطريقة
- النمط الحالي (`return true` + `void asyncFunction()`) هو **النمط الصحيح**
  المعتمد في مجتمع ProseMirror للـ async paste

**تأثير على التنفيذ**:

- لا تغيير في نمط handlePaste — فقط إضافة استدعاء `/api/text-extract` قبل التصنيف
- الكود الحالي يستخدم `void applyPasteClassifierFlowToView(view, text)` وهو صحيح

---

## المصادر

### Node.js child_process

- [Node.js v24 Documentation — child_process](https://nodejs.org/api/child_process.html)
- [What's New in Node.js 24 — AppSignal](https://blog.appsignal.com/2025/05/09/whats-new-in-nodejs-24.html)
- [Node.js Readline Documentation](https://nodejs.org/api/readline.html)
- [vscode-jsonrpc — npm](https://www.npmjs.com/package/vscode-jsonrpc)

### Express 5

- [Migrating to Express 5 — expressjs.com](https://expressjs.com/en/guide/migrating-5.html)
- [Express.js 5 migration guide — LogRocket](https://blog.logrocket.com/express-js-5-migration-guide/)
- [express-rate-limit Changelog](https://express-rate-limit.mintlify.app/reference/changelog)
- [Express 4 vs 5 Benchmark — RepoFlow](https://www.repoflow.io/blog/express-4-vs-express-5-benchmark-node-18-24)

### Python 3.12

- [Python subprocess docs](https://docs.python.org/3/library/subprocess.html)
- [PYTHONUNBUFFERED explanation — DEV Community](https://dev.to/wewake-dev/why-your-python-logs-vanish-in-docker-and-how-pythonunbuffered1-saves-the-day-65i)
- [Python JSON ensure_ascii — pynative.com](https://pynative.com/python-json-encode-unicode-and-non-ascii-characters-as-is/)

### Tiptap 3

- [Upgrade v2 to v3 — Tiptap Docs](https://tiptap.dev/docs/guides/upgrade-tiptap-v2)
- [Extension API — Tiptap Docs](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension)
- [Async handlePaste — ProseMirror discuss](https://discuss.prosemirror.net/t/how-to-async-modify-pasted-stuff/5379)

### Vitest 4

- [Vitest 4.0 is out!](https://vitest.dev/blog/vitest-4)
- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [Announcing Vitest 4.0 — VoidZero](https://voidzero.dev/posts/announcing-vitest-4)
