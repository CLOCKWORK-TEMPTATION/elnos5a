---
name: shared-logic-reviewer
description: مراجعة المنطق المشترك في مشروع أفان تيتر (أنواع، مخططات، ثوابت، عملاء برمجيين). استخدم هذه المهارة عند مراجعة الأنواع المشتركة، التحقق من اتساق المخططات، فحص الثوابت، مراجعة العملاء البرمجيين، أو عند طلب "راجع المنطق المشترك"، "افحص الأنواع"، "تحقق من الثوابت"، "راجع المخططات"، "review shared logic"، "check types consistency"، "audit constants".
---

# مراجعة المنطق المشترك (Shared Logic Reviewer)

## متى تستخدم هذه المهارة

استخدم هذه المهارة عند:
- إضافة نوع عنصر سيناريو جديد
- تعديل عقد API موجود
- تحديث الثوابت المشتركة
- مراجعة اتساق الأنواع عبر Frontend/Backend
- إصلاح تعارضات في التعريفات
- التحقق من صحة المخططات قبل النشر

## تصنيف الأسباب الجذرية

صنّف كل تعارض ضمن سبب جذري واحد:

- `type-drift`: نفس النوع/الثابت معرّف بصيغ مختلفة في ملفين (حالة أحرف، snake_case مقابل camelCase)
- `count-mismatch`: عدد أنواع `ElementType` لا يتطابق مع `VALID_ELEMENT_TYPES` أو constants أخرى
- `version-skew`: `AGENT_API_VERSION` مختلف بين frontend وbackend
- `schema-contract-break`: الطرفان يستخدمان قيم مختلفة لنفس الحقل (`"applied"` مقابل `"success"`)
- `readonly-violation`: تعديل مباشر على ثابت كان يجب أن يكون `readonly`

ابدأ بالسبب الجذري ثم اشرح التأثير على الكود.

## المرجعية في المشروع
الملفات الرئيسية للمنطق المشترك:

- `src/extensions/classification-types.ts` — `ElementType` وثوابت التصنيف
- `src/constants/formats.ts` — تنسيقات عناصر السيناريو
- `src/types/final-review.ts` — Command API v2 contract (`AGENT_API_VERSION`, `CommandOp`)
- `server/controllers/final-review-controller.mjs` — تنفيذ الخادم

## نقطة البداية السريعة

1. حدد أي من المجالات الأربعة يحتاج مراجعة: Types أو Schemas أو Constants أو Clients.
2. اقرأ الملفين ذوي الصلة معاً ولا تعتمد على الذاكرة.
3. ابحث عن التعارضات بالنماذج الواردة في `تصنيف الأسباب الجذرية`.
4. ضع تقريراً يحدد الملف المرجعي (source of truth) والملفات التابعة.
5. شغّل `pnpm typecheck` و`pnpm test` للتحقق من غياب تعارضات.

## سير العمل

### المرحلة 1: تحديد النطاق

حدد أي من المجالات الأربعة يحتاج للمراجعة:

```
- [ ] الأنواع (Types)
- [ ] المخططات (Schemas)
- [ ] الثوابت (Constants)
- [ ] العملاء البرمجيين (Clients)
```

### المرحلة 2: فحص الاتساق

لكل مجال محدد، قم بالفحوصات التالية:

#### أ. الأنواع (Types)

**الملفات الرئيسية:**
- `src/extensions/classification-types.ts` — أنواع نظام التصنيف
- `src/types/screenplay.ts` — أنواع السيناريو الأساسية
- `src/types/final-review.ts` — عقد Command API v2
- `src/types/file-import.ts` — أنواع استيراد الملفات

**قائمة الفحص:**
- [ ] `ElementType` متطابق عبر جميع الملفات (10 أنواع بصيغة kebab-case)
- [ ] `LineType` في `screenplay.ts` يطابق `ElementType` في `classification-types.ts`
- [ ] جميع الأنواع المُصدّرة موثقة بـ JSDoc
- [ ] لا توجد أنواع `any` غير موثقة
- [ ] الأنواع المُهملة (`@deprecated`) موثقة مع البديل

**الأنواع الأساسية الواجب التحقق منها:**
```typescript
// يجب أن تكون متطابقة في جميع الملفات
type ElementType = 
  | "action"
  | "dialogue" 
  | "character"
  | "scene_header_1"
  | "scene_header_2"
  | "scene_header_3"
  | "scene_header_top_line"
  | "transition"
  | "parenthetical"
  | "basmala";
```

#### ب. المخططات (Schemas)

**الملفات الرئيسية:**
- `src/types/final-review.ts` — Command API v2 contract
- `server/controllers/final-review-controller.mjs` — تنفيذ الخادم

**قائمة الفحص:**
- [ ] `AGENT_API_VERSION` ثابت عبر Frontend/Backend
- [ ] `VALID_COMMAND_OPS` يطابق نوع `CommandOp`
- [ ] `VALID_AGENT_LINE_TYPES` يطابق `ElementType`
- [ ] `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS` محدّث مع جميع الأنواع
- [ ] جميع الـ interfaces لها `readonly` على الحقول المناسبة

**عقد API الواجب التحقق منه:**
```typescript
// يجب أن يكون ثابتاً
export const AGENT_API_VERSION = "2.0" as const;
export const AGENT_API_MODE = "auto-apply" as const;

// يجب أن يطابق ElementType
export const VALID_AGENT_LINE_TYPES = new Set<LineType>([...]);
```

#### ج. الثوابت (Constants)

**الملفات الرئيسية:**
- `src/constants/formats.ts` — تنسيقات عناصر السيناريو
- `src/constants/editor-format-styles.ts` — أنماط CSS
- `src/extensions/classification-types.ts` — ثوابت التصنيف

**قائمة الفحص:**
- [ ] `screenplayFormats` يحتوي على جميع الـ 10 أنواع
- [ ] `formatClassMap` مُولّد من `screenplayFormats`
- [ ] `formatShortcutMap` يطابق اختصارات `screenplayFormats`
- [ ] `VALID_ELEMENT_TYPES` يطابق `ElementType`
- [ ] جميع الثوابت المُصدّرة لها تعليقات JSDoc

**الثوابت الواجب التحقق منها:**
```typescript
// يجب أن يحتوي على جميع الأنواع العشرة
const VALID_ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  "action", "dialogue", "character",
  "scene_header_1", "scene_header_2", "scene_header_3",
  "scene_header_top_line", "transition", "parenthetical", "basmala"
]);
```

#### د. العملاء البرمجيين (Clients)

**الملفات الرئيسية:**
- `server/final-review.mjs` — عميل المراجعة النهائية
- `server/controllers/final-review-controller.mjs` — متحكم API

**قائمة الفحص:**
- [ ] دوال التحقق تستخدم الثوابت المشتركة
- [ ] معالجة الأخطاء متسقة عبر جميع العملاء
- [ ] الاستجابات تطابق `FinalReviewResponsePayload`
- [ ] جميع الـ endpoints توثق عقودها

### المرحلة 3: كشف التعارضات

ابحث عن هذه الأنماط الشائعة للتعارضات:

**تعارضات الأنواع:**
```typescript
// ❌ سيء: نوع مختلف في ملف آخر
// في ملف A
type ElementType = "action" | "dialogue" | ...;
// في ملف B  
type LineType = "Action" | "Dialogue" | ...; // حالة أحرف مختلفة!
```

**تعارضات الثوابت:**
```typescript
// ❌ سيء: قيم مختلفة لنفس المفهوم
// في ملف A
const API_VERSION = "2.0";
// في ملف B
const AGENT_VERSION = "2.1"; // نسخة مختلفة!
```

**تعارضات المخططات:**
```typescript
// ❌ سيء: عقد API غير متطابق
// Frontend يتوقع
interface Response { status: "success" | "error" }
// Backend يرسل
interface Response { status: "ok" | "fail" } // قيم مختلفة!
```

### المرحلة 4: التوثيق والإصلاح

عند اكتشاف تعارض:

1. **وثّق التعارض:**
   ```markdown
   ## تعارض: نوع العنصر غير متطابق
   
   **الموقع:** `src/types/screenplay.ts:39` vs `src/extensions/classification-types.ts:26`
   
   **المشكلة:** `LineType` يستخدم `"Scene_Header_1"` بينما `ElementType` يستخدم `"scene_header_1"`
   
   **التأثير:** فشل التصنيف عند استيراد الملفات
   
   **الحل المقترح:** توحيد جميع الأنواع على صيغة kebab-case
   ```

2. **اقترح الإصلاح:**
   - حدد الملف المرجعي (source of truth)
   - اقترح التعديلات المطلوبة
   - وضّح التأثير على الكود الموجود

3. **تحقق من الآثار الجانبية:**
   - ابحث عن جميع الاستخدامات للنوع/الثابت المتأثر
   - تحقق من التأثير على الاختبارات
   - راجع التأثير على API contracts

## أنماط شائعة للمراجعة

### نمط 1: إضافة نوع عنصر جديد

عند إضافة نوع عنصر سيناريو جديد:

```typescript
// 1. أضف إلى ElementType في classification-types.ts
export type ElementType = 
  | "action"
  | "new_element" // ← النوع الجديد
  | ...;

// 2. أضف إلى VALID_ELEMENT_TYPES
const VALID_ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  "action",
  "new_element", // ← النوع الجديد
  ...
]);

// 3. أضف إلى screenplayFormats في formats.ts
export const screenplayFormats: readonly ScreenplayFormat[] = [
  {
    id: "new_element",
    label: "العنصر الجديد",
    shortcut: "Ctrl+8",
    color: "bg-indigo-200/50 dark:bg-indigo-800/50",
    icon: "star"
  },
  ...
];

// 4. أضف إلى VALID_AGENT_LINE_TYPES في final-review.ts
export const VALID_AGENT_LINE_TYPES = new Set<LineType>([
  "action",
  "new_element", // ← النوع الجديد
  ...
]);

// 5. أضف إلى DEFAULT_FINAL_REVIEW_SCHEMA_HINTS
export const DEFAULT_FINAL_REVIEW_SCHEMA_HINTS = {
  allowedLineTypes: [
    "action",
    "new_element", // ← النوع الجديد
    ...
  ],
  lineTypeDescriptions: {
    action: "وصف الحدث والمشهد",
    new_element: "وصف العنصر الجديد", // ← الوصف
    ...
  },
  ...
};
```

### نمط 2: تحديث عقد API

عند تحديث Command API:

```typescript
// 1. حدّث الإصدار
export const AGENT_API_VERSION = "2.1" as const; // ← نسخة جديدة

// 2. أضف نوع الأمر الجديد
export type CommandOp = "relabel" | "split" | "merge"; // ← أمر جديد

// 3. حدّث VALID_COMMAND_OPS
export const VALID_COMMAND_OPS = new Set<CommandOp>([
  "relabel", "split", "merge" // ← أمر جديد
]);

// 4. أضف interface الأمر الجديد
export interface MergeCommand {
  readonly op: "merge";
  readonly itemIds: readonly string[];
  readonly mergedType: LineType;
  readonly confidence: number;
  readonly reason: string;
}

// 5. حدّث union type
export type AgentCommand = RelabelCommand | SplitCommand | MergeCommand;

// 6. حدّث التنفيذ في الخادم
// server/final-review.mjs
```

### نمط 3: مراجعة شاملة قبل النشر

قبل نشر إصدار جديد، قم بهذه الفحوصات:

```bash
# 1. تحقق من الأنواع
pnpm typecheck

# 2. شغّل الاختبارات
pnpm test
pnpm test:integration

# 3. تحقق من التنسيق
pnpm lint
pnpm format

# 4. راجع يدوياً:
# - جميع الأنواع موثقة
# - جميع الثوابت محدثة
# - جميع المخططات متطابقة
# - جميع العملاء يستخدم الثوابت المشتركة
```

## قائمة مرجعية شاملة

استخدم هذه القائمة لكل مراجعة:

### الأنواع (Types)
- [ ] `ElementType` متطابق في `classification-types.ts` و `screenplay.ts`
- [ ] جميع الأنواع موثقة بـ JSDoc
- [ ] لا توجد أنواع `any` غير موثقة
- [ ] الأنواع المُهملة موثقة مع البديل
- [ ] `isElementType()` يستخدم `VALID_ELEMENT_TYPES`

### المخططات (Schemas)
- [ ] `AGENT_API_VERSION` ثابت عبر Frontend/Backend
- [ ] `VALID_COMMAND_OPS` يطابق `CommandOp`
- [ ] `VALID_AGENT_LINE_TYPES` يطابق `ElementType`
- [ ] `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS` محدّث
- [ ] جميع الـ interfaces تستخدم `readonly`

### الثوابت (Constants)
- [ ] `screenplayFormats` يحتوي على جميع الأنواع
- [ ] `VALID_ELEMENT_TYPES` يطابق `ElementType`
- [ ] `formatClassMap` مُولّد من `screenplayFormats`
- [ ] `formatShortcutMap` يطابق اختصارات `screenplayFormats`
- [ ] جميع الثوابت موثقة

### العملاء البرمجيين (Clients)
- [ ] دوال التحقق تستخدم الثوابت المشتركة
- [ ] معالجة الأخطاء متسقة
- [ ] الاستجابات تطابق المخططات
- [ ] جميع الـ endpoints موثقة

### الاختبارات
- [ ] `pnpm typecheck` يمر بنجاح
- [ ] `pnpm test` يمر بنجاح
- [ ] `pnpm test:integration` يمر بنجاح
- [ ] `pnpm lint` بدون أخطاء

## قواعد التقرير

1. **الأنواع بصيغة snake_case فقط** — `scene_header_1` وليس `sceneHeader1`
2. **الثوابت دائماً `readonly`** — `ReadonlySet` و`readonly` arrays
3. **التوثيق إلزامي** — كل نوع/ثابت/interface يحتاج JSDoc
4. **لا تعديل مباشر على الثوابت** — استخدم دوال مساعدة للتحويل
5. **Command API v2 ثابت** — لا تغيّر `AGENT_API_VERSION` بدون تنسيق

## المراجع

- [references/types-reference.md](references/types-reference.md) — دليل شامل للأنواع المشتركة
- [references/constants-reference.md](references/constants-reference.md) — دليل الثوابت والتكوينات
- [references/api-contracts.md](references/api-contracts.md) — عقود API والمخططات

## أمثلة على التعارضات الشائعة

### مثال 1: تعارض في حالة الأحرف
```typescript
// ❌ خطأ
// في classification-types.ts
type ElementType = "scene_header_1";
// في formats.ts  
id: "sceneHeader1" // حالة أحرف مختلفة!

// ✅ صحيح
// في كلا الملفين
type ElementType = "scene_header_1";
id: "scene_header_1"
```

### مثال 2: تعارض في عدد الأنواع
```typescript
// ❌ خطأ
// في classification-types.ts (10 أنواع)
type ElementType = "action" | "dialogue" | ... (10 types)
// في VALID_ELEMENT_TYPES (9 أنواع فقط!)
const VALID_ELEMENT_TYPES = new Set([...]) // نسيت نوع!

// ✅ صحيح
// تأكد من تطابق العدد
type ElementType = ... (10 types)
const VALID_ELEMENT_TYPES = new Set<ElementType>([...]) // 10 types
```

### مثال 3: تعارض في عقد API
```typescript
// ❌ خطأ
// Frontend
interface Response { status: "applied" | "partial" }
// Backend
{ status: "success" } // قيمة غير متوقعة!

// ✅ صحيح
// استخدم نفس النوع
export type AgentResponseStatus = "applied" | "partial" | "skipped" | "error";
```
