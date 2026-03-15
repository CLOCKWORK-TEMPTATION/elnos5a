# دليل الأنواع المشتركة (Types Reference)

## نظرة عامة

هذا الدليل يوثق جميع الأنواع المشتركة في مشروع أفان تيتر، مع التركيز على الاتساق والتطابق عبر Frontend/Backend.

## الأنواع الأساسية

### ElementType / LineType

النوع الأساسي لعناصر السيناريو — **يجب أن يكون متطابقاً** في جميع الملفات.

**الموقع الرئيسي:** `src/extensions/classification-types.ts`

```typescript
export type ElementType =
  | "action"              // وصف الحدث والمشهد
  | "dialogue"            // نص الحوار المنطوق
  | "character"           // اسم الشخصية فوق الحوار
  | "scene_header_1"      // رأس المشهد الرئيسي
  | "scene_header_2"      // رأس المشهد الفرعي
  | "scene_header_3"      // وصف زمني أو مكاني للمشهد
  | "scene_header_top_line" // سطر فوقي للمشهد
  | "transition"          // انتقال بين المشاهد
  | "parenthetical"       // توجيه أدائي بين قوسين
  | "basmala";            // البسملة في بداية المستند
```

**المواقع الأخرى:**
- `src/types/screenplay.ts` — `LineType` (يجب أن يطابق `ElementType`)
- `src/types/final-review.ts` — مستخدم في `VALID_AGENT_LINE_TYPES`
- `src/constants/formats.ts` — `ScreenplayFormatId`

**قاعدة التسمية:** kebab-case فقط (مثل `scene_header_1` وليس `sceneHeader1`)

### ClassificationMethod

طريقة التصنيف المستخدمة لتحديد نوع السطر.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export type ClassificationMethod =
  | "regex"            // تطابق مباشر مع نمط regex (أعلى ثقة)
  | "context"          // استنتاج من سياق الأسطر السابقة
  | "fallback"         // قيمة افتراضية عند فشل القواعد الأخرى
  | "ml"               // تصحيح من مراجعة AI
  | "external-engine"; // من محرك خارجي
```

### ClassificationSourceProfile

مصدر/بروفايل تدفق التصنيف.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export type ClassificationSourceProfile = 
  | "paste"         // لصق مباشر من المستخدم
  | "generic-open"; // فتح/إدراج ملف عام
```

## الواجهات الأساسية (Core Interfaces)

### ClassifiedLine

سطر مُصنّف — نتيجة نهائية لتصنيف سطر واحد.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export interface ClassifiedLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly assignedType: ElementType;
  readonly originalConfidence: number;
  readonly classificationMethod: ClassificationMethod;
  readonly sourceHintType?: ElementType;
  readonly sourceProfile?: ClassificationSourceProfile;
}
```

**الاستخدام:**
- في نظام التصنيف الأساسي
- في محرك الشبهة (Suspicion Engine)
- في المراجعة النهائية (Final Review)

### ClassifiedDraft

مسودة تصنيف — نتيجة أولية قبل المراجعة.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export interface ClassifiedDraft {
  readonly type: ElementType;
  readonly text: string;
  readonly header1?: string;      // فقط لـ scene_header_top_line
  readonly header2?: string;      // فقط لـ scene_header_top_line
  readonly confidence: number;
  readonly classificationMethod: ClassificationMethod;
  readonly sourceHintType?: ElementType;
  readonly sourceProfile?: ClassificationSourceProfile;
}
```

**ملاحظة:** `header1`/`header2` تُملأ فقط لعُقد `scene_header_top_line`.

### ClassificationContext

سياق التصنيف — يُمرَّر لكل دالة تصنيف.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export interface ClassificationContext {
  readonly previousTypes: readonly ElementType[];  // آخر 6 أنواع
  readonly previousType: ElementType | null;       // النوع السابق مباشرة
  readonly isInDialogueBlock: boolean;             // داخل كتلة حوار؟
  readonly isAfterSceneHeaderTopLine: boolean;     // بعد رأس مشهد علوي؟
}
```

## أنواع محرك الشبهة (Suspicion Engine Types)

### DetectorFinding

نتيجة كاشف شبهة واحد.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export interface DetectorFinding {
  readonly detectorId: string;
  readonly suspicionScore: number;      // 0-100
  readonly reason: string;
  readonly suggestedType: ElementType | null;
}
```

### SuspicionRoutingBand

مسار التصفية النهائي للسطر.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export type SuspicionRoutingBand =
  | "pass"              // يمر بدون تدخل
  | "local-review"      // تصحيح محلي فقط
  | "agent-candidate"   // مرشح للتصعيد للوكيل
  | "agent-forced";     // تصعيد إلزامي للوكيل
```

### SuspiciousLine

سطر مشبوه — يجمع كل نتائج الكواشف.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export interface SuspiciousLine {
  readonly line: ClassifiedLine;
  readonly totalSuspicion: number;
  readonly findings: readonly DetectorFinding[];
  readonly contextLines: readonly ClassifiedLine[];
  readonly routingBand: SuspicionRoutingBand;
  readonly escalationScore: number;
  readonly distinctDetectors: number;
  readonly criticalMismatch: boolean;
  readonly breakdown: SuspicionScoreBreakdown;
}
```

## أنواع Command API v2

### CommandOp

نوع عملية الأمر.

**الموقع:** `src/types/final-review.ts`

```typescript
export type CommandOp = "relabel" | "split";
```

**الثابت المرتبط:**
```typescript
export const VALID_COMMAND_OPS = new Set<CommandOp>(["relabel", "split"]);
```

### AgentCommand

اتحاد أوامر الوكيل.

**الموقع:** `src/types/final-review.ts`

```typescript
export type AgentCommand = RelabelCommand | SplitCommand;

export interface RelabelCommand {
  readonly op: "relabel";
  readonly itemId: string;
  readonly newType: LineType;
  readonly confidence: number;
  readonly reason: string;
}

export interface SplitCommand {
  readonly op: "split";
  readonly itemId: string;
  readonly splitAt: number;
  readonly leftType: LineType;
  readonly rightType: LineType;
  readonly confidence: number;
  readonly reason: string;
}
```

### AgentResponseStatus

حالة استجابة الوكيل.

**الموقع:** `src/types/final-review.ts`

```typescript
export type AgentResponseStatus = 
  | "applied"   // تم التطبيق بنجاح
  | "partial"   // تطبيق جزئي
  | "skipped"   // تم التخطي
  | "error";    // خطأ
```

## أنواع إحصائيات المستند

### DocumentStats

إحصائيات المستند — تُحسب في الوقت الفعلي.

**الموقع:** `src/types/screenplay.ts`

```typescript
export interface DocumentStats {
  words: number;       // عدد الكلمات
  characters: number;  // عدد الحروف (بدون مسافات)
  pages: number;       // عدد صفحات A4
  scenes: number;      // عدد المشاهد
}
```

## أنواع الملفات

### FileType

صيغ الاستيراد/التصدير المدعومة.

**الموقع:** `src/types/screenplay.ts`

```typescript
export type FileType = 
  | "fountain"  // صيغة Fountain
  | "fdx"       // Final Draft XML
  | "pdf"       // PDF
  | "docx"      // Microsoft Word
  | "txt"       // نص عادي
  | "html";     // HTML
```

## دوال حراسة الأنواع (Type Guards)

### isElementType

يتحقق إذا كانت السلسلة نوع عنصر صالح.

**الموقع:** `src/extensions/classification-types.ts`

```typescript
export function isElementType(value: string): value is ElementType {
  return VALID_ELEMENT_TYPES.has(value);
}
```

**الاستخدام:**
```typescript
const type = "action";
if (isElementType(type)) {
  // type هنا من نوع ElementType
  console.log(type); // ✅ آمن
}
```

## الأنواع المُهملة (Deprecated)

### LegacyElementType

**الموقع:** `src/extensions/classification-types.ts`

```typescript
/**
 * @deprecated استخدم ElementType مباشرة — الأنواع موحدة الآن بصيغة kebab-case.
 */
export type LegacyElementType = ElementType;
```

**دوال التحويل المُهملة:**
```typescript
/**
 * @deprecated الأنواع موحدة الآن — هذه الدالة تعيد القيمة كما هي.
 */
export function fromLegacyElementType(value: string): ElementType | null {
  if (isElementType(value)) return value;
  return null;
}

/**
 * @deprecated الأنواع موحدة الآن — هذه الدالة تعيد القيمة كما هي.
 */
export function toLegacyElementType(value: ElementType): ElementType {
  return value;
}
```

## قواعد الاتساق

### 1. تطابق الأنواع

**يجب** أن تكون هذه الأنواع متطابقة:
- `ElementType` في `classification-types.ts`
- `LineType` في `screenplay.ts`
- `ScreenplayFormatId` في `formats.ts`

### 2. صيغة التسمية

**جميع** أنواع العناصر تستخدم kebab-case:
- ✅ `scene_header_1`
- ❌ `sceneHeader1`
- ❌ `SceneHeader1`

### 3. الثوابت المرتبطة

**يجب** تحديث هذه الثوابت عند تغيير `ElementType`:
- `VALID_ELEMENT_TYPES` في `classification-types.ts`
- `VALID_AGENT_LINE_TYPES` في `final-review.ts`
- `screenplayFormats` في `formats.ts`
- `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS.allowedLineTypes`

### 4. التوثيق

**جميع** الأنواع والواجهات يجب أن تحتوي على:
- تعليق JSDoc
- وصف الغرض
- أمثلة إذا لزم الأمر
- إشارة `@deprecated` للأنواع المُهملة

## أمثلة على الاستخدام الصحيح

### مثال 1: استخدام ElementType

```typescript
import type { ElementType } from "@/extensions/classification-types";
import { isElementType } from "@/extensions/classification-types";

function processLine(type: ElementType, text: string) {
  // ✅ استخدام آمن للنوع
  console.log(`Processing ${type}: ${text}`);
}

function validateType(value: string): ElementType | null {
  // ✅ استخدام حارس النوع
  if (isElementType(value)) {
    return value;
  }
  return null;
}
```

### مثال 2: استخدام ClassifiedLine

```typescript
import type { ClassifiedLine, ElementType } from "@/extensions/classification-types";

function analyzeLines(lines: readonly ClassifiedLine[]): Map<ElementType, number> {
  const counts = new Map<ElementType, number>();
  
  for (const line of lines) {
    const current = counts.get(line.assignedType) ?? 0;
    counts.set(line.assignedType, current + 1);
  }
  
  return counts;
}
```

### مثال 3: استخدام AgentCommand

```typescript
import type { AgentCommand, RelabelCommand } from "@/types/final-review";

function applyCommand(command: AgentCommand): void {
  switch (command.op) {
    case "relabel":
      // ✅ TypeScript يعرف أن command هنا RelabelCommand
      console.log(`Relabeling to ${command.newType}`);
      break;
    case "split":
      // ✅ TypeScript يعرف أن command هنا SplitCommand
      console.log(`Splitting at ${command.splitAt}`);
      break;
  }
}
```

## قائمة فحص التحقق

عند إضافة أو تعديل نوع:

- [ ] النوع موثق بـ JSDoc
- [ ] النوع مُصدّر من الملف الصحيح
- [ ] النوع متطابق عبر جميع الملفات المرتبطة
- [ ] الثوابت المرتبطة محدثة
- [ ] حارس النوع محدث (إذا لزم الأمر)
- [ ] الاختبارات محدثة
- [ ] `pnpm typecheck` يمر بنجاح
