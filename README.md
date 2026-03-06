# أفان تيتر | Avan Titre

<div align="center">

**محرر سيناريو عربي احترافي للويب**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://reactjs.org/)
[![Tiptap](https://img.shields.io/badge/Tiptap-3.0-000?logo=tiptap)](https://tiptap.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

[الميزات](#-الميزات-الرئيسية) • [التثبيت](#-التثبيت-السريع) • [الاستخدام](#-الاستخدام) • [التوثيق](#-التوثيق) • [المساهمة](#-المساهمة)

</div>

---

## 📖 نظرة عامة

**أفان تيتر** هو محرر سيناريو متخصص للنصوص العربية، مبني على تقنيات الويب الحديثة. يحل مشكلة تصنيف النصوص غير المهيكلة المستوردة من Word/PDF/DOC إلى عناصر سيناريو احترافية عبر **نظام تصنيف ذكي 4-طبقات** يجمع بين Regex والسياق والـ AI.

### المشكلة التي نحلها

- ✗ النصوص المستوردة تفقد التنسيق
- ✗ التصنيف اليدوي بطيء ومُعرّض للأخطاء
- ✗ الأنماط العربية معقدة (لهجات، أنماط كتابة متعددة)
- ✗ عدم وجود أدوات احترافية للسيناريو العربي

### الحل

- ✓ تصنيف تلقائي ذكي (دقة 93.7%)
- ✓ دعم كامل للعربية (RTL + لهجات)
- ✓ استيراد من PDF/DOC/DOCX/TXT/Fountain/FDX
- ✓ تصدير لـ PDF/DOCX/HTML/Fountain/FDX
- ✓ واجهة حديثة وسريعة

---

## ✨ الميزات الرئيسية

### 🤖 نظام التصنيف الذكي 4-طبقات

```
نص خام → Layer 1 (Regex) → Layer 2 (Context) → Layer 3 (Hybrid) → Layer 4 (AI) → نص مصنف
```

1. **Layer 1: Regex Patterns** - كشف حتمي سريع (70% من الأسطر)
2. **Layer 2: Context Rules** - تتبع الشخصيات والأماكن (25%)
3. **Layer 3: Hybrid Classifier** - scoring + confidence (4%)
4. **Layer 4: AI Agent (Claude)** - مراجعة نهائية (1%)

**الدقة**: 93.7% | **السرعة**: ~1000 سطر/ثانية

### 📝 8 أنواع عناصر سيناريو

- **بسملة** - `بسم الله الرحمن الرحيم`
- **رأس المشهد** - `مشهد 1 - داخلي - منزل - نهاراً`
- **الحركة (Action)** - وصف الأحداث والحركة
- **الشخصية** - اسم الشخصية المتحدثة
- **الحوار** - كلام الشخصية
- **الملاحظة الجانبية** - `(بصوت منخفض)`
- **الانتقال** - `قطع إلى:`
- **رؤوس فرعية** - تفاصيل المشهد

### 📥 استيراد متعدد الصيغ

| الصيغة       | الطريقة     | AI Provider |
| ------------ | ----------- | ----------- |
| **PDF**      | Mistral OCR | Mistral AI  |
| **DOC**      | Antiword    | -           |
| **DOCX**     | Mammoth     | -           |
| **TXT**      | Browser     | -           |
| **Fountain** | Parser      | -           |
| **FDX**      | XML Parser  | -           |

### 📤 تصدير احترافي

- **PDF** - jsPDF (client-side)
- **PDF/A** - Puppeteer (server-side)
- **DOCX** - docx library
- **HTML** - تنسيق كامل
- **Fountain** - صيغة قياسية
- **FDX** - Final Draft XML

### 🎨 واجهة حديثة

- **Dark Theme** - وضع داكن فقط
- **RTL Support** - دعم كامل للعربية
- **A4 Pagination** - تقسيم صفحات تلقائي (794×1123px @ 96 PPI)
- **Keyboard Shortcuts** - Ctrl+0..7 للعناصر
- **Real-time Stats** - صفحات، كلمات، حروف، مشاهد

---

## 🚀 التثبيت السريع

### المتطلبات

- **Node.js** ≥ 20.0.0
- **pnpm** ≥ 10.28.0 (مطلوب - لا تستخدم npm/yarn)
- **Git**
- **Antiword** (لاستيراد DOC)

### 1. استنساخ المشروع

```bash
git clone https://github.com/your-org/avan-titre.git
cd avan-titre
```

### 2. تثبيت التبعيات

```bash
pnpm install
```

### 3. إعداد المتغيرات البيئية

انسخ `.env.example` إلى `.env` وأضف مفاتيح API:

```bash
cp .env.example .env
```

**ملف `.env`**:

```bash
# AI Providers (اختياري - للتصنيف الذكي)
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
GEMINI_API_KEY=...
MOONSHOT_API_KEY=...

# Backend URLs (Development)
NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL=http://127.0.0.1:8787/api/file-extract
NEXT_PUBLIC_AGENT_REVIEW_BACKEND_URL=http://127.0.0.1:8787/api/agent/review

# Antiword (Windows)
ANTIWORD_PATH=C:/antiword/antiword.exe
ANTIWORDHOME=C:/antiword

# Qdrant (RAG - اختياري)
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=avan-titre-docs
```

### 4. بناء Antiword (Windows)

```powershell
pnpm run build-antiword:windows
```

**Linux**:

```bash
pnpm run build-antiword:linux
```

### 5. تشغيل التطبيق

```bash
pnpm dev
```

يفتح التطبيق على: **http://localhost:3000**

---

## 📚 الاستخدام

### الاستخدام الأساسي

#### 1. لصق نص مباشرة

```
1. افتح المحرر
2. اضغط Ctrl+V
3. سيتم تصنيف النص تلقائياً
```

#### 2. استيراد ملف

```
1. ملف → فتح (Ctrl+O)
2. اختر PDF/DOC/DOCX/TXT/Fountain/FDX
3. انتظر الاستخراج والتصنيف
4. سيظهر النص مصنفاً في المحرر
```

#### 3. تغيير نوع العنصر

```
1. ضع المؤشر على السطر
2. اضغط Ctrl+0..7 للتبديل بين الأنواع
   - Ctrl+0: بسملة
   - Ctrl+1: رأس المشهد
   - Ctrl+2: رأس فرعي
   - Ctrl+3: حركة
   - Ctrl+4: شخصية
   - Ctrl+5: حوار
   - Ctrl+6: ملاحظة جانبية
   - Ctrl+7: انتقال
```

#### 4. حفظ وتصدير

```
1. ملف → حفظ (Ctrl+S) - حفظ محلي
2. ملف → تصدير → PDF/DOCX/HTML/Fountain/FDX
```

### الاختصارات الكاملة

| الاختصار | الوظيفة    |
| -------- | ---------- |
| `Ctrl+N` | ملف جديد   |
| `Ctrl+O` | فتح ملف    |
| `Ctrl+S` | حفظ        |
| `Ctrl+Z` | تراجع      |
| `Ctrl+Y` | إعادة      |
| `Ctrl+B` | غامق       |
| `Ctrl+I` | مائل       |
| `Ctrl+U` | تحته خط    |
| `Ctrl+0` | بسملة      |
| `Ctrl+1` | رأس المشهد |
| `Ctrl+2` | رأس فرعي   |
| `Ctrl+3` | حركة       |
| `Ctrl+4` | شخصية      |
| `Ctrl+5` | حوار       |
| `Ctrl+6` | ملاحظة     |
| `Ctrl+7` | انتقال     |

---

## 🛠️ التطوير

### أوامر التطوير

```bash
# Development
pnpm dev              # Frontend + Backend
pnpm dev:app          # Frontend only
pnpm file-import:server  # Backend only

# Build
pnpm build            # Production build
pnpm preview          # Preview build

# Testing
pnpm test             # Unit + Integration
pnpm test:unit        # Unit only
pnpm test:integration # Integration only
pnpm test:e2e         # E2E (Playwright)
pnpm test:e2e:audit   # Comprehensive UI audit

# Quality
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm validate         # All checks + tests

# OCR & RAG
pnpm ocr:start        # Single file OCR
pnpm rag:index        # Index documents
pnpm rag:ask          # Query RAG

# Utilities
pnpm start:preflight  # Pre-flight checks
```

### هيكل المشروع

```
avan-titre/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── src/
│   ├── extensions/        # 38 ملف - محرك التصنيف
│   │   ├── paste-classifier.ts  # (2584 سطر) المصنف الرئيسي
│   │   ├── arabic-patterns.ts   # Layer 1: Regex
│   │   ├── context-memory-manager.ts  # Layer 2: Context
│   │   ├── hybrid-classifier.ts       # Layer 3: Hybrid
│   │   └── ...
│   ├── pipeline/          # نظام الاستيراد
│   ├── components/
│   │   ├── app-shell/     # UI shell
│   │   ├── editor/        # EditorArea
│   │   └── ui/            # 57 مكون Radix UI
│   ├── ocr-arabic-pdf-to-txt-pipeline/  # نظام OCR
│   ├── rag/               # Qdrant + Gemini
│   ├── App.tsx            # المكون الجذري
│   └── editor.ts          # مصنع المحرر
├── server/                # Express backend (28 ملف .mjs)
│   ├── file-import-server.mjs  # المنفذ 8787
│   ├── agent-review.mjs        # Claude agent
│   └── ...
├── tests/
│   ├── unit/              # 40+ اختبار
│   ├── integration/       # 30+ اختبار
│   └── e2e/               # Playwright
├── docs/                  # التوثيق
│   ├── PROGRESS.md        # تقدم التوثيق
│   ├── INVENTORY.md       # جرد الملفات
│   ├── TECH_STACK.md      # المكدس التقني
│   └── CORE_MECHANISM.md  # آلية العمل
└── package.json
```

### المعمارية

**Hybrid Pattern**: يجمع بين 3 أنماط:

1. **Next.js App Router** - SSR + routing
2. **React Components** - UI state management
3. **Imperative Classes** - Tiptap/ProseMirror lifecycle (`EditorArea.ts`)
4. **DOM Factory** - 57 Radix UI components (no JSX في `src/components/ui/`)

**السبب**: تجنب مشاكل المزامنة بين React و ProseMirror + أداء أفضل.

---

## 🧪 الاختبار

### تشغيل الاختبارات

```bash
# جميع الاختبارات
pnpm test

# Unit tests فقط
pnpm test:unit

# Integration tests فقط
pnpm test:integration

# E2E tests
pnpm test:e2e

# اختبار ملف واحد
npx vitest run tests/unit/extensions/paste-classifier.test.ts
```

### التغطية

```bash
pnpm test:coverage
```

**النتائج**: `test-results/coverage/index.html`

### E2E Audit

```bash
pnpm test:e2e:audit
```

يختبر:

- اللصق والتصنيف
- استيراد الملفات
- التصدير
- الاختصارات
- الواجهة الكاملة

---

## 📦 البناء والنشر

### بناء الإنتاج

```bash
pnpm build
```

**المخرجات**: `.next/` (Next.js build)

### معاينة البناء

```bash
pnpm preview
```

### النشر

**Vercel** (موصى به):

```bash
vercel deploy
```

**Docker** (قريباً):

```bash
docker build -t avan-titre .
docker run -p 3000:3000 avan-titre
```

---

## 🔧 الإعداد المتقدم

### تفعيل AI Layers

في `.env`:

```bash
# Layer 4: Claude Agent Review
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_AGENT_REVIEW_BACKEND_URL=http://127.0.0.1:8787/api/agent/review

# OCR: Mistral
MISTRAL_API_KEY=...

# Context Enhancement: Gemini
GEMINI_API_KEY=...

# Doubt Resolution: Kimi
MOONSHOT_API_KEY=...
```

في `src/extensions/paste-classifier.ts`:

```typescript
export const PIPELINE_FLAGS = {
  CLAUDE_REVIEW_ENABLED: true, // تفعيل Claude
  GEMINI_CONTEXT_ENABLED: true, // تفعيل Gemini Context
  GEMINI_DOUBT_ENABLED: true, // تفعيل Gemini Doubt
};
```

### إعداد RAG (اختياري)

1. تثبيت Qdrant:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

2. فهرسة المستندات:

```bash
pnpm rag:index
```

3. الاستعلام:

```bash
pnpm rag:ask
```

### إعداد Antiword

**Windows**:

```powershell
pnpm run build-antiword:windows
```

**Linux**:

```bash
pnpm run build-antiword:linux
```

**التحقق**:

```bash
pnpm run start:preflight
```

---

## 🎨 التخصيص

### تغيير الألوان

في `src/constants/colors.ts`:

```typescript
export const brandColors = {
  jungleGreen: "oklch(0.55 0.15 145)", // اللون الأساسي
  teal: "oklch(0.65 0.12 180)",
  bronze: "oklch(0.60 0.10 60)",
};
```

### تغيير الخط

في `src/constants/fonts.ts`:

```typescript
export const fonts = [
  {
    label: "AzarMehr Monospaced",
    value: "AzarMehrMonospaced-Sans",
    file: "AzarMehrMonospaced_Sans_Regular.ttf",
  },
];
```

### تغيير أبعاد الصفحة

في `src/constants/page.ts`:

```typescript
export const PAGE_WIDTH_PX = 794; // A4 width @ 96 PPI
export const PAGE_HEIGHT_PX = 1123; // A4 height @ 96 PPI
```

---

## 📖 التوثيق

### التوثيق الكامل

- **[PROGRESS.md](docs/PROGRESS.md)** - تقدم التوثيق
- **[INVENTORY.md](docs/INVENTORY.md)** - جرد شامل للملفات (178 ملف TS)
- **[TECH_STACK.md](docs/TECH_STACK.md)** - المكدس التقني الكامل
- **[CORE_MECHANISM.md](docs/CORE_MECHANISM.md)** - آلية العمل 4-طبقات

### API Documentation

**Backend Endpoints**:

| Endpoint                  | Method | الوظيفة               |
| ------------------------- | ------ | --------------------- |
| `/api/file-extract`       | POST   | استخراج نص من ملفات   |
| `/api/agent/review`       | POST   | مراجعة Claude         |
| `/api/ai/context-enhance` | POST   | تحسين السياق (Gemini) |
| `/api/ai/doubt-resolve`   | POST   | حل الشكوك (Kimi)      |
| `/api/export/pdfa`        | POST   | تصدير PDF/A           |

**مثال**:

```typescript
// استخراج نص من PDF
const response = await fetch("http://127.0.0.1:8787/api/file-extract", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    file: base64EncodedFile,
    filename: "script.pdf",
    fileType: "pdf",
  }),
});

const { text } = await response.json();
```

---

## 🤝 المساهمة

نرحب بالمساهمات! يرجى اتباع الخطوات التالية:

### 1. Fork المشروع

```bash
git clone https://github.com/your-username/avan-titre.git
cd avan-titre
```

### 2. إنشاء فرع جديد

```bash
git checkout -b feature/amazing-feature
```

### 3. التطوير

```bash
pnpm dev
# قم بالتعديلات
```

### 4. الاختبار

```bash
pnpm validate  # format + lint + typecheck + test
```

### 5. Commit

```bash
git add .
git commit -m "feat: add amazing feature"
```

**Commit Convention**:

- `feat:` - ميزة جديدة
- `fix:` - إصلاح خطأ
- `docs:` - توثيق
- `style:` - تنسيق
- `refactor:` - إعادة هيكلة
- `test:` - اختبارات
- `chore:` - مهام صيانة

### 6. Push & Pull Request

```bash
git push origin feature/amazing-feature
```

افتح Pull Request على GitHub.

### معايير الكود

- **TypeScript Strict Mode** - إلزامي
- **ESLint** - يجب أن يمر بدون أخطاء
- **Prettier** - تنسيق تلقائي
- **Tests** - اختبارات للميزات الجديدة
- **Documentation** - توثيق للـ API العامة

---

## 🐛 الإبلاغ عن الأخطاء

افتح Issue على GitHub مع:

1. **الوصف** - ماذا حدث؟
2. **الخطوات** - كيف نعيد إنتاج الخطأ؟
3. **المتوقع** - ما السلوك المتوقع؟
4. **البيئة** - OS, Node version, Browser
5. **Screenshots** - إن أمكن

**مثال**:

```markdown
## الوصف

التصنيف يفشل عند لصق نص طويل (>1000 سطر)

## الخطوات

1. افتح المحرر
2. الصق نص 1500 سطر
3. انتظر التصنيف

## المتوقع

يجب أن يصنف جميع الأسطر

## الفعلي

يتوقف عند السطر 1000

## البيئة

- OS: Windows 11
- Node: 20.10.0
- Browser: Chrome 120
```

---

## 📜 الترخيص

**Proprietary** - جميع الحقوق محفوظة.

لا يُسمح باستخدام أو توزيع أو تعديل هذا البرنامج بدون إذن صريح من المالك.

---

## 🙏 شكر وتقدير

### التقنيات المستخدمة

- **[Next.js](https://nextjs.org/)** - React framework
- **[Tiptap](https://tiptap.dev/)** - Rich text editor
- **[ProseMirror](https://prosemirror.net/)** - Editor engine
- **[Tailwind CSS](https://tailwindcss.com/)** - Styling
- **[Radix UI](https://www.radix-ui.com/)** - UI components
- **[Anthropic Claude](https://www.anthropic.com/)** - AI agent
- **[Google Gemini](https://ai.google.dev/)** - Context enhancement
- **[Mistral AI](https://mistral.ai/)** - OCR
- **[Qdrant](https://qdrant.tech/)** - Vector database

### الخطوط

- **[AzarMehr Monospaced](https://github.com/rastikerdar/vazir-font)** - خط المحرر
- **[Cairo](https://fonts.google.com/specimen/Cairo)** - خط الواجهة

---

## 📞 التواصل

- **GitHub Issues**: [github.com/your-org/avan-titre/issues](https://github.com/your-org/avan-titre/issues)
- **Email**: support@avan-titre.com
- **Twitter**: [@AvantTitre](https://twitter.com/AvantTitre)

---

## 🗺️ خارطة الطريق

### الإصدار الحالي (v1.0)

- [x] نظام التصنيف 4-طبقات
- [x] استيراد PDF/DOC/DOCX/TXT/Fountain/FDX
- [x] تصدير PDF/DOCX/HTML/Fountain/FDX
- [x] واجهة RTL كاملة
- [x] A4 pagination
- [x] Keyboard shortcuts

### قريباً (v1.1)

- [ ] Gemini Context Layer (تحسين السياق)
- [ ] Gemini Doubt Layer (حل الشكوك)
- [ ] Progressive AI Updates (تحديثات حية)
- [ ] Offline mode (WASM classification)

### المستقبل (v2.0)

- [ ] Fine-tuned model للعربية
- [ ] Multi-language support (English, French)
- [ ] Real-time collaboration
- [ ] Cloud sync
- [ ] Mobile app (React Native)

---

<div align="center">

**صُنع بـ ❤️ للكتّاب العرب**

[⬆ العودة للأعلى](#أفان-تيتر--avan-titre)

</div>
