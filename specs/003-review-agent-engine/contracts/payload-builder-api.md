# Payload Builder API Contract

## Module

`src/final-review/payload-builder.ts`

## Exported Functions

### buildFinalReviewSuspiciousLinePayload

```typescript
function buildFinalReviewSuspiciousLinePayload(params: {
  suspicionCase: SuspicionCase;
  classified: readonly ClassifiedDraftWithId[];
  itemId: string;
  fingerprint: string;
}): FinalReviewSuspiciousLinePayload | null;
```

**Behavior**:

- Returns null if assignedType is not in REVIEWABLE_AGENT_TYPES
- Builds evidence from suspicionCase.signals grouped by signalType
- Extracts contextLines (±2 window, excluding target line and non-reviewable types)
- Maps routingBand: "agent-forced" stays, everything else → "agent-candidate"

### formatFinalReviewPacketText

```typescript
function formatFinalReviewPacketText(
  request: Pick<
    FinalReviewRequestPayload,
    "totalReviewed" | "requiredItemIds" | "forcedItemIds" | "suspiciousLines"
  >
): string;
```

**Behavior**:

- Returns JSON.stringify with indent 2
- Includes only summary fields per suspicious line (itemId, lineIndex, assignedType, suspicionScore, routingBand, critical, primarySuggestedType, reasonCodes, signalMessages)
- Used for diagnostic/debug text in reviewPacketText field

## Integration Points

### In paste-classifier.ts

The following functions are added to paste-classifier.ts for routing:

1. `promoteHighSeverityMismatches(cases)` — promotes agent-candidate → agent-forced when alternative-pull score ≥ 96
2. `selectSuspiciousLinesForAgent(cases, totalReviewed)` — selects top cases respecting AGENT_REVIEW_MAX_RATIO
3. `shouldEscalateToAgent(case)` — returns true for forced, critical, score ≥ 85, ≥ 2 signal families, or type mismatch
