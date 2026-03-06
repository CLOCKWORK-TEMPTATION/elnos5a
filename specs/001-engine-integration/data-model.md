# Data Model: دمج المحرك داخل التطبيق

**Date**: 2026-03-06
**Branch**: `001-engine-integration`

## الكيانات الجديدة

### KarankBridge

مدير عملية Python bridge — singleton في Backend.

| Field             | Type                      | Description                      |
| ----------------- | ------------------------- | -------------------------------- |
| `process`         | `ChildProcess \| null`    | العملية الجارية                  |
| `state`           | `BridgeState`             | حالة البريدج الحالية             |
| `enginePath`      | `string`                  | مسار `ts_bridge.py` داخل المشروع |
| `pendingRequests` | `Map<string, PendingReq>` | طلبات قيد الانتظار               |

```typescript
type BridgeState = "idle" | "starting" | "ready" | "dead" | "error";

interface PendingReq {
  resolve: (value: BridgeResponse) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}
```

**Lifecycle**:

```
idle → starting (spawn) → ready (ping ok) → ready (serving requests)
                                           → dead (process exit)
                                              → starting (single retry)
                                              → error (retry failed → final error)
```

### SchemaElement

ناتج المحرك — زوج عنصر/قيمة.

| Field     | Type     | Description                      |
| --------- | -------- | -------------------------------- |
| `element` | `string` | اسم العنصر (مثل `cene_header_1`) |
| `value`   | `string` | النص المرتبط                     |

### BridgeResponse

استجابة المحرك لطلب واحد.

| Field             | Type              | Description               |
| ----------------- | ----------------- | ------------------------- |
| `schema_text`     | `string`          | النص المهيكل بصيغة schema |
| `schema_elements` | `SchemaElement[]` | قائمة العناصر المحللة     |
| `raw_text`        | `string`          | النص الخام قبل التحليل    |

## الكيانات الموسّعة

### FileExtractionResult (إضافات)

| Field              | Type               | Added | Description                 |
| ------------------ | ------------------ | ----- | --------------------------- |
| `schemaText`       | `string?`          | new   | النص المهيكل من المحرك      |
| `schemaElements`   | `SchemaElement[]?` | new   | العناصر المحللة من المحرك   |
| `rawExtractedText` | `string?`          | new   | النص الخام قبل تحليل المحرك |

### ExtractionMethod (إضافة قيمة)

```typescript
// قبل:
type ExtractionMethod =
  | "native-text"
  | "mammoth"
  | "doc-converter-flow"
  | "ocr-mistral"
  | "backend-api"
  | "app-payload";

// بعد:
type ExtractionMethod =
  | "native-text"
  | "mammoth"
  | "doc-converter-flow"
  | "ocr-mistral"
  | "backend-api"
  | "app-payload"
  | "karank-engine-bridge";
```

### ClassificationMethod (إضافة قيمة)

```typescript
// قبل:
type ClassificationMethod = "regex" | "context" | "fallback" | "ml";

// بعد:
type ClassificationMethod =
  | "regex"
  | "context"
  | "fallback"
  | "ml"
  | "external-engine";
```

## Element Mapping Table

| Engine Output    | ElementType      | Valid |
| ---------------- | ---------------- | ----- |
| `cene_header_1`  | `scene_header_1` | yes   |
| `cene_header_2`  | `scene_header_2` | yes   |
| `scene_header_3` | `scene_header_3` | yes   |
| `ACTION`         | `action`         | yes   |
| `DIALOGUE`       | `dialogue`       | yes   |
| `CHARACTER`      | `character`      | yes   |
| `TRANSITION`     | `transition`     | yes   |
| `PARENTHETICAL`  | `parenthetical`  | yes   |
| `BASMALA`        | `basmala`        | yes   |
| anything else    | **reject**       | no    |

## العلاقات

```
FileExtractionResult ─── contains ──→ SchemaElement[] (0..*)
FileExtractionResult ─── uses ──→ ExtractionMethod ("karank-engine-bridge")

KarankBridge ─── manages ──→ Python process (ts_bridge.py)
KarankBridge ─── produces ──→ BridgeResponse

BridgeResponse ─── maps to ──→ FileExtractionResult fields

ClassifiedDraft ─── uses ──→ ClassificationMethod ("external-engine")
ClassifiedDraft ─── flows into ──→ PostClassificationReviewer (unchanged)
```
