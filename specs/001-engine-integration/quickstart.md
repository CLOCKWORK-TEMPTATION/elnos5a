# Quickstart: دمج المحرك داخل التطبيق

## المتطلبات

- Python 3.12+ على PATH
- pnpm 10.28+
- Node.js (الإصدار المستخدم في المشروع)

## الخطوات

### 1. نسخ ملفات المحرك

```bash
# نسخ مرة واحدة من المصدر الأصلي
cp -r D:/karank/engine server/karank_engine/engine
```

### 2. تثبيت اعتمادات Python

```bash
pip install -r server/karank_engine/engine/requirements.txt
```

### 3. التحقق من عمل المحرك

```bash
# اختبار مباشر
echo '{"cmd":"ping","id":"test"}' | python server/karank_engine/engine/ts_bridge.py
# المتوقع: {"id":"test","status":"ok"}
```

### 4. تشغيل التطبيق

```bash
pnpm dev
```

### 5. اختبار الاستخراج

```bash
# اختبار text-extract
curl -X POST http://127.0.0.1:8787/api/text-extract \
  -H "Content-Type: application/json" \
  -d '{"text": "داخلي\nشقة أحمد - ليل\nيدخل أحمد الغرفة."}'

# اختبار file-extract مع docx
curl -X POST http://127.0.0.1:8787/api/file-extract \
  -F "file=@path/to/test.docx"
```

### 6. التحقق من الاستقلالية

```bash
# تأكد من عدم وجود أي reference لـ D:\karank
grep -r "D:\\\\karank\|D:/karank" server/ src/ --include="*.ts" --include="*.mjs"
# المتوقع: لا نتائج
```

## معيار النجاح

- `/api/text-extract` يعود بـ `method: "karank-engine-bridge"`
- `/api/file-extract` على ملف docx يعود بنفس الـ method
- التطبيق يعمل بدون `D:\karank` على الجهاز
- pipeline المراجعة (شك + agent review) تعمل على ناتج المحرك
