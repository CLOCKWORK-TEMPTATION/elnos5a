# نظام RAG لفهرسة الكود والبحث الذكي

## نظرة عامة

نظام متكامل لفهرسة كود المشروع والإجابة على الأسئلة التقنية باستخدام تقنيات الذكاء الاصطناعي المتقدمة.

### التقنيات المستخدمة

- **Qdrant Cloud** - قاعدة بيانات vectors سحابية (4GB)
- **OpenAI Embeddings** - تحويل النصوص لـ vectors (`text-embedding-3-small`)
- **Anthropic Claude** - نموذج لغوي للإجابة على الأسئلة
- **TypeScript** - لغة البرمجة الأساسية

---

## البنية المعمارية

```
┌─────────────────────────────────────────────────────────────┐
│                    نظام RAG للكود                           │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  ملفات الكود  │ ───> │   Chunker    │ ───> │  Embeddings  │
│  .ts, .tsx   │      │  تقسيم ذكي   │      │   OpenAI     │
│  .js, .md    │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────┐
                                            │ Qdrant Cloud │
                                            │  652 chunks  │
                                            └──────────────┘
                                                    │
        ┌───────────────────────────────────────────┘
        │
        ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   سؤال من    │ ───> │    بحث في    │ ───> │   Claude     │
│  المستخدم    │      │   Qdrant     │      │   إجابة     │
└──────────────┘      └──────────────┘      └──────────────┘
```

---

## الإعداد والتثبيت

### المتطلبات الأساسية

1. **Node.js** >= 18.0.0
2. **pnpm** >= 10.0.0
3. **حسابات API**:
   - Qdrant Cloud (free tier)
   - OpenAI API
   - Anthropic API

### إعداد المتغيرات البيئية

أضف المتغيرات التالية في ملف `.env`:

```env
# Qdrant Cloud Configuration
QDRANT_URL=https://your-cluster-id.region.gcp.cloud.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key

# OpenAI API (للـ embeddings)
OPENAI_API_KEY=sk-proj-your-openai-key

# Anthropic API (للـ RAG responses)
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
```

### التثبيت

Dependencies تم تثبيتها مسبقاً في المشروع:

```json
{
  "@qdrant/js-client-rest": "^1.17.0",
  "openai": "^6.25.0",
  "pino": "^9.14.0",
  "pino-pretty": "^13.1.3"
}
```

---

## دليل الاستخدام

### 1. فهرسة المشروع

قبل استخدام النظام، يجب فهرسة الكود:

```bash
pnpm rag:index
```

**ماذا يحدث؟**

1. إنشاء/تحديث collection في Qdrant Cloud
2. قراءة جميع ملفات `.ts`, `.tsx`, `.js`, `.jsx`, `.md` من مجلد `src/`
3. تقسيم الملفات لـ chunks ذكية (~500 token لكل chunk)
4. توليد embeddings عبر OpenAI API
5. رفع الـ vectors إلى Qdrant Cloud

**الوقت المتوقع:** 2-5 دقائق (حسب حجم المشروع)

**النتيجة:**

```
✅ Indexing completed successfully!
📊 Indexing Statistics:
  - Total points: 652
  - Vectors count: 0
```

### 2. السؤال عن الكود

بعد الفهرسة، يمكنك السؤال عن أي شيء:

```bash
pnpm rag:ask "سؤالك هنا"
```

**أمثلة عملية:**

```bash
# عن الوظائف والخوارزميات
pnpm rag:ask "كيف يعمل paste classifier؟"
pnpm rag:ask "كيف يتم تصنيف السطور في المحرر؟"

# عن الـ patterns والـ regex
pnpm rag:ask "ما هي الـ regex patterns المستخدمة للنصوص العربية؟"
pnpm rag:ask "أين توجد patterns للأسماء العربية؟"

# عن الـ architecture
pnpm rag:ask "كيف يتم التعامل مع context memory؟"
pnpm rag:ask "ما هي extensions المستخدمة في Tiptap؟"

# عن الملفات والمكونات
pnpm rag:ask "أين توجد دوال معالجة النصوص؟"
pnpm rag:ask "ما هي الملفات المسؤولة عن تصنيف الحوار؟"
```

**مثال على الإجابة:**

```
================================================================================
📝 Answer:
================================================================================
يعمل paste classifier من خلال تحليل النص الملصق وتصنيف كل سطر حسب نوعه...
[إجابة مفصلة من Claude بناءً على الكود الفعلي]

================================================================================
📚 Sources:
================================================================================

[1] src/extensions/paste-classifier.ts (score: 0.892)
    export class PasteClassifier { ... }

[2] src/extensions/classification-core.ts (score: 0.845)
    function classifyLine(line: string): LineType { ... }

================================================================================
```

### 3. عرض الإحصائيات

للتحقق من حالة الفهرسة:

```bash
pnpm rag:stats
```

**النتيجة:**

```
================================================================================
📊 RAG Index Statistics
================================================================================
Total Points: 652
Vectors Count: 0
================================================================================
```

### 4. اختبار سريع

لاختبار النظام بفهرسة ملف واحد فقط:

```bash
pnpm rag:smoke
```

---

## كيف يعمل النظام؟

### مرحلة الفهرسة (Indexing)

#### 1. قراءة الملفات

```typescript
// الملفات المدعومة
const includeExtensions = [".ts", ".tsx", ".js", ".jsx", ".md"];

// المجلدات المستبعدة
const excludeDirs = ["node_modules", "dist", "build", ".git", "coverage"];
```

#### 2. التقسيم الذكي (Chunking)

**للملفات البرمجية (TypeScript/JavaScript):**

```typescript
// تقسيم بناءً على الحجم
const CHUNK_SIZE = 500; // tokens (~2000 characters)
const CHUNK_OVERLAP = 50; // tokens overlap

// كل chunk يحتوي على:
{
  content: "الكود الفعلي",
  metadata: {
    filePath: "src/extensions/paste-classifier.ts",
    fileName: "paste-classifier.ts",
    fileType: "ts",
    language: "typescript",
    startLine: 1,
    endLine: 45,
    chunkIndex: 0,
    totalChunks: 5
  }
}
```

**لملفات Markdown:**

```typescript
// تقسيم حسب الـ sections (headers)
# Section 1
Content...

# Section 2
Content...

// كل section = chunk منفصل
```

#### 3. توليد Embeddings

```typescript
// استخدام OpenAI API
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: chunkContent,
  encoding_format: "float",
});

// النتيجة: vector بـ 1536 dimension
```

#### 4. الرفع على Qdrant

```typescript
// Batch upload (100 points per batch)
await qdrantClient.upsert('codebase-index', {
  wait: true,
  points: [
    {
      id: 0,
      vector: [0.123, 0.456, ...], // 1536 dimensions
      payload: {
        content: "...",
        filePath: "...",
        // ... metadata
      }
    }
  ]
});
```

### مرحلة البحث (RAG Query)

#### 1. تحويل السؤال لـ Embedding

```typescript
const questionEmbedding = await generateEmbedding("كيف يعمل paste classifier؟");
```

#### 2. البحث في Qdrant

```typescript
const results = await qdrantClient.search("codebase-index", {
  vector: questionEmbedding,
  limit: 5, // أفضل 5 نتائج
  with_payload: true,
});

// النتائج مرتبة حسب similarity score
```

#### 3. بناء Context للـ LLM

```typescript
const context = results
  .map((result, idx) => {
    return `[${idx + 1}] من ${result.payload.filePath}:
${result.payload.content}`;
  })
  .join("\n\n---\n\n");
```

#### 4. توليد الإجابة بواسطة Claude

```typescript
const response = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 2000,
  messages: [
    {
      role: "user",
      content: `السؤال: ${question}

الكود المتاح:
${context}

أجب على السؤال بناءً على الكود أعلاه.`,
    },
  ],
  system: `أنت مساعد برمجي متخصص في تحليل كود TypeScript/JavaScript...`,
});
```

---

## الإعدادات المتقدمة

### تخصيص حجم الـ Chunks

في `src/rag/config.ts`:

```typescript
export const CHUNK_SIZE = 500; // tokens
export const CHUNK_OVERLAP = 50; // tokens
```

**متى تزيد الحجم؟**

- عند وجود functions طويلة ومعقدة
- عند الحاجة لسياق أكبر

**متى تقلل الحجم؟**

- عند وجود ملفات صغيرة كثيرة
- لتحسين دقة البحث

### تخصيص عدد النتائج

في `src/rag/query.ts`:

```typescript
const searchResults = await searchCode(question, 5); // غير الرقم هنا
```

**التوصيات:**

- 3-5 نتائج: للأسئلة البسيطة
- 7-10 نتائج: للأسئلة المعقدة
- أكثر من 10: قد يسبب تشويش

### تخصيص الملفات المفهرسة

في `src/rag/chunker.ts`:

```typescript
// إضافة امتدادات جديدة
const includeExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".md",
  ".py",
  ".java",
  ".go", // أضف ما تريد
];

// استبعاد مجلدات إضافية
const excludeDirs = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "tests",
  "docs", // أضف ما تريد
];
```

---

## الأداء والتكاليف

### الأداء

| العملية       | الوقت المتوقع |
| ------------- | ------------- |
| فهرسة 100 ملف | ~1-2 دقيقة    |
| فهرسة 500 ملف | ~3-5 دقائق    |
| استعلام واحد  | ~2-3 ثواني    |

### التكاليف

**OpenAI Embeddings:**

- السعر: $0.0001 per 1K tokens
- مثال: 652 chunk × 500 token = 326K tokens
- التكلفة: ~$0.03 للفهرسة الكاملة

**Qdrant Cloud:**

- Free tier: 1GB storage
- المشروع الحالي: 652 chunks ≈ 4MB
- التكلفة: مجاني

**Anthropic Claude:**

- حسب الاستخدام
- ~$0.003 per query (متوسط)

---

## استكشاف الأخطاء

### خطأ: "QDRANT_URL is required"

**السبب:** متغير البيئة غير موجود أو به خطأ إملائي

**الحل:**

```bash
# تحقق من .env
cat .env | grep QDRANT_URL

# يجب أن يكون:
QDRANT_URL=https://your-cluster-id.region.gcp.cloud.qdrant.io
```

### خطأ: "Incorrect API key provided"

**السبب:** OpenAI API key منتهي أو غير صحيح

**الحل:**

1. احصل على مفتاح جديد من [platform.openai.com](https://platform.openai.com/account/api-keys)
2. حدّث `.env`:
   ```env
   OPENAI_API_KEY=sk-proj-your-new-key
   ```

### خطأ: "Collection not found"

**السبب:** لم يتم تشغيل الفهرسة بعد

**الحل:**

```bash
pnpm rag:index
```

### خطأ: "No results found"

**السبب:** السؤال غير واضح أو الكود غير مفهرس

**الحل:**

1. تأكد من الفهرسة: `pnpm rag:stats`
2. أعد صياغة السؤال بشكل أوضح
3. استخدم كلمات مفتاحية من الكود

### مشكلة: "Vectors Count: 0"

**السبب:** هذا طبيعي في Qdrant - الـ optimization لم يحدث بعد

**الحل:** لا داعي للقلق، `Total Points` هو المهم

---

## أفضل الممارسات

### كتابة الأسئلة

✅ **جيد:**

```bash
pnpm rag:ask "كيف يتم تصنيف سطر الحوار في paste-classifier؟"
pnpm rag:ask "ما هي الـ regex المستخدمة للكشف عن أسماء الشخصيات؟"
```

❌ **سيء:**

```bash
pnpm rag:ask "كيف يعمل الكود؟"  # غير محدد
pnpm rag:ask "أين الباق؟"        # غامض
```

### إعادة الفهرسة

**متى تعيد الفهرسة؟**

- بعد إضافة ملفات جديدة
- بعد تعديلات كبيرة في الكود
- عند تغيير استراتيجية الـ chunking

**كم مرة؟**

- يومياً: للمشاريع النشطة
- أسبوعياً: للمشاريع المستقرة
- عند الحاجة: للمشاريع القديمة

### تحسين الدقة

1. **استخدم مصطلحات تقنية دقيقة**
2. **اذكر أسماء الملفات أو الـ functions إن أمكن**
3. **قسّم الأسئلة المعقدة لأسئلة أصغر**
4. **راجع المصادر المرفقة في الإجابة**

---

## البنية التفصيلية للملفات

```
src/rag/
├── config.ts              # إعداد Qdrant + OpenAI + Anthropic
│   ├── QdrantClient       # اتصال بـ Qdrant Cloud
│   ├── Zod validation     # التحقق من المتغيرات
│   └── Logger setup       # إعداد Pino logger
│
├── types.ts               # TypeScript interfaces
│   ├── CodeChunk          # بنية الـ chunk
│   ├── ChunkMetadata      # metadata للـ chunk
│   ├── SearchResult       # نتيجة البحث
│   └── RagResponse        # إجابة RAG
│
├── embeddings.ts          # OpenAI embeddings
│   ├── generateEmbedding()       # embedding واحد
│   └── generateEmbeddingsBatch() # batch processing
│
├── chunker.ts             # تقسيم الملفات
│   ├── chunkFile()        # تقسيم ملف واحد
│   ├── chunkCodeFile()    # تقسيم ملفات برمجية
│   ├── chunkMarkdownFile() # تقسيم markdown
│   └── getAllCodeFiles()  # قراءة كل الملفات
│
├── indexer.ts             # فهرسة في Qdrant
│   ├── createCollection() # إنشاء collection
│   ├── indexCodebase()    # فهرسة المشروع
│   └── getIndexStats()    # إحصائيات
│
├── query.ts               # RAG query engine
│   ├── searchCode()       # بحث في Qdrant
│   └── askQuestion()      # RAG كامل مع Claude
│
└── README.md              # توثيق مختصر

scripts/
├── rag-index.ts           # CLI للفهرسة
├── rag-query.ts           # CLI للأسئلة
├── rag-stats.ts           # CLI للإحصائيات
└── rag-smoke-test.ts      # اختبار سريع
```

---

## التطوير المستقبلي

### قيد التطوير

- [ ] **Incremental Indexing** - فهرسة الملفات المتغيرة فقط
- [ ] **Search Filters** - البحث في ملفات أو مجلدات محددة
- [ ] **Web UI** - واجهة ويب للبحث
- [ ] **Multi-language Support** - دعم لغات برمجة إضافية
- [ ] **Query Cache** - تخزين مؤقت للنتائج المتكررة

### أفكار للتحسين

- **Code Summarization** - ملخصات تلقائية للملفات الكبيرة
- **Dependency Graph** - فهم العلاقات بين الملفات
- **Auto-documentation** - توليد توثيق تلقائي
- **Code Review Assistant** - مساعد لمراجعة الكود
- **Bug Detection** - كشف الأخطاء المحتملة

---

## الدعم والمساعدة

### الموارد

- **Qdrant Docs:** https://qdrant.tech/documentation/
- **OpenAI API:** https://platform.openai.com/docs
- **Anthropic Claude:** https://docs.anthropic.com/

### الأسئلة الشائعة

**س: هل يمكن استخدام النظام مع مشاريع أخرى؟**  
ج: نعم، فقط غيّر `rootDir` في `scripts/rag-index.ts`

**س: هل يدعم النظام اللغة العربية؟**  
ج: نعم، كل من OpenAI و Claude يدعمان العربية بشكل ممتاز

**س: كم يستهلك من storage في Qdrant؟**  
ج: ~6KB لكل chunk، المشروع الحالي ~4MB

**س: هل يمكن استخدام نماذج أخرى؟**  
ج: نعم، يمكن تعديل `EMBEDDING_MODEL` في config.ts

---

## الخلاصة

نظام RAG المبني يوفر:

✅ **فهرسة ذكية** للكود بتقنيات متقدمة  
✅ **بحث دقيق** باستخدام semantic search  
✅ **إجابات موثوقة** من Claude بناءً على الكود الفعلي  
✅ **سهولة الاستخدام** عبر CLI commands بسيطة  
✅ **قابلية التوسع** لمشاريع أكبر

**النظام جاهز للاستخدام الفوري!** 🚀
