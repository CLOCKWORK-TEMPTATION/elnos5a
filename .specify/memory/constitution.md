<!--
  Sync Impact Report
  ==================
  Version change: 0.0.0 → 1.0.0 (MAJOR: initial ratification)
  Modified principles: N/A (first version)
  Added sections:
    - Core Principles (7 principles)
    - Technical Constraints
    - Development Workflow
    - Governance
  Removed sections: None
  Templates requiring updates:
    - plan-template.md: ✅ compatible (Constitution Check section exists)
    - spec-template.md: ✅ compatible (no conflicts)
    - tasks-template.md: ✅ compatible (no conflicts)
  Follow-up TODOs: None
-->

# Avan Titre Constitution

## Core Principles

### I. Self-Containment (NON-NEGOTIABLE)

التطبيق MUST يكون مستقلاً تماماً عن أي مسار خارجي في وقت التشغيل.

- كل dependency تشغيلي MUST يكون vendored داخل المستودع نفسه
- لا `submodule`، لا `symlink`، ولا runtime path lookup خارج حدود المشروع
- المحرك المضمّن يعمل من `server/karank_engine/engine/` فقط
- أي شخص يستنسخ المستودع MUST يحصل على تطبيق يعمل دون إعدادات خارجية
  (باستثناء `python` على PATH ومتغيرات `.env` لمفاتيح API)
- رسائل الخطأ والتشخيص MUST تشير فقط إلى مسارات داخل المشروع

**المبرر**: القضاء على هشاشة الاعتماد على `D:\karank` وضمان قابلية النشر
والتطوير من أي جهاز.

### II. Pipeline Integrity

طبقات التصنيف والمراجعة MUST تبقى كاملة ولا يُتجاوز أي منها.

- التدفق الإلزامي: محرك مضمّن → فهم schema → طبقة الشك → agent review → العرض
- `PostClassificationReviewer` و `/api/agent/review` MUST يظلان فعّالين
- لا يجوز تجاوز طبقة الشك حتى لو كانت نتيجة المحرك عالية الثقة
- أي مدخل (paste/import/open) MUST يمر بنفس pipeline الكامل
- routing bands (`pass` → `local-review` → `agent-candidate` → `agent-forced`)
  MUST تبقى كما هي

**المبرر**: جودة التصنيف تعتمد على تعدد الطبقات. تجاوز أي طبقة يُضعف
الموثوقية.

### III. Strict TypeScript (NON-NEGOTIABLE)

- NEVER use `any` or `unknown`
- NEVER use `@ts-ignore` or `@ts-expect-error`
- MUST import real types from source libraries
- MUST find root solutions, not temporary workarounds
- كل type جديد MUST يُعرَّف في `src/types/`

**المبرر**: النظام يعتمد على أنواع دقيقة (`ElementType`, `ClassifiedDraft`,
`FileExtractionResult`) لضمان سلامة البيانات عبر كامل pipeline.

### IV. Engine Bridge Pattern

المحرك (Python) يعمل كعملية طويلة العمر تُدار من TypeScript عبر bridge.

- التشغيل MUST يكون lazy (عند أول طلب فقط)
- MUST يدعم `ping` عند البدء للتحقق من الجاهزية
- MUST يعيد التشغيل تلقائياً عند موت العملية
- MUST يفشل صراحةً إذا غاب `python` أو ملفات المحرك
- لا fallback إلى أي مسار قديم أو خارجي
- الاتصال عبر stdio (stdin/stdout) بصيغة JSON

**المبرر**: فصل Python engine عن TypeScript runtime مع ضمان reliability
وسهولة التشخيص.

### V. Unified Entry Point

كل أنواع المدخلات MUST تمر عبر نقطة دخول موحّدة.

- `docx`: حفظ مؤقت ثم `parseDocx(path)` عبر bridge
- `doc`/`txt`/`fountain`/`fdx`/`pdf`: استخراج النص ثم `parseText(text)`
  عبر bridge
- `paste`: إرسال النص إلى `/api/text-extract` ثم نفس pipeline
- الاستجابة MUST تتبع envelope موحّد:
  `text`, `rawExtractedText`, `schemaText`, `schemaElements`,
  `structuredBlocks`, `method`

**المبرر**: توحيد المدخلات يمنع تشعّب المنطق ويضمن أن كل مدخل يحصل على
نفس جودة التصنيف.

### VI. Arabic-First RTL

- واجهة المستخدم MUST تكون بالعربية بالكامل
- التخطيط MUST يكون RTL-first
- Dark-only theme مع OKLCH color system
- الترميز MUST يدعم النص العربي بشكل كامل في كل المراحل

**المبرر**: المنتج مصمم للكتّاب العرب. أي خلل في RTL أو العربية يُفسد
تجربة المستخدم الأساسية.

### VII. Simplicity & YAGNI

- لا over-engineering: التغييرات MUST تكون مباشرة ومطلوبة فقط
- لا abstractions مبكرة: ثلاثة أسطر متشابهة أفضل من abstraction غير ضروري
- لا feature flags أو backwards-compatibility shims إلا عند الضرورة القصوى
- لا إضافة error handling لحالات لا يمكن أن تحدث
- التعقيد MUST يُبرَّر كتابةً في Complexity Tracking

**المبرر**: البساطة تقلل الأخطاء وتسرّع التطوير. التعقيد غير المبرر هو دين
تقني.

## Technical Constraints

- **Stack**: React 19 + Next.js 15 + Tiptap 3 (frontend), Express 5 (backend),
  Python (engine)
- **Package Manager**: pnpm 10.28 فقط (لا npm ولا yarn)
- **Server Files**: امتداد `.mjs` (ES modules for Node.js)
- **File Naming**: kebab-case
- **Backend Port**: `127.0.0.1:8787`
- **Editor**: Tiptap 3 on ProseMirror مع A4 pagination (794x1123px @ 96 PPI)
- **Element Types**: `action`, `dialogue`, `character`, `scene_header_1`,
  `scene_header_2`, `scene_header_3`, `transition`, `parenthetical`, `basmala`
- **AI Providers**: Anthropic (review), Mistral (OCR), Moonshot/Kimi (doubt),
  Google Gemini (context)

## Development Workflow

- **Branching**: فرع جديد لكل ميزة من `main`
- **Validation قبل أي merge**: `pnpm validate` (format + lint + typecheck + test)
- **Testing**: ثلاث طبقات إلزامية:
  - Unit tests (Vitest) للمنطق المعزول
  - Integration tests للـ pipeline الكامل
  - E2E tests (Playwright) للسيناريوهات الكاملة
- **Commit Messages**: بالعربية، واضحة وموجزة
- **Code Review**: كل PR MUST يُراجَع مقابل هذا الدستور
- **Self-Containment Check**: كل PR MUST يتحقق أنه لا يوجد أي runtime
  reference خارج حدود المشروع

## Governance

- هذا الدستور يُعلو على أي ممارسة أخرى في المشروع
- أي تعديل MUST يُوثَّق مع المبرر ويُحدَّث الإصدار
- كل PR/review MUST يتحقق من الامتثال للمبادئ السبعة
- التعقيد الإضافي MUST يُبرَّر في جدول Complexity Tracking
- `CLAUDE.md` هو ملف التوجيه التشغيلي اليومي ويجب أن يتوافق مع هذا الدستور

**Version**: 1.0.0 | **Ratified**: 2026-03-06 | **Last Amended**: 2026-03-06
