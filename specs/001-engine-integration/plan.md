# Implementation Plan: دمج المحرك داخل التطبيق

**Branch**: `001-engine-integration` | **Date**: 2026-03-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-engine-integration/spec.md`

## Summary

نقل محرك karank من `D:\karank` إلى داخل المستودع كنسخة vendored في
`server/karank_engine/engine/`. إنشاء KarankBridge (مدير subprocess) للتواصل
مع Python عبر stdio JSON lines. تعديل `file-import-server.mjs` ليمرر كل
أنواع الملفات عبر المحرك. إضافة `POST /api/text-extract` للنصوص الملصوقة.
تعديل `paste-classifier.ts` ليفهم ناتج schema-style. الإبقاء على pipeline
المراجعة كاملة (PostClassificationReviewer + agent review).

## Technical Context

**Language/Version**: TypeScript 5.x (frontend/backend) + Python 3.12+ (engine)
**Primary Dependencies**: React 19, Next.js 15, Tiptap 3, Express 5, child_process (Node.js)
**Storage**: Filesystem (ملفات مؤقتة للـ docx) — لا قاعدة بيانات
**Testing**: Vitest 4.0 (unit + integration), Playwright (E2E)
**Target Platform**: Windows desktop (development), Web browser (runtime)
**Project Type**: Web application (Next.js frontend + Express backend + Python engine)
**Performance Goals**: < 10s لملف 50 صفحة، < 3s للصق نص
**Constraints**: Python 3.12+ على PATH، المحرك vendored داخل المستودع
**Scale/Scope**: مستخدم واحد محلي، ملفات سيناريو عربية

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                 | Status | Notes                                                           |
| ------------------------- | ------ | --------------------------------------------------------------- |
| I. Self-Containment       | PASS   | المحرك vendored في `server/karank_engine/` — لا reference خارجي |
| II. Pipeline Integrity    | PASS   | طبقات المراجعة تبقى كاملة — لا تجاوز                            |
| III. Strict TypeScript    | PASS   | أنواع جديدة تُعرَّف في `src/types/`                             |
| IV. Engine Bridge Pattern | PASS   | KarankBridge يتبع النمط بالضبط (lazy, ping, single retry)       |
| V. Unified Entry Point    | PASS   | كل المدخلات تمر بنفس envelope                                   |
| VI. Arabic-First RTL      | PASS   | لا تغيير على الواجهة — RTL محفوظ                                |
| VII. Simplicity & YAGNI   | PASS   | لا abstractions زائدة — bridge مباشر                            |

**Gate Result**: PASS — لا انتهاكات.

## Project Structure

### Documentation (this feature)

```text
specs/001-engine-integration/
├── plan.md              # هذا الملف
├── spec.md              # المواصفات
├── research.md          # Phase 0: أبحاث وقرارات
├── data-model.md        # Phase 1: نموذج البيانات
├── quickstart.md        # Phase 1: دليل البدء السريع
├── contracts/
│   ├── bridge-protocol.md  # بروتوكول التواصل مع Python
│   └── api-endpoints.md    # واجهات API الجديدة/المعدّلة
└── tasks.md             # Phase 2: المهام (/speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── karank_engine/
│   └── engine/
│       ├── ts_bridge.py          # نقطة دخول المحرك (Python)
│       ├── parser/               # منطق التحليل
│       ├── schema/               # تعريف العناصر
│       └── requirements.txt      # اعتمادات Python
├── karank-bridge.mjs             # KarankBridge class (جديد)
├── file-import-server.mjs        # نقطة دخول الخادم (تعديل)
├── routes/index.mjs              # تسجيل routes (تعديل: إضافة text-extract)
├── controllers/
│   ├── extract-controller.mjs    # معالج استخراج الملفات (تعديل)
│   └── text-extract-controller.mjs  # معالج استخراج النصوص (جديد)
└── services/
    ├── schema-parser.mjs         # parser لصيغة ELEMENT = VALUE (جديد)
    └── response-normalizer.mjs   # تطبيع ناتج المحرك إلى FileExtractionResult (تعديل)

src/
├── types/
│   ├── file-import.ts            # تعديل: ExtractionMethod + FileExtractionResult
│   └── classification-types.ts   # تعديل: ClassificationMethod
└── extensions/
    └── paste-classifier.ts       # تعديل: دعم schema-style input

tests/
├── unit/
│   ├── schema-parser.test.ts     # اختبار parser الـ schema
│   └── element-mapping.test.ts   # اختبار mapping العناصر
└── integration/
    ├── bridge-lifecycle.test.ts   # اختبار دورة حياة bridge
    └── file-extract-engine.test.ts # اختبار استخراج عبر المحرك
```

**Structure Decision**: المشروع يتبع بنية web application مع frontend (Next.js)
و backend (Express) في نفس المستودع. المحرك يُضاف كمجلد vendored في `server/`.
لا تغيير على البنية العامة — فقط إضافات في `server/` وتعديلات في `src/types/`
و `src/extensions/`.

## Complexity Tracking

> لا انتهاكات — لا حاجة لتبرير تعقيد إضافي.
