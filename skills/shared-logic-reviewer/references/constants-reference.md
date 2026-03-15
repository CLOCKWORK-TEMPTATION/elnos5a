# دليل الثوابت والتكوينات (Constants Reference)

## نظرة عامة

هذا الدليل يوثق جميع الثوابت المشتركة في مشروع أفان تيتر، مع التركيز على الاتساق والتطابق.

## ثوابت التصنيف (Classification Constants)

### VALID_ELEMENT_TYPES

مجموعة جميع أنواع العناصر الصالحة.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
const VALID_ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "scene_header_top_line",
  "transition",
  "parenthetical",
  "basmala",
]);
```

**الاستخدام:**
- في `isElementType()` للتحقق من صحة النوع
- في التحقق من صحة المدخلات
- في الاختبارات

**قاعدة:** يجب أن يحتوي على **جميع** أعضاء `ElementType` (10 أنواع).

## ثوابت Command API

### AGENT_API_VERSION

إصدار Command API الحالي.

**الموقع:** `src/types/final-review.ts`

```typescript
export const AGENT_API_VERSION = "2.0" as const;
```

**قاعدة:** **لا تغيّر** هذا الثابت بدون تنسيق مع فريق Backend.

### AGENT_API_MODE

وضع تشغيل Command API.

**الموقع:** `src/types/final-review.ts`

```typescript
export const AGENT_API_MODE = "auto-apply" as const;
```

**الأوضاع المدعومة:**
- `"auto-apply"` — تطبيق تلقائي للأوامر

### VALID_COMMAND_OPS

عمليات الأوامر الصالحة.

**الموقع:** `src/types/final-review.ts`

```typescript
export const VALID_COMMAND_OPS = new Set<CommandOp>(["relabel", "split"]);
```

**قاعدة:** يجب أن يطابق جميع أعضاء `CommandOp`.

### VALID_AGENT_LINE_TYPES

أنواع الأسطر الصالحة في Command API.

**الموقع:** `src/types/final-review.ts`

```typescript
export const VALID_AGENT_LINE_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_top_line",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);
```

**قاعدة:** يجب أن يطابق `VALID_ELEMENT_TYPES`.

### ALLOWED_LINE_TYPES

أنواع الأسطر المسموحة في المراجعة النهائية.

**الموقع:** `src/types/final-review.ts`

```typescript
export const ALLOWED_LINE_TYPES = new Set<LineType>([
  "action",
  "dialogue",
  "character",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "transition",
  "parenthetical",
  "basmala",
]);
```

**ملاحظة:** لا يحتوي على `scene_header_top_line` (9 أنواع فقط).

## ثوابت التنسيقات (Format Constants)

### screenplayFormats

مصفوفة التنسيقات العشرة الكاملة.

**الموقع:** `src/constants/formats.ts`

```typescript
export const screenplayFormats: readonly ScreenplayFormat[] = [
  {
    id: "basmala",
    label: "بسملة",
    shortcut: "",
    color: "bg-purple-200/50 dark:bg-purple-800/50",
    icon: "book-heart",
  },
  {
    id: "scene_header_top_line",
    label: "عنوان المشهد (سطر علوي)",
    shortcut: "",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: "separator-horizontal",
  },
  {
    id: "scene_header_1",
    label: "عنوان المشهد (1)",
    shortcut: "Ctrl+1",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: "film",
  },
  {
    id: "scene_header_2",
    label: "عنوان المشهد (2)",
    shortcut: "Tab",
    color: "bg-sky-200/50 dark:bg-sky-800/50",
    icon: "map-pin",
  },
  {
    id: "scene_header_3",
    label: "عنوان المشهد (3)",
    shortcut: "Tab",
    color: "bg-cyan-200/50 dark:bg-cyan-800/50",
    icon: "camera",
  },
  {
    id: "action",
    label: "الفعل/الحدث",
    shortcut: "Ctrl+4",
    color: "bg-gray-200/50 dark:bg-gray-700/50",
    icon: "feather",
  },
  {
    id: "character",
    label: "شخصية",
    shortcut: "Ctrl+2",
    color: "bg-green-200/50 dark:bg-green-800/50",
    icon: "user-square",
  },
  {
    id: "parenthetical",
    label: "بين قوسين",
    shortcut: "Tab",
    color: "bg-yellow-200/50 dark:bg-yellow-800/50",
    icon: "parentheses",
  },
  {
    id: "dialogue",
    label: "حوار",
    shortcut: "Ctrl+3",
    color: "bg-orange-200/50 dark:bg-orange-800/50",
    icon: "message-circle",
  },
  {
    id: "transition",
    label: "انتقال",
    shortcut: "Ctrl+6",
    color: "bg-red-200/50 dark:bg-red-800/50",
    icon: "fast-forward",
  },
];
```

**قاعدة:** يجب أن يحتوي على **جميع** الأنواع العشرة بنفس ترتيب `ElementType`.

### formatClassMap

خريطة معرّف التنسيق → اسم صنف CSS.

**الموقع:** `src/constants/formats.ts`

```typescript
export const formatClassMap: Record<string, string> = screenplayFormats.reduce<
  Record<string, string>
>((acc, format) => {
  acc[format.id] = `format-${format.id}`;
  return acc;
}, {});
```

**مثال:**
```typescript
formatClassMap["action"] === "format-action"
formatClassMap["dialogue"] === "format-dialogue"
```

**قاعدة:** **لا تعدل يدوياً** — يُولّد تلقائياً من `screenplayFormats`.

### formatShortcutMap

خريطة اختصارات لوحة المفاتيح.

**الموقع:** `src/constants/formats.ts`

```typescript
export const formatShortcutMap: Record<string, string> = {
  "1": "scene_header_1",
  "2": "character",
  "3": "dialogue",
  "4": "action",
  "6": "transition",
};
```

**الاختصارات:**
- `Ctrl+1` → `scene_header_1`
- `Ctrl+2` → `character`
- `Ctrl+3` → `dialogue`
- `Ctrl+4` → `action`
- `Ctrl+6` → `transition`

**قاعدة:** يجب أن يطابق `shortcut` في `screenplayFormats`.

### classificationTypeOptions

خيارات أنواع التصنيف في واجهة المستخدم.

**الموقع:** `src/constants/formats.ts`

```typescript
export const classificationTypeOptions = [
  { value: "action", label: "حركة (Action)" },
  { value: "dialogue", label: "حوار (Dialogue)" },
  { value: "character", label: "شخصية (Character)" },
  { value: "scene_header_1", label: "عنوان مشهد - مستوى 1" },
  { value: "scene_header_2", label: "عنوان مشهد - مستوى 2" },
  { value: "scene_header_3", label: "عنوان مشهد - مستوى 3" },
  { value: "transition", label: "انتقال (Transition)" },
  { value: "parenthetical", label: "توصيف (Parenthetical)" },
] as const;
```

**ملاحظة:** يحتوي على 8 أنواع فقط (بدون `basmala` و `scene_header_top_line`).

## ثوابت المخططات (Schema Constants)

### DEFAULT_FINAL_REVIEW_SCHEMA_HINTS

تلميحات المخطط الافتراضية للمراجعة النهائية.

**الموقع:** `src/types/final-review.ts`

```typescript
export const DEFAULT_FINAL_REVIEW_SCHEMA_HINTS = {
  allowedLineTypes: [
    "action",
    "dialogue",
    "character",
    "scene_header_1",
    "scene_header_2",
    "scene_header_3",
    "transition",
    "parenthetical",
    "basmala",
  ],
  lineTypeDescriptions: {
    action: "وصف الحدث والمشهد",
    dialogue: "نص الحوار المنطوق",
    character: "اسم الشخصية فوق الحوار",
    scene_header_1: "رأس المشهد الرئيسي",
    scene_header_2: "رأس المشهد الفرعي",
    scene_header_3: "وصف زمني أو مكاني للمشهد",
    transition: "انتقال بين المشاهد",
    parenthetical: "توجيه أدائي بين قوسين",
    basmala: "البسملة في بداية المستند",
  },
  gateRules: [],
} as const satisfies FinalReviewSchemaHints;
```

**قاعدة:** يجب تحديث `lineTypeDescriptions` عند إضافة نوع جديد.

## قواعد الاتساق

### 1. تطابق الثوابت

**يجب** أن تكون هذه الثوابت متطابقة:
- `VALID_ELEMENT_TYPES` (10 أنواع)
- `VALID_AGENT_LINE_TYPES` (10 أنواع)
- `screenplayFormats.length` (10 عناصر)

### 2. التوليد التلقائي

**لا تعدل يدوياً:**
- `formatClassMap` — يُولّد من `screenplayFormats`

**عدّل المصدر بدلاً من ذلك:**
- لتغيير `formatClassMap`، عدّل `screenplayFormats`

### 3. التزامن

عند إضافة نوع عنصر جديد، **يجب** تحديث:
1. `VALID_ELEMENT_TYPES`
2. `VALID_AGENT_LINE_TYPES`
3. `screenplayFormats`
4. `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS.allowedLineTypes`
5. `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS.lineTypeDescriptions`

### 4. الثبات

**لا تغيّر:**
- `AGENT_API_VERSION` (بدون تنسيق)
- `AGENT_API_MODE` (بدون تنسيق)

## أمثلة على الاستخدام الصحيح

### مثال 1: استخدام VALID_ELEMENT_TYPES

```typescript
import { VALID_ELEMENT_TYPES, isElementType } from "@/extensions/classification-types";

function validateElementType(value: string): boolean {
  // ✅ استخدام الثابت المشترك
  return isElementType(value);
}

function getAllElementTypes(): string[] {
  // ✅ استخدام الثابت المشترك
  return Array.from(VALID_ELEMENT_TYPES);
}
```

### مثال 2: استخدام screenplayFormats

```typescript
import { screenplayFormats, formatClassMap } from "@/constants/formats";

function getFormatLabel(id: string): string | undefined {
  // ✅ البحث في المصفوفة
  return screenplayFormats.find(f => f.id === id)?.label;
}

function getFormatClass(id: string): string {
  // ✅ استخدام الخريطة المُولّدة
  return formatClassMap[id] ?? "format-default";
}
```

### مثال 3: استخدام VALID_COMMAND_OPS

```typescript
import { VALID_COMMAND_OPS, type CommandOp } from "@/types/final-review";

function isValidCommandOp(value: string): value is CommandOp {
  // ✅ استخدام الثابت المشترك
  return VALID_COMMAND_OPS.has(value as CommandOp);
}
```

## أنماط خاطئة شائعة

### ❌ خطأ 1: تعريف ثابت محلي

```typescript
// ❌ سيء: تعريف محلي بدلاً من استخدام الثابت المشترك
const ELEMENT_TYPES = ["action", "dialogue", "character"];

// ✅ جيد: استخدام الثابت المشترك
import { VALID_ELEMENT_TYPES } from "@/extensions/classification-types";
```

### ❌ خطأ 2: تعديل يدوي للخريطة المُولّدة

```typescript
// ❌ سيء: تعديل يدوي
formatClassMap["new_element"] = "format-new-element";

// ✅ جيد: تحديث المصدر
screenplayFormats.push({
  id: "new_element",
  label: "عنصر جديد",
  shortcut: "",
  color: "bg-indigo-200/50 dark:bg-indigo-800/50",
  icon: "star"
});
// formatClassMap سيُحدّث تلقائياً
```

### ❌ خطأ 3: عدم تحديث جميع الثوابت المرتبطة

```typescript
// ❌ سيء: تحديث VALID_ELEMENT_TYPES فقط
const VALID_ELEMENT_TYPES = new Set([
  "action", "dialogue", "new_element" // ← نوع جديد
]);
// نسيت تحديث VALID_AGENT_LINE_TYPES!

// ✅ جيد: تحديث جميع الثوابت المرتبطة
const VALID_ELEMENT_TYPES = new Set([...]);
const VALID_AGENT_LINE_TYPES = new Set([...]); // ← محدّث
screenplayFormats.push({...}); // ← محدّث
DEFAULT_FINAL_REVIEW_SCHEMA_HINTS.allowedLineTypes.push(...); // ← محدّث
```

## قائمة فحص التحقق

عند إضافة أو تعديل ثابت:

- [ ] الثابت موثق بـ JSDoc
- [ ] الثابت مُصدّر من الملف الصحيح
- [ ] الثابت يستخدم `readonly` أو `as const`
- [ ] الثوابت المرتبطة محدثة
- [ ] الاختبارات محدثة
- [ ] `pnpm typecheck` يمر بنجاح
- [ ] `pnpm test` يمر بنجاح

## جدول الثوابت المرتبطة

| الثابت | الموقع | المرتبط بـ | العدد |
|--------|--------|-----------|-------|
| `VALID_ELEMENT_TYPES` | `classification-types.ts` | `ElementType` | 10 |
| `VALID_AGENT_LINE_TYPES` | `final-review.ts` | `LineType` | 10 |
| `screenplayFormats` | `formats.ts` | `ScreenplayFormatId` | 10 |
| `ALLOWED_LINE_TYPES` | `final-review.ts` | `LineType` | 9 |
| `classificationTypeOptions` | `formats.ts` | `ElementType` | 8 |
| `VALID_COMMAND_OPS` | `final-review.ts` | `CommandOp` | 2 |

**ملاحظة:** العدد يجب أن يتطابق مع عدد أعضاء النوع المرتبط.
