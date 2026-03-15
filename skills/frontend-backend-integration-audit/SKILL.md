---
name: frontend-backend-integration-audit
description: تحليل شامل للتكامل بين الواجهة (TypeScript/React/Next.js) والخلفية (Node.js/Express .mjs) من حيث العقود، توافق الأنواع، runtime guards، ومعالجة الأخطاء. استخدم هذه المهارة عند طلب مراجعة التكامل، تدقيق العقود، فحص توافق الأنواع بين frontend/backend، تحليل API contracts، فحص runtime validation، أو عند ظهور مشاكل في التواصل بين الواجهة والخلفية.
---

# Frontend-Backend Integration Audit

## متى تستخدم

استخدم هذه المهارة عندما:

- تضيف endpoint جديد أو تعدل endpoint موجود
- تظهر مشاكل في التواصل بين frontend/backend
- تريد التأكد من توافق الأنواع بعد تغيير في schema
- تحتاج لمراجعة شاملة للتكامل قبل release
- تريد فحص runtime validation على API boundaries

---

## تصنيف الأسباب الجذرية

صنّف كل مشكلة تكامل ضمن سبب جذري واحد:

- `contract-mismatch`: request/response schema مختلف بين frontend وbackend (field names، types)
- `type-drift`: TypeScript types لا تعكس runtime data الفعلي
- `missing-runtime-guard`: غياب Zod/validation على حد ال API
- `error-gap`: مسارات فشل غير مغطاة أو تكشف معلومات خاطئة للعميل
- `sse-boundary-break`: SSE stream غير متطابق مع parsing الواجهة

ابدأ بالسبب الجذري ثم وصف العَرَض.

## المرجعية في المشروع

- `server/routes/index.mjs` — تعريف جميع الـ routes
- `server/controllers/` — controllers (`.mjs`)
- `src/extensions/classification-types.ts` — الأنواع المشتركة
- `src/pipeline/` — import orchestration وagent command engine
- المشروع يستخدم TypeScript strict في frontend و`.mjs` في backend

## نقطة البداية السريعة

1. حدد الـ endpoint المستهدف واقرأ ملفي route وcontroller معاً.
2. قارن TypeScript types في frontend مع بنية response في backend.
3. تحقق من وجود runtime validation (Zod/manual) على حد ال API.
4. صنّف المشكلة باستخدام نماذج `تصنيف الأسباب الجذرية`.
5. شغّل `pnpm typecheck` و`pnpm test:integration` للتحقق.

## سير العمل

### المرحلة 1: تحديد نطاق التدقيق

**1.1 تحديد Endpoints المستهدفة**

ابدأ بتحديد الـ endpoints التي تريد تدقيقها:

```bash
# قائمة بجميع routes في الخلفية
grep -r "router\.(get|post|put|delete)" server/routes/
```

**Endpoints رئيسية في المشروع:**
- `POST /api/file-extract` — استخراج نص من ملفات
- `POST /api/files/extract` — استخراج multipart
- `POST /api/agent/review` — مراجعة AI للأسطر المشبوهة
- `POST /api/final-review` — مراجعة نهائية
- `POST /api/ai/context-enhance` — تحسين السياق (SSE)
- `POST /api/ai/doubt-resolve` — حل الشكوك (SSE)
- `POST /api/export/pdfa` — تصدير PDF
- `GET /health` — فحص صحة الخادم

**1.2 تحديد ملفات الأنواع المرتبطة**

حدد ملفات TypeScript types ذات الصلة:

```typescript
// مثال: ملفات الأنواع الرئيسية
src/extensions/classification-types.ts
src/types/agent-review.ts (إن وجد)
src/types/final-review.ts (إن وجد)
```

---

### المرحلة 2: فحص العقود (Contract Audit)

**2.1 التحقق من وجود عقد موثق**

لكل endpoint، تحقق من:

- [ ] وجود ملف عقد في `specs/*/contracts/`
- [ ] توثيق كامل لـ request schema
- [ ] توثيق كامل لـ response schema
- [ ] قائمة بالـ invariants والقيود

**مثال: عقد endpoint**

```markdown
# Contract: POST /api/agent/review

## Request Schema
- `sessionId: string` — معرف الجلسة (required)
- `importOpId: string` — معرف العملية (required)
- `totalReviewed: number` — عدد الأسطر المراجعة
- `suspiciousLines: SuspiciousLine[]` — الأسطر المشبوهة
- `requiredItemIds: string[]` — معرفات العناصر المطلوبة
- `forcedItemIds: string[]` — معرفات العناصر الإجبارية

## Response Schema
- `status: "applied" | "partial" | "error"`
- `commands: Command[]` — أوامر التصحيح
- `message?: string` — رسالة توضيحية
- `latencyMs: number` — زمن الاستجابة

## Invariants
- `forcedItemIds` يجب أن تكون subset من `requiredItemIds`
- `commands` تحتوي فقط على `relabel` أو `split`
```

**2.2 التحقق من تطابق العقد مع الكود**

قارن العقد الموثق مع الكود الفعلي:

```bash
# افحص controller implementation
cat server/controllers/agent-review-controller.mjs

# افحص frontend caller
grep -r "api/agent/review" src/
```

**نقاط الفحص:**
- [ ] جميع الحقول المطلوبة في العقد موجودة في الكود
- [ ] لا توجد حقول إضافية غير موثقة
- [ ] أنواع الحقول متطابقة (string, number, array, etc.)
- [ ] القيم الافتراضية متسقة

---

### المرحلة 3: فحص توافق الأنواع (Type Compatibility)

**3.1 فحص TypeScript Types في الواجهة**

تحقق من وجود types صريحة لكل API call:

```typescript
// ✅ جيد: أنواع صريحة
interface AgentReviewRequest {
  sessionId: string;
  importOpId: string;
  totalReviewed: number;
  suspiciousLines: SuspiciousLine[];
  requiredItemIds: string[];
  forcedItemIds: string[];
}

interface AgentReviewResponse {
  status: "applied" | "partial" | "error";
  commands: Command[];
  message?: string;
  latencyMs: number;
}

async function requestAgentReview(
  payload: AgentReviewRequest
): Promise<AgentReviewResponse> {
  // ...
}
```

```typescript
// ❌ سيء: أنواع غير واضحة
async function requestAgentReview(payload: any): Promise<any> {
  // ...
}
```

**3.2 فحص Runtime Validation في الخلفية**

تحقق من وجود validation على حدود API:

```javascript
// ✅ جيد: validation صريح
export function validateAgentReviewRequestBody(body) {
  if (!body.sessionId || typeof body.sessionId !== "string") {
    throw new Error("sessionId is required and must be a string");
  }
  
  if (!body.importOpId || typeof body.importOpId !== "string") {
    throw new Error("importOpId is required and must be a string");
  }
  
  if (!Array.isArray(body.suspiciousLines)) {
    throw new Error("suspiciousLines must be an array");
  }
  
  // التحقق من invariants
  const requiredSet = new Set(body.requiredItemIds || []);
  const forcedSet = new Set(body.forcedItemIds || []);
  
  for (const forcedId of forcedSet) {
    if (!requiredSet.has(forcedId)) {
      throw new Error("forcedItemIds must be subset of requiredItemIds");
    }
  }
  
  return body;
}
```

**3.3 فحص Type Guards**

تحقق من وجود type guards لحماية runtime:

```typescript
// ✅ جيد: type guard
export function isElementType(value: string): value is ElementType {
  return VALID_ELEMENT_TYPES.has(value);
}

// استخدام
if (isElementType(rawType)) {
  // TypeScript يعرف الآن أن rawType هو ElementType
  processElement(rawType);
}
```

---

### المرحلة 4: فحص Runtime Guards

**4.1 فحص Input Validation**

تحقق من validation شامل للمدخلات:

```javascript
// نقاط الفحص:
// [ ] التحقق من وجود الحقول المطلوبة
// [ ] التحقق من أنواع البيانات
// [ ] التحقق من القيود (constraints)
// [ ] التحقق من العلاقات بين الحقول (invariants)
// [ ] رسائل خطأ واضحة ومفيدة
```

**4.2 فحص Output Validation**

تحقق من أن الخلفية تعيد البيانات بالشكل المتوقع:

```javascript
// ✅ جيد: ضمان structure الاستجابة
export function buildAgentReviewResponse(status, commands, meta) {
  return {
    apiVersion: "2.0",
    mode: "auto-apply",
    status,
    commands: commands || [],
    message: meta?.message || null,
    latencyMs: meta?.latencyMs || 0,
    meta: meta || null,
  };
}
```

**4.3 فحص Error Boundaries**

تحقق من معالجة الأخطاء على جميع المستويات:

```javascript
// في الخلفية
try {
  const result = await processRequest(payload);
  return buildSuccessResponse(result);
} catch (error) {
  // [ ] تصنيف الخطأ (temporary vs permanent)
  // [ ] رسالة خطأ واضحة للمستخدم
  // [ ] logging مناسب
  // [ ] status code صحيح
  return buildErrorResponse(error);
}
```

```typescript
// في الواجهة
try {
  const response = await fetch("/api/agent/review", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    // [ ] معالجة HTTP errors
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  // [ ] التحقق من structure الاستجابة
  if (!data.status) {
    throw new Error("Invalid response structure");
  }
  
  return data;
} catch (error) {
  // [ ] معالجة network errors
  // [ ] معالجة parsing errors
  // [ ] عرض رسالة مناسبة للمستخدم
  console.error("Agent review failed:", error);
  throw error;
}
```

---

### المرحلة 5: فحص حالات خاصة

**5.1 فحص SSE Endpoints**

للـ endpoints التي تستخدم Server-Sent Events:

```typescript
// نقاط الفحص:
// [ ] معالجة stream errors
// [ ] معالجة connection timeout
// [ ] معالجة incomplete messages
// [ ] cleanup عند إغلاق الاتصال
```

**5.2 فحص Multipart/Form Data**

للـ endpoints التي تستقبل ملفات:

```javascript
// نقاط الفحص:
// [ ] التحقق من حجم الملف
// [ ] التحقق من نوع الملف
// [ ] معالجة upload errors
// [ ] cleanup للملفات المؤقتة
```

**5.3 فحص Mock Modes**

تحقق من أن mock modes تحترم العقود:

```javascript
// ✅ جيد: mock يحترم العقد
if (process.env.AGENT_REVIEW_MOCK_MODE === "success") {
  return {
    status: "applied",
    commands: mockCommands,
    latencyMs: 0,
    // نفس structure الاستجابة الحقيقية
  };
}
```

---

## قائمة فحص شاملة (Comprehensive Checklist)

استخدم هذه القائمة لكل endpoint:

### العقود (Contracts)
- [ ] عقد موثق في `specs/*/contracts/`
- [ ] Request schema كامل
- [ ] Response schema كامل
- [ ] Invariants موثقة
- [ ] العقد متطابق مع الكود

### الأنواع (Types)
- [ ] TypeScript types موجودة في الواجهة
- [ ] Types تغطي جميع الحقول
- [ ] لا استخدام لـ `any` أو `unknown` بدون سبب
- [ ] Type guards موجودة للتحويلات

### Runtime Validation
- [ ] Input validation في الخلفية
- [ ] التحقق من الحقول المطلوبة
- [ ] التحقق من أنواع البيانات
- [ ] التحقق من القيود والعلاقات
- [ ] Output validation قبل الإرسال

### معالجة الأخطاء
- [ ] Try-catch في الواجهة
- [ ] Try-catch في الخلفية
- [ ] رسائل خطأ واضحة
- [ ] Status codes صحيحة
- [ ] Logging مناسب

### حالات خاصة
- [ ] SSE error handling (إن وجد)
- [ ] File upload validation (إن وجد)
- [ ] Mock modes تحترم العقود
- [ ] Timeout handling

---

## أمثلة تطبيقية

### مثال 1: تدقيق endpoint موجود

```bash
# 1. حدد الـ endpoint
endpoint="/api/agent/review"

# 2. اقرأ العقد
cat specs/004-langchain-review-migration/contracts/review-endpoints.md

# 3. افحص الـ controller
cat server/controllers/agent-review-controller.mjs

# 4. افحص الـ types
cat src/types/agent-review.ts

# 5. افحص الـ caller
grep -r "api/agent/review" src/

# 6. شغّل الاختبارات
pnpm test:integration tests/unit/server/agent-review.contract.test.ts
```

### مثال 2: إضافة endpoint جديد

عند إضافة endpoint جديد، اتبع هذا الترتيب:

1. **اكتب العقد أولاً** في `specs/*/contracts/new-endpoint.md`
2. **اكتب الأنواع** في `src/types/new-endpoint.ts`
3. **اكتب الاختبارات** في `tests/unit/server/new-endpoint.contract.test.ts`
4. **نفذ الـ controller** في `server/controllers/new-endpoint-controller.mjs`
5. **نفذ الـ caller** في الواجهة
6. **شغّل الاختبارات** للتأكد من التطابق

---

## أدوات مساعدة

### سكريبت فحص توافق الأنواع

يمكنك إنشاء سكريبت للفحص الآلي:

```typescript
// scripts/check-api-contracts.ts
import { readFileSync } from "fs";
import { glob } from "glob";

// اقرأ جميع ملفات العقود
const contractFiles = glob.sync("specs/*/contracts/*.md");

// اقرأ جميع ملفات الأنواع
const typeFiles = glob.sync("src/types/*.ts");

// قارن وأبلغ عن التناقضات
for (const contract of contractFiles) {
  const content = readFileSync(contract, "utf-8");
  // استخرج الحقول من العقد
  // قارن مع الأنواع الفعلية
  // أبلغ عن الفروقات
}
```

### اختبار runtime validation

```typescript
// tests/unit/server/validation.test.ts
import { describe, it, expect } from "vitest";
import { validateAgentReviewRequestBody } from "../../../server/agent-review.mjs";

describe("validateAgentReviewRequestBody", () => {
  it("rejects missing sessionId", () => {
    expect(() =>
      validateAgentReviewRequestBody({
        importOpId: "op-1",
        totalReviewed: 1,
        suspiciousLines: [],
      })
    ).toThrow(/sessionId/i);
  });

  it("rejects invalid forcedItemIds", () => {
    expect(() =>
      validateAgentReviewRequestBody({
        sessionId: "s-1",
        importOpId: "op-1",
        totalReviewed: 1,
        suspiciousLines: [],
        requiredItemIds: ["item-0"],
        forcedItemIds: ["item-1"], // ليس في required
      })
    ).toThrow(/subset/i);
  });
});
```

---

## نصائح وأفضل الممارسات

### 1. استخدم Zod للـ validation

```typescript
import { z } from "zod";

const AgentReviewRequestSchema = z.object({
  sessionId: z.string().min(1),
  importOpId: z.string().min(1),
  totalReviewed: z.number().int().nonnegative(),
  suspiciousLines: z.array(SuspiciousLineSchema),
  requiredItemIds: z.array(z.string()),
  forcedItemIds: z.array(z.string()),
}).refine(
  (data) => {
    const requiredSet = new Set(data.requiredItemIds);
    return data.forcedItemIds.every((id) => requiredSet.has(id));
  },
  { message: "forcedItemIds must be subset of requiredItemIds" }
);

// استخدام
const validated = AgentReviewRequestSchema.parse(body);
```

### 2. وثّق التغييرات في العقود

عند تعديل endpoint، حدّث:
- ملف العقد في `specs/*/contracts/`
- ملف الأنواع في `src/types/`
- الاختبارات في `tests/`
- ملف `AGENTS.md` إذا لزم الأمر

### 3. اختبر حالات الفشل

لا تختبر فقط الحالات الناجحة:

```typescript
it("handles network timeout gracefully", async () => {
  // محاكاة timeout
  // تحقق من معالجة الخطأ
});

it("handles malformed response", async () => {
  // محاكاة استجابة غير صحيحة
  // تحقق من عدم crash
});
```

### 4. استخدم TypeScript strict mode

في `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

---

## قواعد التقرير

- لا تعتمد على TypeScript types وحدها — types تختفي عند runtime
- تحقّق من runtime validation على حدود API باستخدام Zod أو manual guards
- لا تقبل type assertion بدون runtime check (تجنّب `as SomeType` على بيانات API)
- استشهد بالملف والسطر عند ذكر أي تعارض
- شغّل `pnpm typecheck` و`pnpm test:integration` بعد كل تغيير

## قالب التقرير

```markdown
# تدقيق تكامل: [Endpoint أو Module]

## السبب الجذري
[contract-mismatch / type-drift / missing-runtime-guard / error-gap / sse-boundary-break]

## الملفات المتأثرة
- Frontend: [path:line]
- Backend:  [path:line]

## العَرَض
[what fails at runtime]

## الإصلاح المقترح
[minimal fix at the owning file]

## التحقق
`pnpm typecheck` + `pnpm test:integration`
```

## المراجع

لا توجد ملفات مرجعية خارجية لهذه المهارة — راجع `AGENTS.md` وملفات `specs/` للعقود التفصيلية.
