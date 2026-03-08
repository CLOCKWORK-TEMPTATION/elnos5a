<!--
  Sync Impact Report
  ==================
  Version change: N/A → 1.0.0 (initial ratification)
  Added principles:
    - I. Strict TypeScript
    - II. Arabic-First Schema Fidelity
    - III. Pipeline Layering & Suspicion-Driven Routing
    - IV. Command API Compatibility
    - V. Test-First Validation
    - VI. Simplicity & YAGNI
  Added sections:
    - Technical Constraints
    - Development Workflow
    - Governance
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ (Constitution Check section aligns)
    - .specify/templates/spec-template.md ✅ (no conflicts)
    - .specify/templates/tasks-template.md ✅ (no conflicts)
  Follow-up TODOs: none
-->

# Avan Titre Constitution

## Core Principles

### I. Strict TypeScript

All frontend and shared code MUST be written in strict TypeScript.

- NEVER use `any`, `unknown`, `@ts-ignore`, or `@ts-expect-error`.
- ALWAYS import real types from their source libraries; do not invent
  custom types when official ones exist.
- Find root/ideal solutions, not temporary workarounds.

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

Classification flows through deterministic layers before any AI
involvement:

1. Regex patterns → 2. Context rules → 3. Hybrid scoring →
2. Sequence optimization → 5. Suspicion engine → 6. Final review.

- Each layer MUST only refine, never contradict, the guarantees
  of previous layers unless evidence score exceeds the configured
  threshold.
- The suspicion engine produces `SuspicionCase` objects with
  scored signals; routing bands (`pass`, `local-review`,
  `agent-candidate`, `agent-forced`) MUST be respected.
- Agent escalation MUST use `FinalReviewRequestPayload` via
  `POST /api/final-review`; the response MUST conform to
  Command API v2 (`relabel` / `split` operations only).
- No more than `AGENT_REVIEW_MAX_RATIO` of total lines may be
  sent to the agent in a single import operation.

**Rationale**: Deterministic layers handle >95% of lines; the AI
layer is expensive and latency-sensitive. Layering ensures cost
control and predictable behavior.

### IV. Command API Compatibility

All agent review responses (both legacy `POST /api/agent/review`
and new `POST /api/final-review`) MUST return Command API v2
format:

- `relabel`: changes `assignedType` for an `itemId`.
- `split`: splits a line at a UTF-16 `splitAt` index with
  `leftType` / `rightType`.
- No other operations are permitted.
- Every `itemId` in `requiredItemIds` MUST receive at least one
  command; every `itemId` in `forcedItemIds` MUST be resolved.
- `scene_header_1` and `scene_header_2` in AI decisions MUST be
  normalized to `scene_header_top_line` before application.

**Rationale**: A stable command contract lets the frontend apply
corrections without knowing which AI model or version produced
them.

### V. Test-First Validation

- New pipeline logic MUST have corresponding unit or integration
  tests before merge.
- Classification accuracy benchmarks (`bench/`) MUST NOT regress
  below the current baseline (93.7% overall accuracy).
- Backend endpoints MUST be testable via mock mode
  (`FINAL_REVIEW_MOCK_MODE=success|error`) without real API keys.

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

## Technical Constraints

- **Package manager**: pnpm 10.28 — NEVER use npm or yarn.
- **Server files**: `.mjs` extension (ES modules for Node.js).
- **File naming**: kebab-case for files, PascalCase for classes,
  SCREAMING_SNAKE_CASE for constants.
- **Styling**: Tailwind CSS with OKLCH color system, RTL-first,
  dark-only theme.
- **Editor**: Tiptap 3 on ProseMirror; A4 pagination
  (794×1123px @ 96 PPI).
- **Backend**: Express 5 on `127.0.0.1:8787`.
- **AI providers**: Anthropic Claude (agent review + final review),
  Mistral (OCR), Google Gemini (context enhancement).
- **API key validation**: Anthropic keys MUST start with `sk-ant-`
  and pass length check before any API call.
- **Timeouts**: Agent review deadline is enforced; overload errors
  (429/529/503) trigger exponential backoff with max 3 retries.

## Development Workflow

- **Branching**: Feature branches named `###-feature-name` off
  `main`.
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`).
- **Validation gate**: `pnpm validate` (format + lint + typecheck
  - test) MUST pass before merge.
- **Code review**: All PRs MUST verify compliance with this
  constitution's principles.
- **Spec-driven development**: Features follow the SpecKit flow
  (`spec.md` → `plan.md` → `tasks.md` → implementation).

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

**Version**: 1.0.0 | **Ratified**: 2026-03-08 | **Last Amended**: 2026-03-08
