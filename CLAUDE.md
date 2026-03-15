# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Avan Titre (أفان تيتر)** — Arabic professional screenplay editor for web. Built with React 19 + Next.js 15 + Tiptap 3 (ProseMirror) frontend and Express 5 backend. The core feature is a multi-layer classification pipeline that auto-classifies pasted/imported Arabic screenplay text into 10 element types: `action`, `dialogue`, `character`, `scene_header_1`, `scene_header_2`, `scene_header_3`, `transition`, `parenthetical`, `basmala`.

## Commands

```bash
# Development
pnpm dev              # Concurrent: Next.js dev server + backend file-import server
pnpm dev:app          # Frontend only (Next.js)
pnpm file-import:server  # Backend only (Express on 127.0.0.1:8787)

# Build & Validate
pnpm build            # Next.js production build
pnpm typecheck        # tsc --noEmit
pnpm lint             # ESLint
pnpm format           # Prettier --write
pnpm validate         # format:check + lint + typecheck + test

# Testing
pnpm test             # Unit + integration tests with coverage (Vitest)
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests (vitest.pipeline.config.ts)
pnpm test:e2e         # Playwright E2E tests (requires dev server running)

# Run a single test file
npx vitest run tests/unit/some-test.test.ts
npx vitest run tests/integration/some-test.test.ts
npx vitest run --config vitest.pipeline.config.ts tests/integration/some-test.test.ts

# OCR & RAG
pnpm ocr:start        # Single file OCR agent
pnpm rag:index        # Index documents in Qdrant
pnpm rag:ask          # Query the vector database
```

## Architecture

### Hybrid Pattern (React + Imperative Classes)

- **React components** (`App.tsx`, `app-shell/`) for top-level UI state and layout
- **Imperative class** (`EditorArea.ts`) for Tiptap editor lifecycle — ProseMirror state is managed outside React
- **Next.js App Router** (`app/layout.tsx`, `app/page.tsx`) as the entry point with RTL dark-theme layout

### Multi-Layer Classification Pipeline

Text classification flows through `paste-classifier.ts` (main entry point):

1. **Line Normalization & Segmentation** — clean and split input
2. **HybridClassifier** (`hybrid-classifier.ts`) — regex patterns + context rules + confidence scoring
3. **PostClassificationReviewer** (`classification-core.ts`) — 8 quality detectors flag suspicious lines
4. **SequenceOptimization** — Viterbi algorithm for structural consistency
5. **Self-Reflection Pass** — AI cross-check
6. **RetroactiveCorrection** — fixes broken character names
7. **Agent Review** — optional LLM escalation when suspicion score >= 74 with >= 2 detector findings

Routing bands: `pass` → `local-review` → `agent-candidate` → `agent-forced`

### Context System

- `context-memory-manager.ts` — short-term context tracking (characters, locations, dialogue blocks)
- `document-context-graph.ts` — full document structure graph for context-aware classification
- `pipeline-recorder.ts` — records classification pipeline stages for diagnostics

### Frontend → Backend Endpoints

| Endpoint                       | Purpose                                         | AI Provider                                         |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------- |
| `POST /api/file-extract`       | Extract text from PDF/DOC/DOCX/TXT/Fountain/FDX | Mistral (OCR)                                       |
| `POST /api/agent/review`       | Classify suspicious lines                       | Configured review provider via `AGENT_REVIEW_MODEL` |
| `POST /api/final-review`       | Secondary review (Command API v2)               | Configured review provider via `FINAL_REVIEW_MODEL` |
| `POST /api/ai/context-enhance` | Context-aware correction (SSE)                  | Google Gemini                                       |
| `POST /api/export/pdfa`        | HTML → PDF via Puppeteer                        | —                                                   |

### Key Source Directories

- `src/extensions/` — Tiptap extensions + classification engine. `paste-classifier.ts` is the main classification entry point
- `src/pipeline/` — Import orchestration, agent command engine, quality routing
- `src/components/app-shell/` — AppHeader, AppSidebar, AppDock, AppFooter
- `src/components/editor/EditorArea.ts` — Imperative Tiptap editor wrapper class
- `src/rag/` — Qdrant vector DB + embeddings for document indexing
- `src/ocr-arabic-pdf-to-txt-pipeline/` — Separate OCR subsystem with MCP server
- `server/` — Express backend (`.mjs` files): file extraction, AI review, OCR, vision proofread

### Editor Configuration

- **Tiptap 3** on **ProseMirror** with `@tiptap-pro/extension-pages` for A4 pagination (794x1123px @ 96 PPI)
- Each screenplay element is a custom Tiptap block node extension in `src/extensions/`
- `src/editor.ts` — `createScreenplayEditor()` factory and `SCREENPLAY_ELEMENTS` registry
- Keyboard shortcuts: Ctrl+0 through Ctrl+7 for element type switching

## Code Conventions

- **File naming:** kebab-case (e.g., `context-memory-manager.ts`)
- **Classes:** PascalCase (e.g., `PostClassificationReviewer`)
- **Constants:** SCREAMING_SNAKE_CASE (e.g., `SCREENPLAY_ELEMENTS`)
- **Server files:** `.mjs` extension (ES modules for Node.js)
- **Styling:** Tailwind CSS with OKLCH color system, RTL-first, dark-only theme
- **Package manager:** pnpm 10.28 — do not use npm or yarn
- **Language:** Arabic UI throughout, RTL layout. Code comments may be in Arabic.
- **Path aliases:** `@/*` maps to `./src/*`

### Strict TypeScript Rules

- Never use `any` or `unknown`
- Never use `@ts-ignore` or `@ts-expect-error`
- Always import real types from their source libraries, don't invent custom types when official ones exist
- Find root/ideal solutions, not temporary workarounds

## Type System

- `ElementType`: `action`, `dialogue`, `character`, `scene_header_1`, `scene_header_2`, `scene_header_3`, `transition`, `parenthetical`, `basmala`
- `ClassifiedDraft` — core unit of classified text (type, text, confidence, classificationMethod)
- Type definitions live in `src/types/` (classification-types.ts, screenplay.ts, agent-review.ts, editor-engine.ts, typing-system.ts)

## Environment Setup

Copy `.env.example` to `.env`. Review provider selection is provider-agnostic:

- `AGENT_REVIEW_MODEL` / `AGENT_REVIEW_FALLBACK_MODEL` — `provider:model` for suspicious-line review
- `FINAL_REVIEW_MODEL` / `FINAL_REVIEW_FALLBACK_MODEL` — `provider:model` for final review
- `ANTHROPIC_API_KEY` — required only when either review channel uses `anthropic:*`
- `OPENAI_API_KEY` — required only when either review channel uses `openai:*`
- `GEMINI_API_KEY` — required for `google-genai:*` review models and context enhancement
- `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` — required for `deepseek:*` review models
- `MISTRAL_API_KEY` — PDF OCR
- `ANTIWORD_PATH` / `ANTIWORDHOME` — DOC extraction (Windows: `C:/antiword/antiword.exe`)

Backend runs on `127.0.0.1:8787`. Frontend env vars use `NEXT_PUBLIC_` prefix.

## Testing

- **Unit/Integration:** Vitest 4.0 with jsdom. Config: `vitest.config.ts` (unit), `vitest.pipeline.config.ts` (integration)
- **E2E:** Playwright with Chromium. Config: `playwright.config.ts`
- **Coverage:** v8 provider, output in `test-results/coverage/`
- Test fixtures in `tests/fixtures/`, helpers in `tests/helpers/`, harness in `tests/harness/`
