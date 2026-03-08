# Final Review API Contract

## Endpoint

`POST /api/final-review`

## Rate Limiting

يستخدم نفس `reviewLimiter` المُطبّق على `/api/agent/review`.

## Request

- Content-Type: application/json
- Body: `FinalReviewRequestPayload`

### Required Fields

| Field           | Type   | Validation                                                  |
| --------------- | ------ | ----------------------------------------------------------- |
| packetVersion   | string | Non-empty, max 64 chars                                     |
| schemaVersion   | string | Non-empty, max 64 chars                                     |
| sessionId       | string | Non-empty, max 120 chars                                    |
| importOpId      | string | Non-empty, max 120 chars                                    |
| totalReviewed   | number | Integer ≥ 0                                                 |
| suspiciousLines | array  | Each element validated per FinalReviewSuspiciousLinePayload |
| schemaHints     | object | Falls back to DEFAULT_SCHEMA_HINTS if invalid               |

### Optional Fields

| Field            | Type     | Default                                 |
| ---------------- | -------- | --------------------------------------- |
| requiredItemIds  | string[] | All suspicious line itemIds             |
| forcedItemIds    | string[] | ItemIds with routingBand "agent-forced" |
| reviewPacketText | string   | Empty (max 160,000 chars)               |

### Validation Rules

- forcedItemIds MUST be subset of requiredItemIds
- All requiredItemIds MUST exist in suspiciousLines
- suspicionScore MUST be 0–100
- assignedType MUST be in ALLOWED_LINE_TYPES
- routingBand MUST be "agent-candidate" or "agent-forced"

## Response

- Content-Type: application/json

### Success (200)

```json
{
  "apiVersion": "2.0",
  "mode": "auto-apply",
  "importOpId": "...",
  "requestId": "uuid",
  "status": "applied" | "partial" | "skipped",
  "commands": [
    {
      "op": "relabel",
      "itemId": "...",
      "newType": "action",
      "confidence": 0.97,
      "reason": "..."
    }
  ],
  "message": "...",
  "latencyMs": 1234,
  "model": "claude-haiku-4-5-20251001",
  "meta": {
    "requestedCount": 5,
    "commandCount": 5,
    "missingItemIds": [],
    "forcedItemIds": ["id1"],
    "unresolvedForcedItemIds": []
  }
}
```

### Validation Error (400)

```json
{
  "apiVersion": "2.0",
  "mode": "auto-apply",
  "importOpId": "unknown",
  "requestId": "uuid",
  "status": "error",
  "commands": [],
  "message": "Invalid suspicionScore at suspicious line 0.",
  "latencyMs": 0
}
```

### Server Error (500)

Same structure as 400 with statusCode 500.

### Status Values

| Status  | Meaning                                                      |
| ------- | ------------------------------------------------------------ |
| applied | All requiredItemIds resolved with commands                   |
| partial | Some requiredItemIds missing commands (no forced unresolved) |
| skipped | No suspicious lines or no parseable commands                 |
| error   | Forced items unresolved, API failure, or validation error    |

### Command Operations

| Op      | Fields                                                   | Notes                                                        |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| relabel | itemId, newType, confidence, reason                      | newType normalized: scene_header_1/2 → scene_header_top_line |
| split   | itemId, splitAt, leftType, rightType, confidence, reason | splitAt is UTF-16 code-unit index                            |

## Mock Mode

Set `FINAL_REVIEW_MOCK_MODE` environment variable:

- `success`: Returns relabel commands for all requiredItemIds with confidence 0.99
- `error`: Returns error response immediately

## Model Resolution

Priority: FINAL_REVIEW_MODEL > ANTHROPIC_REVIEW_MODEL > AGENT_REVIEW_MODEL > "claude-haiku-4-5-20251001"
Non-Anthropic models (gpt, gemini, etc.) trigger fallback to default.
