# Data Model: توحيد مراحل الاستقبال

This document outlines the data structures required to unify the reception pipeline. No net-new database tables are required, as this feature operates entirely in-memory and over the API boundary.

## 1. Unified Engine Response (الاستجابة الموحّدة)

This is the payload returned by the shared backend service (`/api/text-extract` or equivalent) after Karank HMM processing. It must be identical for all three input paths.

```typescript
export interface UnifiedReceptionResponse {
  /** The final reconstructed text from the document/paste */
  rawText: string;

  /** The sequence of blocks/lines extracted and normalized */
  elements: Array<{
    id: string; // Used for traceability in Suspicion/Review layers
    originalText: string;
    normalizedText: string;
    suggestedType?: ElementType; // Optional preliminary hint from Karank
    metadata?: Record<string, any>;
  }>;

  /** Metadata about the extraction process itself */
  extractionMeta: {
    sourceType: "paste" | "doc" | "docx";
    processingTimeMs: number;
    success: boolean;
    error?: string;
  };
}
```

## 2. Telemetry Event (سجل الأحداث)

To satisfy `FR-017` and `SC-010`, we need a structured log format for tracking pipeline stages.

```typescript
export interface PipelineTelemetryEvent {
  importOpId: string; // Correlates all events for a single import
  stage:
    | "extraction"
    | "local_classification"
    | "suspicion_engine"
    | "review_layer";
  status: "started" | "completed" | "failed";
  sourceType: "paste" | "doc" | "docx";
  timestamp: number;
  durationMs?: number;
  errorDetails?: {
    message: string;
    stack?: string;
  };
}
```
