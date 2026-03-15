# Contract: Health API

## Endpoint

`GET /health`

## Goal

تحويل health report من Anthropic-specific إلى provider-agnostic مع الحفاظ على
المعلومات الحالية غير المتعلقة بالمراجعة.

## Existing Fields To Preserve

- `status`
- `ok`
- `service`
- حقول antiword / OCR / aiContextLayer الحالية

## Review Runtime Fields

### Backward-compatible top-level fields

هذه الحقول تستمر في وصف قناة `agent-review` لأنها القناة الأساسية في الـ health الحالي:

| Field                      | Type                                             | Meaning                                 |
| -------------------------- | ------------------------------------------------ | --------------------------------------- |
| `reviewProvider`           | `string`                                         | المزود المهيأ/الفعلي لقناة agent-review |
| `reviewModel`              | `string`                                         | النموذج الفعلي أو المهيأ                |
| `reviewModelRequested`     | `string \| null`                                 | القيمة الخام من env بعد التطبيع         |
| `reviewModelResolved`      | `string`                                         | النموذج بعد defaulting                  |
| `reviewFallbackConfigured` | `boolean`                                        | هل يوجد fallback model                  |
| `reviewFallbackStatus`     | `"idle" \| "configured" \| "active" \| "failed"` | حالة fallback الحالية                   |
| `reviewLastErrorClass`     | `"temporary" \| "permanent" \| null`             | آخر تصنيف خطأ                           |

### Nested channel snapshots

```ts
type HealthReviewRuntime = {
  configuredProvider: string;
  configuredModel: string;
  fallbackConfigured: boolean;
  activeProvider: string;
  activeModel: string;
  fallbackStatus: "idle" | "configured" | "active" | "failed";
  lastErrorClass: "temporary" | "permanent" | null;
  lastUpdatedAt: number | null;
};
```

Planned fields:

- `agentReviewRuntime: HealthReviewRuntime`
- `finalReviewRuntime: HealthReviewRuntime`

## Behavioral Rules

- عند startup بدون أي طلبات، `activeProvider/activeModel` يمكن أن يساويا القيم المهيأة، و`fallbackStatus` يكون `configured` أو `idle`.
- بعد نجاح عبر fallback، يجب أن تصبح `fallbackStatus=active`.
- بعد failure دائم على المزود الأساسي بدون fallback، يجب أن يظهر `lastErrorClass=permanent`.
- الحقول الجديدة لا يجب أن تغيّر status code لـ `/health`; يبقى `200` عند سلامة الخدمة نفسها.

## Non-Review Fields

المجالات الحالية مثل OCR وGemini context وantiword لا تتغير ضمن هذه الخطة،
لكن لا يجب أن تتأثر إضافة snapshot المراجعة الجديدة بوجودها.
