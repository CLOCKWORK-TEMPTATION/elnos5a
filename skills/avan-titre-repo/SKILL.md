---
name: avan-titre-repo
description: Guides work in the Avan Titre repository. Use when modifying the Next.js app, Express backend, Arabic screenplay classification pipeline, Tiptap editor integrations, import or export flows, or repo-specific tests and commands.
---

# Avan Titre Repo

## When To Use

Use this skill when the task is specific to this repository, especially if it involves:

- Next.js 15 frontend work in `app/` or `src/`
- Tiptap or ProseMirror editor behavior
- Arabic screenplay classification or import pipelines
- Express backend handlers in `server/`
- repo-specific scripts, tests, build, or validation commands

## Quick Start

1. Read `CLAUDE.md` for the current repo overview if the task needs architecture context.
2. Prefer `pnpm` for all package and script commands.
3. Keep fixes aligned with the existing hybrid architecture: React shells at the top level, imperative editor logic in `src/components/editor/EditorArea.ts`, and classification logic in `src/extensions/`.
4. Preserve RTL and Arabic-first UX when touching user-facing UI.

## Commands

Use these defaults:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm validate
```

For focused work:

```bash
pnpm dev:app
pnpm file-import:server
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

## Repo Rules

- Package manager: `pnpm` only
- File names: kebab-case
- Avoid `any`, `unknown`, `@ts-ignore`, and `@ts-expect-error`
- Prefer root-cause fixes over temporary workarounds
- Preserve existing RTL layout and Arabic UI copy unless the task explicitly changes product language
- When changing server code, keep `.mjs` files and ESM conventions intact

## Architecture Map

- `app/`: Next.js App Router entrypoints
- `src/components/app-shell/`: layout chrome and shell components
- `src/components/editor/EditorArea.ts`: imperative Tiptap editor wrapper
- `src/extensions/`: screenplay nodes, classifier, and editor extensions
- `src/pipeline/`: import orchestration and quality routing
- `server/`: Express backend endpoints for extraction, review, and export
- `tests/`: unit, integration, E2E, fixtures, and helpers

## Classification Guidance

When a task affects text classification:

1. Start from `src/extensions/paste-classifier.ts`.
2. Trace related logic in `hybrid-classifier.ts`, `classification-core.ts`, and sequence optimization helpers.
3. Keep the element taxonomy consistent: `action`, `dialogue`, `character`, `scene_header_1`, `scene_header_2`, `scene_header_3`, `transition`, `parenthetical`, `basmala`.
4. Validate edge cases with targeted tests whenever classification behavior changes.

## Editing Workflow

Follow this checklist:

```markdown
Task Progress:

- [ ] Identify the layer being changed
- [ ] Update code in the smallest responsible module
- [ ] Run the narrowest relevant validation
- [ ] Run broader validation if the change crosses boundaries
- [ ] Summarize user-visible or pipeline-visible effects
```

Validation defaults:

- UI-only change: `pnpm lint` and relevant tests
- Type or logic change: `pnpm typecheck` plus relevant tests
- Pipeline or backend change: `pnpm validate` if time allows

## Testing Notes

- Use `vitest.config.ts` for unit coverage and `vitest.pipeline.config.ts` for pipeline integration coverage.
- `pnpm test:e2e` requires the dev server to be running.
- Prefer targeted test runs during iteration, then finish with the smallest broader check that matches the risk of the change.

## References

- Repo overview and conventions: `CLAUDE.md`
