<!--
  Sync Impact Report
  ==================
  Version change: 1.0.0 → 2.0.0 (major upgrade — codebase audit)
  Modified principles:
    - III. Pipeline Layering: expanded from 6 to 10 stages,
      added scoring algorithm details, threshold values
    - IV. Command API: removed "legacy" /api/agent/review reference,
      added idempotency and conflict policy requirements
    - V. Test-First Validation: updated test counts, added harness
      and benchmark requirements
  Added principles:
    - VII. Suspicion Engine Architecture (new standalone system)
    - VIII. Cross-Language Bridge Discipline (Python HMM engine)
  Added sections:
    - Version Matrix (exact dependency versions)
    - API Surface (complete endpoint table)
    - System Architecture Layers (6-layer diagram)
  Removed/updated:
    - Removed "legacy POST /api/agent/review" from Principle IV
      (endpoint still exists but is superseded by /api/final-review)
  Templates requiring updates:
    - .specify/templates/plan-template.md ⚠️ (add Suspicion Engine layer)
    - .specify/templates/spec-template.md ✅ (no conflicts)
    - .specify/templates/tasks-template.md ✅ (no conflicts)
  Follow-up TODOs:
    - Update plan-template.md to reference Principle VII
-->

# Avan Titre Constitution

## Core Principles

### I. Strict TypeScript

All frontend and shared code MUST be written in strict TypeScript.

- NEVER use `any`, `unknown`, `@ts-ignore`, or `@ts-expect-error`.
- ALWAYS import real types from their source libraries; do not invent
  custom types when official ones exist.
- Find root/ideal solutions, not temporary workarounds.
- Server files (`.mjs`) are exempt from TypeScript but MUST use
  JSDoc annotations for public functions.

**Rationale**: The classification pipeline processes untrusted text
through multiple layers; type safety prevents silent misclassification
bugs that would otherwise reach the AI review layer.

### II. Arabic-First Schema Fidelity

The screenplay element schema defines exactly 9 element types
(`basmala`, `scene_header_1`, `scene_header_2`, `scene_header_3`,
`action`, `character`, `parenthetical`, `dialogue`, `transition`).
Additionally, `scene_header_top_line` is an internal editor type
produced by normalizing `scene_header_1`/`scene_header_2` in AI
decisions (see Principle IV); it is NOT a 10th schema type but a
display-level alias used after classification.

- No code path may invent, alias, or silently drop an element type.
- Every hard rule in `DEFAULT_FINAL_REVIEW_SCHEMA_HINTS` is
  authoritative; if suspicion signals conflict with a hard rule,
  the hard rule wins.
- `CHARACTER` MUST only be assigned when the line is an explicit
  name followed by a colon; names inside `ACTION` or `DIALOGUE`
  MUST NOT be promoted.
- `ACTION` is the default fallback for any line that matches no
  other rule.

**Rationale**: Arabic screenplay conventions differ from Hollywood
format. The schema encodes domain-expert knowledge that MUST NOT
be overridden by heuristic or AI guesses.

### III. Pipeline Layering & Suspicion-Driven Routing

Classification flows through 10 deterministic stages before any AI
involvement:

1. **Line Normalization & Segmentation** — raw text → cleaned lines
2. **Initial Regex Classification** — basic pattern matching
3. **HybridClassifier** — context-aware rules + confidence scoring
4. **PostClassificationReviewer** — 8 quality detectors flag
   suspicious lines
5. **Structural Sequence Optimization** — Viterbi algorithm for
   structural consistency
6. **Self-Reflection Pass** — optional AI cross-check
   (flag: `SELF_REFLECTION_ENABLED`)
7. **Retroactive Correction** — fixes broken character names
8. **Reverse Classification Pass** — forward/reverse pass merging
9. **Suspicion Engine** — 11 detector families produce
   `SuspicionCase` objects with scored signals
10. **Final Review** — LLM escalation for agent-candidate/
    agent-forced items

- Each layer MUST only refine, never contradict, the guarantees
  of previous layers unless evidence score exceeds the configured
  threshold.
- Routing bands (`pass`, `local-review`, `agent-candidate`,
  `agent-forced`) MUST be respected with these thresholds:
  - `pass`: escalationScore < 65
  - `local-review`: 65 ≤ score < 80
  - `agent-candidate`: 80 ≤ score < 90 (escalates if
    `criticalMismatch` OR `distinctDetectors >= 2`)
  - `agent-forced`: score ≥ 90 (mandatory LLM review)
- Agent escalation MUST use `FinalReviewRequestPayload` via
  `POST /api/final-review`; the response MUST conform to
  Command API v2 (`relabel` / `split` operations only).
- No more than `AGENT_REVIEW_MAX_RATIO` of total lines may be
  sent to the agent in a single import operation.

**Scoring algorithm**:
```
escalationScore = 0.92 × detectorBase
                + methodPenalty (0–14)
                + confidencePenalty (0–12)
                - evidenceDiversityBoost (0–10)
                + suggestionBoost (6 if alternate type suggested)
                + criticalMismatchBoost (10 if critical)
```
Score clamped to [0, 99].

**Rationale**: Deterministic layers handle >95% of lines; the AI
layer is expensive and latency-sensitive. Layering ensures cost
control and predictable behavior.

### IV. Command API Compatibility

All review responses from `POST /api/final-review` MUST return
Command API v2 format:

- `relabel`: changes `assignedType` for an `itemId` with
  `confidence` and `reason`.
- `split`: splits a line at a UTF-16 `splitAt` index with
  `leftType` / `rightType`, `confidence`, and `reason`.
- No other operations are permitted.
- Every `itemId` in `requiredItemIds` MUST receive at least one
  command; every `itemId` in `forcedItemIds` MUST be resolved.
- `scene_header_1` and `scene_header_2` in AI decisions MUST be
  normalized to `scene_header_top_line` before application.
- Commands MUST be idempotent: the Command Engine
  (`src/pipeline/command-engine.ts`) enforces request
  deduplication via `importOpId` + `requestId` fingerprinting.
- Conflict policy MUST be declared; stale operations MUST be
  detected and rejected.

**Rationale**: A stable command contract lets the frontend apply
corrections without knowing which AI model or version produced
them. Idempotency prevents duplicate corrections on retry.

### V. Test-First Validation

- New pipeline logic MUST have corresponding unit or integration
  tests before merge.
- Classification accuracy benchmarks (`bench/`) MUST NOT regress
  below the current baseline (93.7% overall accuracy).
- Backend endpoints MUST be testable via mock mode
  (`FINAL_REVIEW_MOCK_MODE=success|error`) without real API keys.
- Test infrastructure spans 4 layers:
  - **Unit** (69+ tests, jsdom, `vitest.config.ts`)
  - **Integration** (32+ tests, node, `vitest.pipeline.config.ts`)
  - **E2E** (5+ tests, Playwright Chromium)
  - **Harness** (contract + pipeline harness with server spawning)
- Zod-validated test configuration (`test-config-manager.ts`)
  MUST be used for environment setup.
- Builder pattern (`tests/helpers/screenplay-builders.ts`) SHOULD
  be used for constructing test fixtures.

**Rationale**: The classification pipeline is the core product
differentiator; regressions directly impact user trust.

### VI. Simplicity & YAGNI

- Do not add features, abstractions, or configuration beyond what
  the current task requires.
- Prefer 3 similar lines of code over a premature abstraction.
- Do not add error handling for scenarios that cannot happen within
  the system's own guarantees.
- Do not create backward-compatibility shims; change the code
  directly.

**Rationale**: The codebase already has significant complexity in
the classification pipeline; additional unnecessary complexity
compounds maintenance burden.

### VII. Suspicion Engine Architecture

The suspicion engine (`src/suspicion-engine/`, 50+ files) is a
standalone subsystem that scores line-level classification quality
through evidence aggregation.

- **11 detector families** organized in 5 categories:
  - **gate-break**: action-gate, character-gate, dialogue-gate
  - **context**: character-flow, orphan-dialogue, sequence-violation
  - **corruption**: ocr-artifact, split-character, wrapped-dialogue
  - **cross-pass**: multi-override, reverse-conflict, viterbi-conflict
  - **source**: import-profile, quality-risk, source-hint-mismatch
- Detectors MUST implement `detector-interface.ts` and produce
  typed evidence signals.
- Evidence is aggregated via `evidence-aggregator.ts` and built
  into `SuspicionCase` objects via `suspicion-case-builder.ts`.
- Resolution follows the Resolver pattern:
  - `local-deterministic-resolver` — deterministic corrections
  - `local-repair-resolver` — repair-based corrections
  - `remote-ai-resolver` — LLM escalation (subject to
    `remote-ai-resolver-policy`)
  - `circuit-breaker` — prevents cascading failures
  - `noop-resolver` — pass-through for non-suspicious lines
- `resolution-coordinator.ts` orchestrates resolver selection
  based on routing band.
- All suspicion events MUST be recorded via telemetry
  (`suspicion-metrics.ts`, `suspicion-recorder.ts`) and tracing
  (`classification-trace.ts`, `trace-collector.ts`).

**Rationale**: Centralizing quality detection in a dedicated engine
with typed evidence and configurable thresholds allows independent
evolution of detection logic without coupling to the main pipeline.

### VIII. Cross-Language Bridge Discipline

The Python HMM engine (`server/karank_engine/`) provides Viterbi
sequence optimization via `karank-bridge.mjs` (JSON lines over
stdio subprocess).

- All Python ↔ TypeScript communication MUST use JSON lines
  protocol over stdio.
- Bridge timeouts (`KARANK_PING_TIMEOUT_MS`,
  `KARANK_REQUEST_TIMEOUT_MS`, `KARANK_DOCX_REQUEST_TIMEOUT_MS`)
  MUST be respected.
- Python engine modules MUST NOT be imported directly from
  TypeScript; all interaction goes through the bridge.
- The Python engine covers: normalization, segmentation, parsing,
  feature extraction, Viterbi algorithm, HMM model, state
  registry, boundary detection, corrections, and flat recovery.

**Rationale**: Isolating the HMM engine in a subprocess prevents
Python runtime issues from crashing the Node.js server, and allows
independent deployment and testing of the sequence optimization
layer.

## Technical Constraints

### Version Matrix

| Component          | Version     | Notes                           |
| ------------------ | ----------- | ------------------------------- |
| **pnpm**           | 10.28.0     | NEVER use npm or yarn           |
| **TypeScript**     | 5.9.3       | Strict mode, ES2022 target      |
| **React**          | 19.2.4      | —                               |
| **Next.js**        | 15.5.12     | App Router                      |
| **Tiptap**         | 3.20.0      | ProseMirror foundation          |
| **Express**        | 5.2.1       | Backend on 127.0.0.1:8787       |
| **Vitest**         | 4.0.18      | v8 coverage provider            |
| **Playwright**     | 1.56.1      | Chromium only                   |
| **langchain**      | 1.2.30      | Shared multi-provider review runtime |
| **@langchain/core** | 1.1.31     | Shared LangChain primitives     |
| **@langchain/anthropic** | 1.3.22 | Anthropic review provider       |
| **@langchain/openai** | 1.2.12   | OpenAI + DeepSeek-compatible transport |
| **@langchain/google-genai** | 2.1.24 | Gemini review provider       |
| **@mistralai/mistralai** | 1.14.1 | PDF OCR via vision            |
| **@google/generative-ai** | 0.24.1 | Context enhancement          |

### Conventions

- **Server files**: `.mjs` extension (ES modules for Node.js).
- **File naming**: kebab-case for files, PascalCase for classes,
  SCREAMING_SNAKE_CASE for constants.
- **Styling**: Tailwind CSS 3.4 with OKLCH color system, RTL-first,
  dark-only theme.
- **Editor**: Tiptap 3 on ProseMirror; A4 pagination
  (794×1123px @ 96 PPI).
- **Module type**: ES modules (`"type": "module"` in package.json).
- **Path aliases**: `@/*` → `./src/*`, `@tests/*` → `./tests/*`.

### AI Providers

| Provider                  | Purpose                              | Model Default                 |
| ------------------------- | ------------------------------------ | ----------------------------- |
| Configured review primary | `agent-review` via `AGENT_REVIEW_MODEL` | `anthropic:claude-sonnet-4-6` |
| Configured review primary | `final-review` via `FINAL_REVIEW_MODEL` | `anthropic:claude-sonnet-4-6` |
| OpenAI / Gemini / DeepSeek | Supported fallback review providers | via `*_FALLBACK_MODEL`        |
| Mistral                   | PDF OCR via vision                   | —                             |
| Google Gemini             | Context enhancement (SSE)            | —                             |

- **API key validation**: review startup warnings MUST be provider-specific.
  `ANTHROPIC_API_KEY` keys MUST start with `sk-ant-`; `OPENAI_API_KEY`,
  `GEMINI_API_KEY`, and `DEEPSEEK_API_KEY` are required only when their
  providers are configured for review.
- **Timeouts**: Agent review deadline = 90s; temporary provider errors
  (429/529/503/5xx/timeouts) trigger retry and optional cross-provider
  fallback, while permanent errors (`401`, `403`, `404`) MUST NOT trigger
  fallback.
- **Token budget**: `BASE_OUTPUT_TOKENS=1200`,
  `TOKENS_PER_SUSPICIOUS_LINE=1000`, ceiling at 64000.

## API Surface

| Endpoint                       | Method | Purpose                         | AI Provider      |
| ------------------------------ | ------ | ------------------------------- | ---------------- |
| `/health`                      | GET    | Health report with config status | —               |
| `/api/file-extract`            | POST   | Extract text from files          | Mistral (OCR)   |
| `/api/files/extract`           | POST   | Alias for file-extract           | Mistral (OCR)   |
| `/api/text-extract`            | POST   | Text-only extraction             | —               |
| `/api/agent/review`            | POST   | Classify suspicious lines (v2)   | Configured review provider |
| `/api/final-review`            | POST   | Secondary review (Command v2)    | Configured review provider |
| `/api/ai/context-enhance`      | POST   | Context-aware correction (SSE)   | Google Gemini    |
| `/api/export/pdfa`             | POST   | HTML → PDF via Puppeteer         | —               |

## System Architecture Layers

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Frontend (React 19 + Next.js 15)      │
│  App.tsx → EditorArea.ts (Tiptap 3 imperative)  │
├─────────────────────────────────────────────────┤
│  Layer 2: Classification Pipeline               │
│  paste-classifier.ts → hybrid-classifier.ts →   │
│  classification-core.ts → sequence-optimizer     │
├─────────────────────────────────────────────────┤
│  Layer 3: Suspicion Engine (50+ files)           │
│  11 detectors → evidence aggregation →           │
│  routing policy → resolver coordination          │
├─────────────────────────────────────────────────┤
│  Layer 4: Command Engine                         │
│  command-engine.ts: relabel/split execution,     │
│  idempotency, conflict policy, stale detection   │
├─────────────────────────────────────────────────┤
│  Layer 5: Backend (Express 5)                    │
│  controllers → services → routes → middlewares   │
│  + KarankBridge (Python HMM subprocess)          │
├─────────────────────────────────────────────────┤
│  Layer 6: AI Providers                           │
│  LangChain Multi-Provider Review │ Mistral OCR │ Google Gemini  │
└─────────────────────────────────────────────────┘
```

## Development Workflow

- **Branching**: Feature branches named `###-feature-name` off
  `main`.
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`).
- **Validation gate**: `pnpm validate` (format + lint + typecheck
  + test) MUST pass before merge.
- **Code review**: All PRs MUST verify compliance with this
  constitution's principles.
- **Spec-driven development**: Features follow the SpecKit flow
  (`spec.md` → `plan.md` → `tasks.md` → implementation).
- **Test scripts**:
  - `pnpm test` — unit + integration with coverage
  - `pnpm test:unit` — unit tests only
  - `pnpm test:integration` — integration tests only
  - `pnpm test:e2e` — Playwright E2E tests
  - `pnpm test:harness` — contract + pipeline harness
  - `pnpm test:e2e:release-gate` — release validation

## Governance

This constitution is the authoritative source of project standards.
It supersedes all other informal practices or ad-hoc decisions.

- **Amendments**: Any principle change MUST be documented with
  rationale, approved, and propagated to dependent templates.
- **Versioning**: Constitution uses semantic versioning
  (MAJOR.MINOR.PATCH). MAJOR for principle removals/redefinitions,
  MINOR for new principles, PATCH for clarifications.
- **Compliance review**: Every PR and code review MUST verify
  adherence to the active principles. Violations MUST be flagged
  before merge.
- **Complexity justification**: Any deviation from Principle VI
  MUST be documented in the plan's Complexity Tracking table.

**Version**: 2.0.0 | **Ratified**: 2026-03-08 | **Last Amended**: 2026-03-08
