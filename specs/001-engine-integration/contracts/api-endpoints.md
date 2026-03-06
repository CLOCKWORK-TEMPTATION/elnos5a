# API Endpoints Contract

## POST /api/text-extract (جديد)

استخراج وتصنيف نص ملصوق عبر المحرك المضمّن.

### Request

```
POST /api/text-extract
Content-Type: application/json
```

```json
{
  "text": "داخلي\nشقة أحمد - ليل\nيدخل أحمد الغرفة ويجلس على الكرسي."
}
```

### Response (200 OK)

```json
{
  "text": "cene_header_1 = داخلي\ncene_header_2 = شقة أحمد - ليل\nACTION = يدخل أحمد الغرفة ويجلس على الكرسي.",
  "fileType": "txt",
  "method": "karank-engine-bridge",
  "usedOcr": false,
  "warnings": [],
  "attempts": ["karank-engine-bridge"],
  "schemaText": "cene_header_1 = داخلي\n...",
  "schemaElements": [
    { "element": "cene_header_1", "value": "داخلي" },
    { "element": "cene_header_2", "value": "شقة أحمد - ليل" },
    { "element": "ACTION", "value": "يدخل أحمد الغرفة ويجلس على الكرسي." }
  ],
  "rawExtractedText": "داخلي\nشقة أحمد - ليل\nيدخل أحمد الغرفة ويجلس على الكرسي.",
  "structuredBlocks": []
}
```

### Response (500 Error)

```json
{
  "error": "Engine bridge failed",
  "message": "تعذر الاتصال بمحرك التحليل. تأكد من وجود Python 3.12+ على PATH."
}
```

---

## POST /api/file-extract (تعديل)

التعديل الوحيد: الاستجابة تحتوي الآن حقول إضافية عند استخدام المحرك.

### Response الموسّعة

الحقول الإضافية (تظهر فقط عندما `method === "karank-engine-bridge"`):

| Field              | Type              | Description            |
| ------------------ | ----------------- | ---------------------- |
| `schemaText`       | `string`          | النص المهيكل من المحرك |
| `schemaElements`   | `SchemaElement[]` | العناصر المحللة        |
| `rawExtractedText` | `string`          | النص الخام قبل التحليل |

باقي الحقول الموجودة لا تتغير.
