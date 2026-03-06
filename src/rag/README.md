# نظام RAG لفهرسة الكود والبحث الذكي

نظام متكامل لفهرسة كود المشروع والإجابة على الأسئلة باستخدام **Qdrant Cloud** و **OpenAI Embeddings** و **Claude**.

## المكونات

### الملفات الأساسية

- **`config.ts`** - إعداد Qdrant client، OpenAI، Anthropic مع Zod validation
- **`types.ts`** - TypeScript types للـ chunks والنتائج
- **`embeddings.ts`** - توليد embeddings عبر OpenAI API
- **`chunker.ts`** - تقسيم الملفات لـ chunks ذكية
- **`indexer.ts`** - فهرسة الكود في Qdrant Cloud
- **`query.ts`** - محرك البحث + RAG مع Claude

### Scripts

- **`scripts/rag-index.ts`** - فهرسة المشروع كامل
- **`scripts/rag-query.ts`** - السؤال عن الكود
- **`scripts/rag-stats.ts`** - عرض إحصائيات الفهرسة
- **`scripts/rag-smoke-test.ts`** - اختبار سريع للنظام

## الإعداد

### 1. المتغيرات البيئية

تأكد من وجود المتغيرات التالية في `.env`:

```env
# Qdrant Cloud
QDRANT_URL=https://50454ebc-1337-464e-b16c-863ba7092853.us-east4-0.gcp.cloud.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key

# OpenAI (للـ embeddings)
OPENAI_API_KEY=your-openai-api-key

# Anthropic (للـ RAG responses)
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### 2. التثبيت

Dependencies تم تثبيتها بالفعل:

- `@qdrant/js-client-rest` - Qdrant client
- `openai` - OpenAI API client
- `pino` + `pino-pretty` - Logging

## الاستخدام

### فهرسة المشروع

```bash
# فهرسة كل ملفات src/
pnpm rag:index
```

هيقوم بـ:

1. إنشاء collection في Qdrant Cloud
2. قراءة كل ملفات `.ts`, `.tsx`, `.js`, `.jsx`, `.md` من `src/`
3. تقسيمها لـ chunks ذكية
4. توليد embeddings عبر OpenAI
5. رفعها على Qdrant Cloud

### السؤال عن الكود

```bash
# مثال: السؤال عن paste classifier
pnpm rag:ask "كيف يعمل paste classifier؟"

# مثال: السؤال عن regex patterns
pnpm rag:ask "ما هي الـ regex patterns المستخدمة للنصوص العربية؟"

# مثال: السؤال عن extensions
pnpm rag:ask "ما هي الـ extensions المستخدمة في المحرر؟"
```

### عرض الإحصائيات

```bash
pnpm rag:stats
```

### اختبار سريع

```bash
# فهرسة ملف واحد واختبار سؤال
pnpm rag:smoke
```

## كيف يعمل؟

### 1. الفهرسة (Indexing)

```
ملفات الكود → Chunker → OpenAI Embeddings → Qdrant Cloud
```

- **Chunker** يقسم الملفات بذكاء:
  - TypeScript/JavaScript: حسب الـ functions/classes
  - Markdown: حسب الـ sections
  - Max chunk size: ~500 tokens
  - Overlap: 50 tokens

- **Embeddings** تُولد عبر `text-embedding-3-small` (1536 dimensions)

- **Qdrant** يخزن الـ vectors مع metadata كاملة

### 2. البحث (RAG Query)

```
سؤال → Embedding → Qdrant Search → Top 5 Results → Claude → إجابة
```

1. السؤال يتحول لـ embedding
2. بحث في Qdrant عن أقرب 5 chunks
3. الـ chunks تُرسل لـ Claude كـ context
4. Claude يجاوب بناءً على الكود الفعلي

## استراتيجية التقسيم (Chunking)

### TypeScript/JavaScript Files

```typescript
// يتم التقسيم بناءً على حجم الكود
// كل chunk حوالي 500 token (~2000 character)
// مع overlap 50 token بين الـ chunks
```

**Metadata:**

- `filePath`, `fileName`, `fileType`
- `chunkIndex`, `totalChunks`
- `startLine`, `endLine`
- `language`

### Markdown Files

```markdown
# Section 1

Content...

# Section 2

Content...
```

يتم التقسيم حسب الـ headers مع metadata:

- `section` - اسم الـ section

## الإعدادات

في `config.ts`:

```typescript
export const RAG_COLLECTION_NAME = "codebase-index";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const CHUNK_SIZE = 500; // tokens
export const CHUNK_OVERLAP = 50; // tokens
```

## الملفات المستبعدة

الـ indexer يتجاهل:

- `node_modules/`
- `dist/`, `build/`
- `.git/`
- `coverage/`
- `test-results/`

## أمثلة على الأسئلة

```bash
# عن الوظائف
pnpm rag:ask "كيف يتم تصنيف السطور في paste-classifier؟"

# عن الـ patterns
pnpm rag:ask "ما هي الـ regex patterns للأسماء العربية؟"

# عن الـ architecture
pnpm rag:ask "كيف يتم التعامل مع context memory؟"

# عن الـ extensions
pnpm rag:ask "ما هي extensions المستخدمة في Tiptap؟"

# عن الـ utilities
pnpm rag:ask "أين توجد دوال معالجة النصوص العربية؟"
```

## ملاحظات مهمة

### Performance

- **Indexing**: يعتمد على عدد الملفات (مشروع متوسط: 2-5 دقائق)
- **Query**: سريع جداً (~2-3 ثواني)
- **Storage**: كل 1000 chunk ≈ 6MB في Qdrant

### Rate Limits

- OpenAI embeddings: 3000 requests/minute
- الـ indexer يحترم الحدود تلقائياً (200ms delay بين batches)

### Costs

- **OpenAI Embeddings**: ~$0.0001 per 1K tokens
- **Qdrant Cloud**: Free tier (1GB storage)
- **Claude API**: حسب الاستخدام

## Troubleshooting

### مشكلة: "QDRANT_URL is required"

تأكد من وجود `QDRANT_URL` في `.env` بدون أخطاء إملائية.

### مشكلة: "Incorrect API key"

تحقق من صحة `OPENAI_API_KEY` في `.env`.

### مشكلة: "Collection not found"

قم بتشغيل `pnpm rag:index` أولاً لإنشاء الـ collection.

### مشكلة: "No results found"

الـ collection فارغة - قم بفهرسة الكود أولاً.

## التطوير المستقبلي

- [ ] Incremental indexing (فهرسة الملفات المتغيرة فقط)
- [ ] Filters للبحث (مثلاً: البحث في ملفات معينة)
- [ ] UI بسيط للبحث
- [ ] دعم لغات برمجة إضافية
- [ ] Cache للنتائج المتكررة
