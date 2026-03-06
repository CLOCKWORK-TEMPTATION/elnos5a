# Bridge Protocol Contract

بروتوكول التواصل بين TypeScript (KarankBridge) و Python (ts_bridge.py)
عبر stdio بصيغة JSON lines.

## Transport

- **Channel**: stdin/stdout of child process
- **Format**: JSON lines (سطر واحد JSON لكل رسالة، `\n` كفاصل)
- **Encoding**: UTF-8

## Request Messages (TS → Python)

### ping

```json
{ "cmd": "ping", "id": "req-001" }
```

**Response**: `{"id": "req-001", "status": "ok"}`

### parseDocx

```json
{
  "cmd": "parseDocx",
  "id": "req-002",
  "params": { "path": "/absolute/path/to/file.docx" }
}
```

### parseText

```json
{
  "cmd": "parseText",
  "id": "req-003",
  "params": { "text": "النص العربي هنا..." }
}
```

## Response Messages (Python → TS)

### Success

```json
{
  "id": "req-002",
  "status": "ok",
  "result": {
    "schema_text": "cene_header_1 = داخلي\ncene_header_2 = شقة أحمد - ليل\nACTION = يدخل أحمد الغرفة...",
    "schema_elements": [
      { "element": "cene_header_1", "value": "داخلي" },
      { "element": "cene_header_2", "value": "شقة أحمد - ليل" },
      { "element": "ACTION", "value": "يدخل أحمد الغرفة..." }
    ],
    "raw_text": "داخلي\nشقة أحمد - ليل\nيدخل أحمد الغرفة..."
  }
}
```

### Error

```json
{
  "id": "req-002",
  "status": "error",
  "error": { "code": "PARSE_FAILED", "message": "Unable to parse docx file" }
}
```

## Error Codes

| Code             | Description         |
| ---------------- | ------------------- |
| `PARSE_FAILED`   | فشل تحليل الملف     |
| `UNKNOWN_CMD`    | أمر غير معروف       |
| `INVALID_PARAMS` | معاملات غير صالحة   |
| `INTERNAL_ERROR` | خطأ داخلي في المحرك |

## Timeout

- كل طلب له timeout: 30 ثانية (قابل للتعديل عبر config)
- عند انتهاء المهلة: reject مع خطأ `TIMEOUT`
