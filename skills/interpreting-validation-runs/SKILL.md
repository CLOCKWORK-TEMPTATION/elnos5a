---
name: interpreting-validation-runs
description: Use when running or interpreting lint, typecheck, test, or build results, especially during local validation, CI triage, or when these commands disagree about the same change.
---

# تفسير نتائج التحقق

## متى تستخدم

Use this skill when the task involves repository validation commands, especially
when the user asks to:

- run `lint`, `typecheck`, `test`, or `build`
- explain why one validation stage fails
- compare output across static analysis, tests, and production build
- summarize CI or local command failures without pasting the whole log
- decide the next engineering step after command output

## تصنيف الأسباب الجذرية

Do not stop at the first error line. Classify each failure under one primary
cause:

- `rule-violation`: static analysis found a code pattern that violates a lint
  rule or formatting contract
- `type-contract-break`: TypeScript found a mismatch in exported shapes,
  nullability, assignability, or configuration-owned type boundaries
- `behavior-regression`: a test assertion shows the implementation no longer
  matches the intended behavior
- `test-harness-break`: tests fail because of mocks, environment setup, path or
  URL handling, timeout handling, or runner configuration
- `build-pipeline-break`: the production build fails because bundling,
  prerendering, server or client boundaries, or build-time environment
  expectations are broken
- `cross-stage-disagreement`: one command passes but another fails because they
  inspect different surfaces of the codebase

Lead with the root cause, then explain the visible symptom.

## المرجعية في المشروع

In this repository, treat these commands as the validation contract:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate
```

Interpret them through the owning scripts in `package.json`:

- `pnpm lint` runs `eslint .`
- `pnpm typecheck` runs `tsc --noEmit`
- `pnpm test` runs `vitest run --coverage --exclude tests/e2e/**`
- `pnpm build` runs `next build`
- `pnpm validate` chains format check, lint, typecheck, and test

Do not assume `build` is redundant just because `lint` and `typecheck` already
passed. In this repo, `next build` can surface production-only warnings or
boundary problems.

## نقطة البداية السريعة

1. Read `package.json` and the touched files before making claims.
2. If the user asked for a broad health check, run all requested commands and
   capture status per command.
3. If the user asked for a focused diagnosis, run the narrowest relevant
   command first, then widen only when results disagree.
4. Extract the first actionable failure cluster instead of narrating every log
   line.
5. Summarize by root cause, owner, evidence, and next command to run.

## سير العمل

### 1. Establish Scope

- Read the changed area and determine whether it is UI, server, shared types,
  tooling, or tests.
- Check `package.json` so the command meaning comes from the repo, not from
  generic assumptions.
- Note whether the user wants a broad status report or a targeted diagnosis.

### 2. Run Commands Intentionally

- If the request says to check all validation stages, run them individually so
  you can report each status separately.
- If a command fails quickly and later commands are likely to repeat the same
  failure, still decide whether to continue based on user intent:
  - broad report: continue
  - focused fix: usually stop and fix the first owning failure
- Prefer repository scripts over raw tool invocations.

### 3. Interpret `lint`

Look for:

- repeated rule failures across many files, which usually signal a shared
  abstraction or config issue
- a small number of file-local violations, which usually indicate direct code
  fixes
- whether the failure is autofixable or requires reasoning

Do not report lint output as if it were a type or runtime failure.

### 4. Interpret `typecheck`

Look for:

- import or export mismatches
- property or method access on the wrong type
- nullable or optional value violations
- config-driven boundary problems such as unresolved aliases or incorrect file
  inclusion

A clean typecheck does not clear runtime issues; it only clears the static
contract TypeScript can see.

### 5. Interpret `test`

Split failures into clusters before summarizing:

- assertion mismatch: implementation or expectation drift
- `is not a function` or missing export signals: import or export contract drift
- mock-shape errors: harness problem, not product logic by default
- path, URL, or environment exceptions: test environment or platform boundary
- timeout or retry instability: execution environment, async contract, or
  orchestration problem

When coverage is enabled, do not mistake coverage noise for the root failure.

### 6. Interpret `build`

Separate these cases:

- hard failure: non-zero exit, compilation stop, prerender crash, or missing
  build dependency
- soft warning: build succeeds but reports a configuration or optimization risk

In this repo, a successful `next build` can still emit warnings that deserve
follow-up. Report the warning as risk, not as a failed build.

### 7. Compare Stages

Use disagreement as a diagnostic clue:

- `lint` fails, `typecheck` passes: style or static policy issue
- `typecheck` fails, `build` may also fail because Next validates types during
  build
- `lint` and `typecheck` pass, `test` fails: runtime logic, test harness, or
  environment issue
- `lint`, `typecheck`, and `test` pass, `build` fails: production-only boundary
  or bundling issue
- `build` passes with warnings while earlier commands pass cleanly: config debt,
  not a release blocker unless the warning is explicitly promoted

### 8. Deliver Findings

Use this structure:

```markdown
# Validation Report

## Command Status
- pnpm lint:
- pnpm typecheck:
- pnpm test:
- pnpm build:

## Failure Clusters
- Command:
- Root cause:
- Evidence:
- Owning area:
- Impact:
- Recommended next step:

## Cross-Stage Notes
- Observation:
- Why it matters:

## Suggested Follow-Up
1. ...
2. ...
```

## قواعد التقرير

- Quote only the decisive lines, not the entire log.
- Prefer one root cause per failure cluster.
- Name the owning file, module, or config whenever possible.
- Distinguish product regressions from harness or environment failures.
- State explicitly which commands passed cleanly.
- If the same issue appears in multiple commands, explain the dependency once
  instead of duplicating it.

## المراجع

For command-specific interpretation patterns and common signal mapping, see:

- [references/validation-runs-playbook.md](references/validation-runs-playbook.md)
