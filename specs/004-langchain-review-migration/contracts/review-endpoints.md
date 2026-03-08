# Contract: Review Endpoints

## Scope

العقدان الخارجيان لـ:

- `POST /api/agent/review`
- `POST /api/final-review`

يبقيان **بدون تغيير بنيوي**. هذه الهجرة تغيّر التنفيذ الداخلي فقط.

## Source Of Truth

- `src/types/agent-review.ts`
- `src/types/final-review.ts`

## `POST /api/agent/review`

### Request

يظل `AgentReviewRequestPayload` كما هو:

- `importOpId`
- `sessionId`
- `totalReviewed`
- `reviewPacketText?`
- `suspiciousLines[]`
- `requiredItemIds[]`
- `forcedItemIds[]`

### Response

يظل `AgentReviewResponsePayload` كما هو:

- `apiVersion: "2.0"`
- `mode: "auto-apply"`
- `importOpId`
- `requestId`
- `status`
- `commands[]`
- `message`
- `latencyMs`
- `meta?`
- `model?`

### Invariants

- `commands[]` يحتوي فقط `relabel` أو `split`.
- نفس آلية تطبيع `scene_header_top_line -> scene_header_1`.
- لا يحق للمزود الجديد تغيير أسماء الحقول أو جعل `commands` اختيارية.

## `POST /api/final-review`

### Request

يظل `FinalReviewRequestPayload` كما هو:

- `packetVersion`
- `schemaVersion`
- `importOpId`
- `sessionId`
- `totalReviewed`
- `suspiciousLines[]`
- `requiredItemIds[]`
- `forcedItemIds[]`
- `schemaHints`
- `reviewPacketText?`

### Response

يظل `FinalReviewResponsePayload` كما هو:

- `apiVersion: "2.0"`
- `mode: "auto-apply"`
- `importOpId`
- `requestId`
- `status`
- `commands[]`
- `message`
- `latencyMs`
- `meta?`
- `model?`

### Invariants

- نفس `normalizeSceneHeaderDecisionType` الحالية في final-review.
- نفس semantics لـ `requiredItemIds` و`forcedItemIds`.
- نفس mock responses الحالية (`success` / `error`) shape-wise.

## Allowed Internal Changes

- اسم الدالة الداخلية يمكن أن يتغير من `requestAnthropicReview` إلى اسم provider-agnostic، مع إبقاء controller behavior نفسه.
- يمكن تغيير قيمة الحقل `model` لتعكس `provider:model` أو النموذج الفعلي ما دام الحقل اختياريًا أصلًا.
- يمكن إضافة حقول `meta` جديدة بشرط ألا تُكسر القراءة الحالية وألا تختفي الحقول القائمة.

## Forbidden Changes

- تغيير URL لأي endpoint.
- تغيير schema لطلب أو استجابة endpoint.
- إدخال operation جديدة غير `relabel` و`split`.
- نقل parsing إلى frontend أو فرض structured output مختلف على الواجهة.
