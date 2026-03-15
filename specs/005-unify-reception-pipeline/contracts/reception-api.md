# Unified Reception API Contract

This document defines the interface contract for the unified text extraction and processing endpoint.

## Endpoint: `/api/text-extract`

**Method**: `POST`

**Description**: Accepts raw text or file buffers (depending on the unified route implementation, likely multipart/form-data for files or JSON for raw text) and returns a normalized, structured `UnifiedReceptionResponse`.

### Request Payload

Depending on the source type, the payload might be raw text (paste) or a file buffer (doc/docx). A unified approach often uses `multipart/form-data` or separates the text extraction into a utility that then calls a common JSON endpoint.

Assuming a JSON payload for text (post-extraction for files, or direct for paste):

```json
{
  "sourceType": "paste" | "doc" | "docx",
  "content": "<raw string content or base64 file data>",
  "options": {
    "timeoutMs": 30000
  }
}
```

### Response Payload (Success - 200 OK)

Returns the `UnifiedReceptionResponse` defined in `data-model.md`.

```json
{
  "rawText": "المشهد الأول\nالشارع - نهار\nأحمد: مرحبا",
  "elements": [
    {
      "id": "elem-1",
      "originalText": "المشهد الأول",
      "normalizedText": "المشهد الأول"
    }
  ],
  "extractionMeta": {
    "sourceType": "paste",
    "processingTimeMs": 1250,
    "success": true
  }
}
```

### Error Response (e.g., 400, 500, or 504 Timeout)

```json
{
  "error": {
    "code": "TIMEOUT",
    "message": "استغرقت معالجة الخادم وقتاً أطول من المسموح (30 ثانية)."
  }
}
```
