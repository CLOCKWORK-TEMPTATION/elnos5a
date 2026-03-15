# عقود API والمخططات (API Contracts)

## نظرة عامة

هذا الدليل يوثق جميع عقود API في مشروع أفان تيتر، مع التركيز على Command API v2 والعقود المشتركة بين Frontend/Backend.

## Command API v2

### نظرة عامة

Command API v2 هو العقد الرئيسي للتواصل بين Frontend والـ AI Agent للمراجعة النهائية.

**Endpoint:** `POST /api/final-review`

**الإصدار:** `2.0`

**الوضع:** `auto-apply`

### عقد الطلب (Request Contract)

#### FinalReviewRequestPayload

الحمولة الكاملة للطلب.

```typescript
export interface FinalReviewRequestPayload {
  readonly packetVersion: string;        // إصدار الحزمة
  readonly schemaVersion: string;        // إصدار المخطط
  readonly importOpId: string;           // معرّف عملية الاستيراد
  readonly sessionId: string;            // معرّف الجلسة
  readonly totalReviewed: number;        // إجمالي الأسطر المراجعة
  readonly suspiciousLines: readonly FinalReviewSuspiciousLinePayload[];
  readonly requiredItemIds: readonly string[];  // معرّفات العناصر المطلوبة
  readonly forcedItemIds: readonly string[];    // معرّفات العناصر المُجبرة
  readonly schemaHints: FinalReviewSchemaHints;
  readonly reviewPacketText?: string;    // نص الحزمة (اختياري)
}
```

#### FinalReviewSuspiciousLinePayload

سطر مشبوه واحد في الطلب.

```typescript
export interface FinalReviewSuspiciousLinePayload {
  readonly itemId: string;                    // معرّف فريد للسطر
  readonly lineIndex: number;                 // رقم السطر
  readonly text: string;                      // نص السطر
  readonly assignedType: LineType;            // النوع المُعيّن حالياً
  readonly fingerprint: string;               // بصمة السطر
  readonly suspicionScore: number;            // سكور الشبهة (0-100)
  readonly routingBand: "agent-candidate" | "agent-forced";
  readonly critical: boolean;                 // هل السطر حرج؟
  readonly primarySuggestedType: LineType | null;
  readonly distinctSignalFamilies: number;    // عدد عائلات الإشارات
  readonly signalCount: number;               // عدد الإشارات
  readonly reasonCodes: readonly string[];    // أكواد الأسباب
  readonly signalMessages: readonly string[]; // رسائل الإشارات
  readonly sourceHints: FinalReviewSourceHintsPayload;
  readonly evidence: FinalReviewEvidencePayload;
  readonly trace: FinalReviewTraceSummary;
  readonly contextLines: readonly FinalReviewContextLine[];
}
```

#### FinalReviewSchemaHints

تلميحات المخطط للوكيل.

```typescript
export interface FinalReviewSchemaHints {
  readonly allowedLineTypes: readonly string[];
  readonly lineTypeDescriptions: Readonly<Record<string, string>>;
  readonly gateRules: readonly SchemaGateRule[];
}
```

**القيمة الافتراضية:**
```typescript
export const DEFAULT_FINAL_REVIEW_SCHEMA_HINTS = {
  allowedLineTypes: [
    "action", "dialogue", "character",
    "scene_header_1", "scene_header_2", "scene_header_3",
    "transition", "parenthetical", "basmala"
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
    basmala: "البسملة في بداية المستند"
  },
  gateRules: []
} as const;
```

### عقد الاستجابة (Response Contract)

#### FinalReviewResponsePayload

الحمولة الكاملة للاستجابة.

```typescript
export interface FinalReviewResponsePayload {
  readonly apiVersion: typeof AGENT_API_VERSION;  // "2.0"
  readonly mode: typeof AGENT_API_MODE;           // "auto-apply"
  readonly importOpId: string;                    // معرّف عملية الاستيراد
  readonly requestId: string;                     // معرّف الطلب (UUID)
  readonly status: AgentResponseStatus;           // حالة الاستجابة
  readonly commands: readonly AgentCommand[];     // الأوامر المُرجعة
  readonly message: string;                       // رسالة توضيحية
  readonly latencyMs: number;                     // زمن الاستجابة بالميلي ثانية
  readonly meta?: FinalReviewResponseMeta;        // معلومات إضافية
  readonly model?: string;                        // اسم النموذج المستخدم
}
```

#### AgentResponseStatus

حالة الاستجابة.

```typescript
export type AgentResponseStatus = 
  | "applied"   // تم التطبيق بنجاح
  | "partial"   // تطبيق جزئي
  | "skipped"   // تم التخطي
  | "error";    // خطأ
```

#### AgentCommand

اتحاد أوامر الوكيل.

```typescript
export type AgentCommand = RelabelCommand | SplitCommand;
```

**RelabelCommand** — إعادة تسمية نوع السطر:
```typescript
export interface RelabelCommand {
  readonly op: "relabel";
  readonly itemId: string;      // معرّف السطر
  readonly newType: LineType;   // النوع الجديد
  readonly confidence: number;  // الثقة (0-1)
  readonly reason: string;      // سبب التغيير
}
```

**SplitCommand** — تقسيم السطر:
```typescript
export interface SplitCommand {
  readonly op: "split";
  readonly itemId: string;      // معرّف السطر
  readonly splitAt: number;     // موضع التقسيم
  readonly leftType: LineType;  // نوع الجزء الأيسر
  readonly rightType: LineType; // نوع الجزء الأيمن
  readonly confidence: number;  // الثقة (0-1)
  readonly reason: string;      // سبب التقسيم
}
```

### مثال على الطلب

```json
{
  "packetVersion": "1.0",
  "schemaVersion": "2.0",
  "importOpId": "import-123",
  "sessionId": "session-456",
  "totalReviewed": 100,
  "suspiciousLines": [
    {
      "itemId": "line-1",
      "lineIndex": 5,
      "text": "محمد يدخل الغرفة",
      "assignedType": "action",
      "fingerprint": "abc123",
      "suspicionScore": 85,
      "routingBand": "agent-candidate",
      "critical": false,
      "primarySuggestedType": "character",
      "distinctSignalFamilies": 2,
      "signalCount": 3,
      "reasonCodes": ["name-pattern", "context-mismatch"],
      "signalMessages": ["يبدو كاسم شخصية", "لا يتطابق مع السياق"],
      "sourceHints": {
        "importSource": "pdf",
        "lineQualityScore": 0.9,
        "arabicRatio": 1.0,
        "weirdCharRatio": 0.0,
        "hasStructuralMarkers": false,
        "pageNumber": 1
      },
      "evidence": {
        "gateBreaks": [],
        "alternativePulls": [],
        "contextContradictions": [],
        "rawCorruptionSignals": [],
        "multiPassConflicts": [],
        "sourceRisks": []
      },
      "trace": {
        "passVotes": [],
        "repairs": [],
        "finalDecision": {
          "assignedType": "action",
          "confidence": 0.7,
          "method": "regex"
        }
      },
      "contextLines": [
        {
          "lineIndex": 4,
          "text": "داخلي - منزل - نهاراً",
          "assignedType": "scene_header_1",
          "offset": -1
        }
      ]
    }
  ],
  "requiredItemIds": ["line-1"],
  "forcedItemIds": [],
  "schemaHints": {
    "allowedLineTypes": ["action", "dialogue", "character"],
    "lineTypeDescriptions": {
      "action": "وصف الحدث والمشهد",
      "dialogue": "نص الحوار المنطوق",
      "character": "اسم الشخصية فوق الحوار"
    },
    "gateRules": []
  }
}
```

### مثال على الاستجابة

```json
{
  "apiVersion": "2.0",
  "mode": "auto-apply",
  "importOpId": "import-123",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "applied",
  "commands": [
    {
      "op": "relabel",
      "itemId": "line-1",
      "newType": "character",
      "confidence": 0.95,
      "reason": "السطر يحتوي على اسم شخصية واضح"
    }
  ],
  "message": "تم تطبيق أمر واحد بنجاح",
  "latencyMs": 1250,
  "meta": {
    "totalInputTokens": 500,
    "totalOutputTokens": 100,
    "retryCount": 0,
    "resolvedItemIds": ["line-1"],
    "missingItemIds": [],
    "isMockResponse": false
  },
  "model": "claude-3-5-haiku-20241022"
}
```

## عقود أخرى

### استيراد الملفات

**Endpoint:** `POST /api/file-extract`

**الطلب:**
```typescript
interface FileExtractRequest {
  file: File;           // الملف المُراد استخراجه
  fileType: FileType;   // نوع الملف
}
```

**الاستجابة:**
```typescript
interface FileExtractResponse {
  success: boolean;
  text?: string;        // النص المُستخرج
  error?: string;       // رسالة الخطأ
}
```

### تصدير PDF

**Endpoint:** `POST /api/export/pdfa`

**الطلب:**
```typescript
interface PdfExportRequest {
  html: string;         // محتوى HTML
  filename: string;     // اسم الملف
}
```

**الاستجابة:**
```typescript
// Binary PDF data
```

## قواعد الاتساق

### 1. الإصدارات

**يجب** أن تكون هذه الإصدارات متطابقة:
- `AGENT_API_VERSION` في Frontend
- `apiVersion` في Backend response
- `schemaVersion` في Request payload

### 2. الأنواع الصالحة

**يجب** أن تكون هذه الأنواع متطابقة:
- `VALID_AGENT_LINE_TYPES` في Frontend
- `allowedLineTypes` في `schemaHints`
- الأنواع المقبولة في Backend

### 3. عمليات الأوامر

**يجب** أن تكون هذه العمليات متطابقة:
- `VALID_COMMAND_OPS` في Frontend
- `CommandOp` type
- العمليات المدعومة في Backend

### 4. حالات الاستجابة

**يجب** أن تكون هذه الحالات متطابقة:
- `AgentResponseStatus` type
- الحالات المُرجعة من Backend
- معالجة الحالات في Frontend

## أنماط التحقق

### التحقق من الطلب

```typescript
import { 
  VALID_AGENT_LINE_TYPES,
  DEFAULT_FINAL_REVIEW_SCHEMA_HINTS 
} from "@/types/final-review";

function validateRequest(payload: FinalReviewRequestPayload): boolean {
  // تحقق من الإصدار
  if (payload.schemaVersion !== "2.0") {
    return false;
  }
  
  // تحقق من الأنواع
  for (const line of payload.suspiciousLines) {
    if (!VALID_AGENT_LINE_TYPES.has(line.assignedType)) {
      return false;
    }
  }
  
  return true;
}
```

### التحقق من الاستجابة

```typescript
import { VALID_COMMAND_OPS } from "@/types/final-review";

function validateResponse(response: FinalReviewResponsePayload): boolean {
  // تحقق من الإصدار
  if (response.apiVersion !== "2.0") {
    return false;
  }
  
  // تحقق من الأوامر
  for (const command of response.commands) {
    if (!VALID_COMMAND_OPS.has(command.op)) {
      return false;
    }
  }
  
  return true;
}
```

### معالجة الأوامر

```typescript
function applyCommands(commands: readonly AgentCommand[]): void {
  for (const command of commands) {
    switch (command.op) {
      case "relabel":
        applyRelabel(command);
        break;
      case "split":
        applySplit(command);
        break;
      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = command;
        throw new Error(`Unknown command: ${_exhaustive}`);
    }
  }
}
```

## معالجة الأخطاء

### أخطاء التحقق

```typescript
export class FinalReviewValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "FinalReviewValidationError";
  }
}
```

### أخطاء الخادم

```typescript
// في حالة الخطأ، يُرجع Backend:
{
  "apiVersion": "2.0",
  "mode": "auto-apply",
  "importOpId": "import-123",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "error",
  "commands": [],
  "message": "رسالة الخطأ التفصيلية",
  "latencyMs": 0
}
```

## قائمة فحص التحقق

عند تحديث عقد API:

- [ ] الإصدار محدّث في Frontend/Backend
- [ ] الأنواع الصالحة محدثة
- [ ] العمليات الصالحة محدثة
- [ ] التوثيق محدّث
- [ ] الاختبارات محدثة
- [ ] معالجة الأخطاء محدثة
- [ ] `pnpm typecheck` يمر بنجاح
- [ ] `pnpm test:integration` يمر بنجاح
