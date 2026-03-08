# Quickstart: Review Agent Engine (محرك المراجعة النهائية)

**Feature Branch**: `003-review-agent-engine`
**Created**: 2026-03-08

---

## المتطلبات الأساسية

1. **Node.js** 20+ مع **pnpm 10.28**
2. **مفتاح Anthropic API** (`ANTHROPIC_API_KEY` يبدأ بـ `sk-ant-`)
3. **خادم Express** يعمل على `127.0.0.1:8787`
4. **محرك الشك** (002-suspicion-engine) مُفعَّل ومتكامل مع pipeline

## إعداد البيئة

```bash
# 1. تأكد من وجود المفتاح في .env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# 2. (اختياري) تفعيل وضع المحاكاة للاختبارات
echo "FINAL_REVIEW_MOCK_MODE=success" >> .env

# 3. تثبيت التبعيات
pnpm install

# 4. تشغيل الخادم
pnpm file-import:server
```

## البنية الأساسية

```text
src/
├── types/final-review.ts              # أنواع TypeScript
├── final-review/payload-builder.ts    # بناء حزمة الأدلة
└── extensions/paste-classifier.ts     # نقطة التكامل مع pipeline

server/
├── final-review.mjs                   # requestFinalReview + validation
├── controllers/final-review-controller.mjs  # HTTP handler
└── routes/index.mjs                   # POST /api/final-review route
```

## التدفق الأساسي

### 1. بناء الحزمة (Frontend)

```typescript
import { buildFinalReviewSuspiciousLinePayload } from "@/final-review/payload-builder";

// لكل سطر مشبوه من محرك الشك:
const linePayload = buildFinalReviewSuspiciousLinePayload(
  suspicionCase, // SuspicionCase من محرك الشك
  contextLines // الأسطر المحيطة (±3)
);
```

### 2. إرسال الطلب

```typescript
const payload: FinalReviewRequestPayload = {
  packetVersion: "suspicion-final-review-v1",
  schemaVersion: "arabic-screenplay-classifier-output-v1",
  importOpId: "import-xyz-123",
  sessionId: "session-abc",
  totalReviewed: 150,
  suspiciousLines: [linePayload],
  requiredItemIds: [linePayload.itemId],
  forcedItemIds: [],
  schemaHints: DEFAULT_FINAL_REVIEW_SCHEMA_HINTS,
};

const response = await axios.post("/api/final-review", payload);
```

### 3. تطبيق الأوامر

```typescript
// الاستجابة تحتوي على أوامر Command API v2
for (const command of response.data.commands) {
  if (command.op === "relabel") {
    // تغيير نوع العنصر
    applyRelabel(editor, command.itemId, command.newType);
  } else if (command.op === "split") {
    // تقسيم السطر عند نقطة معينة
    applySplit(
      editor,
      command.itemId,
      command.splitAt,
      command.leftType,
      command.rightType
    );
  }
}
```

## وضع المحاكاة (Mock Mode)

للاختبارات بدون مفتاح API حقيقي:

```bash
# استجابة ناجحة وهمية
FINAL_REVIEW_MOCK_MODE=success pnpm file-import:server

# استجابة خطأ وهمية
FINAL_REVIEW_MOCK_MODE=error pnpm file-import:server
```

## التحقق السريع

```bash
# 1. تشغيل الخادم
pnpm file-import:server

# 2. إرسال طلب اختباري
curl -X POST http://127.0.0.1:8787/api/final-review \
  -H "Content-Type: application/json" \
  -d '{
    "packetVersion": "suspicion-final-review-v1",
    "schemaVersion": "arabic-screenplay-classifier-output-v1",
    "importOpId": "test-001",
    "sessionId": "session-test",
    "totalReviewed": 10,
    "suspiciousLines": [],
    "requiredItemIds": [],
    "forcedItemIds": [],
    "schemaHints": {
      "allowedTypes": ["action","dialogue","character","scene_header_1","scene_header_2","scene_header_3","transition","parenthetical","basmala"],
      "hardRules": []
    }
  }'

# الاستجابة المتوقعة:
# {"status":"success","commands":[],"model":"...","stats":{...}}
```

## نطاقات التوجيه (Routing Bands)

| النطاق            | suspicionScore       | السلوك               |
| ----------------- | -------------------- | -------------------- |
| `pass`            | < 40                 | لا يُرسل للمراجعة    |
| `local-review`    | 40–73                | مراجعة محلية فقط     |
| `agent-candidate` | 74–89 مع ≥2 findings | مرشح للمراجعة عبر AI |
| `agent-forced`    | ≥ 90 أو قواعد خاصة   | إلزامي — يجب مراجعته |

## حدود النظام

- **AGENT_REVIEW_MAX_RATIO**: سقف نسبة الأسطر المُرسلة للمراجعة (من إجمالي الأسطر)
- **Timeout**: مهلة زمنية مع 3 محاولات إعادة (exponential backoff)
- **Token budget**: حد أقصى للرموز في الطلب الواحد
- **Overload errors** (429/529/503): إعادة محاولة تلقائية

## الأخطاء الشائعة

| الخطأ              | السبب             | الحل                                      |
| ------------------ | ----------------- | ----------------------------------------- |
| `INVALID_API_KEY`  | مفتاح غير صالح    | تأكد من `sk-ant-` prefix والطول           |
| `VALIDATION_ERROR` | حزمة غير صالحة    | تحقق من `forcedItemIds ⊆ requiredItemIds` |
| `OVERLOADED`       | Claude API مُحمّل | انتظر — النظام يُعيد المحاولة تلقائيًا    |
| `TIMEOUT`          | تجاوز المهلة      | قلّل عدد الأسطر المُرسلة                  |
