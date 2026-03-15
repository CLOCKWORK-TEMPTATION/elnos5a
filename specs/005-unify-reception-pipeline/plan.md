# Implementation Plan: توحيد مراحل الاستقبال

**Branch**: `005-unify-reception-pipeline` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-unify-reception-pipeline/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

توحيد مسارات الإدخال الثلاثة (لصق نص، فتح مستند قديم، فتح مستند حديث) لتمر بنقطة دخول واحدة (الخدمة المشتركة بالخادم). يضمن ذلك تسلسلاً تنفيذيًا إلزاميًا: الحصول على النص من الخادم ← التصنيف المحلي في الواجهة ← طبقة الشك في الخلفية ← طبقة المراجعة الجديدة في الخلفية. يتضمن التوحيد إلغاء مسار `parseDocx` المباشر، حذف طبقة المراجعة القديمة بالكامل، تطبيق مهلة 30 ثانية لاستجابة الخادم، وتسجيل تفصيلي للأحداث للوصول إلى حالة الإنتاج (Production-Ready).

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.9.3 (Frontend) / ES Modules Node.js (Backend)
**Primary Dependencies**: Next.js 15, Tiptap 3, Express 5
**Storage**: N/A
**Testing**: Vitest 4 (Unit/Integration), Playwright (E2E)
**Target Platform**: Web Browser / Node.js Server
**Project Type**: Web Application
**Performance Goals**: الحد الزمني الأقصى لاستجابة الخادم 30 ثانية
**Constraints**: المعالجة اللاحقة (الشك والمراجعة) تعمل بصمت في الخلفية ولا تحجب الواجهة؛ الفشل صريح ولا يوجد استمرار صامت؛ تسجيل تفصيلي لكل خطوة.
**Scale/Scope**: 3 مسارات إدخال، حذف الكود القديم، وتحديث واجهة المحرر.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Strict TypeScript**: سيتم استخدام أنواع صارمة للبيانات المتبادلة بين الواجهة والخادم في الاستجابة الموحدة.
- **II. Arabic-First Schema Fidelity**: لا تعديل على أنواع العناصر (9 أنواع).
- **III. Pipeline Layering**: يحافظ على ترتيب الـ 10 مراحل (التصنيف المحلي ثم الشك ثم المراجعة).
- **IV. Command API**: التحديثات في الخلفية ستستخدم `Command API v2` لتطبيق التعديلات جزئياً.
- **V. Test-First Validation**: سيتم كتابة `Unit + Integration + E2E tests` لتغطية جميع المسارات وتحقيق `SC-007`.
- **VI. Simplicity & YAGNI**: حذف الكود القديم (المراجعة القديمة و مسار `parseDocx`) يحقق هذا المبدأ بامتياز.
- **VII. Suspicion Engine**: مسار الواجهة سيعتمد على استدعاء هذه الطبقة بعد التصنيف المحلي.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# Web application (Frontend + Backend)
server/
├── controllers/
│   └── extract-controller.mjs
├── routes/
│   └── index.mjs
└── [backend shared services]

src/
├── pipeline/
│   ├── paste-classifier.ts
│   └── document-importer.ts
└── extensions/
    └── ai-progressive-updater.ts

tests/
├── unit/
├── integration/
└── e2e/
```

**Structure Decision**: استمرار في هيكل المشروع الحالي: `server/` لمعالجة النصوص في الخلفية والخدمة المشتركة، و `src/` للواجهة الأمامية ومراحل التصنيف المحلي والتحديثات الصامتة.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
