# Quickstart: LangChain Review Provider Migration

## 1. Install dependencies

**Minimum runtime requirement**:

`Node.js >= 20`

```bash
pnpm add langchain @langchain/core @langchain/anthropic @langchain/openai @langchain/google-genai
```

## 2. Configure environment variables

```env
# Agent review
AGENT_REVIEW_MODEL=anthropic:claude-sonnet-4-6
AGENT_REVIEW_FALLBACK_MODEL=openai:gpt-5-mini

# Final review
FINAL_REVIEW_MODEL=google-genai:gemini-2.5-flash
FINAL_REVIEW_FALLBACK_MODEL=deepseek:deepseek-chat

# Provider credentials
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### Backward compatibility

- A bare value such as `claude-sonnet-4-6` must resolve to `anthropic:claude-sonnet-4-6`.
- Leaving `*_FALLBACK_MODEL` empty disables cross-provider fallback.

## 3. Start the application

```bash
pnpm run dev
```

## 4. Smoke test `agent-review`

### Mock path

```env
AGENT_REVIEW_MOCK_MODE=success
```

Then run:

```bash
pnpm test:unit
```

### Real provider switch

1. Set `AGENT_REVIEW_MODEL=openai:gpt-5-mini`
2. Ensure `OPENAI_API_KEY` is present
3. Restart the backend
4. Call `POST /api/agent/review`
5. Verify the response contract is unchanged and the logs record `provider=openai`

## 5. Smoke test `final-review`

1. Set `FINAL_REVIEW_MODEL=google-genai:gemini-2.5-flash`
2. Ensure `GEMINI_API_KEY` is present
3. Call `POST /api/final-review`
4. Verify `commands[]`, `status`, and the general payload shape remain unchanged

## 6. Verify `/health`

Run:

```bash
curl http://127.0.0.1:8787/health
```

Check for:

- `reviewProvider`
- `reviewModel`
- `reviewFallbackStatus`
- runtime snapshots for both review channels

## 7. Verify fallback behavior

1. Configure a temporary failing primary provider
2. Configure a valid `*_FALLBACK_MODEL`
3. Call the relevant review endpoint
4. Verify:
   - the request succeeds through the fallback provider
   - `/health` reports `reviewFallbackStatus=active`
   - logs record `usedFallback=true`

## 8. Final gate before merge

```bash
grep -r "@anthropic-ai/sdk" server/ src/ tests/
pnpm test -- --run tests/unit/server/agent-review.contract.test.ts
pnpm test -- --run tests/unit/server/final-review-command-parser.test.ts
pnpm test -- --run tests/integration/final-review-pipeline.test.ts
pnpm validate
```

Expected result:

- the grep output is empty
- the focused review tests pass in sequence
- validation passes
- all 28 files in the spec scope have been touched or explicitly reviewed
