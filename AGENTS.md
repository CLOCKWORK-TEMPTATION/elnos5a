# elnos5a Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-08

## Active Technologies

- TypeScript 5.7.x في الواجهة والكود المشترك + Node.js ES Modules بامتداد `.mjs` في الخادم + Express 5, React 19, Next.js 15, pino, dotenv, `langchain`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai`, `@langchain/google-genai` (004-langchain-review-migration)

## Project Structure

```text
app/
server/
src/
specs/
tests/
```

## Commands

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`

## Code Style

TypeScript 5.7.x في الواجهة والكود المشترك + Node.js ES Modules بامتداد `.mjs` في الخادم: استخدم TypeScript الصارم في الواجهة والكود المشترك، وحافظ على ملفات الخادم بامتداد `.mjs`، ولا تغيّر عقد `agent-review` و `final-review` أو صيغة Command API v2.

## Recent Changes

- 004-langchain-review-migration: Added TypeScript 5.7.x في الواجهة والكود المشترك + Node.js ES Modules بامتداد `.mjs` في الخادم + Express 5, React 19, Next.js 15, pino, dotenv, `langchain`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai`, `@langchain/google-genai`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
