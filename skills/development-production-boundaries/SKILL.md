---
name: development-production-boundaries
description: Use when code behaves differently between local development and production, or when reproducing environment-specific bugs across dev, build, preview, and test in this repository.
---

# حدود بيئة التطوير والإنتاج

## متى تستخدم

Use this skill when the task is about behavior that changes across runtime
modes, especially when the user asks to:

- explain why something works during local development but fails after build
- distinguish development behavior from production behavior
- compare local defaults against deployed expectations
- diagnose issues that appear only after preview or build
- understand whether a result came from development, production, or test mode

## تصنيف الأسباب الجذرية

Do not describe the difference as a vague environment issue. Classify it under
one primary cause:

- `env-branching`: the code takes different logic paths based on
  `process.env.NODE_ENV`
- `local-dev-fallback`: development injects a localhost default or permissive
  fallback that production does not have
- `build-only-surface`: the problem appears only after bundling, preview, lazy
  import timing, or production-only execution paths
- `observability-gap`: development or test exposes logs, pretty output, or
  diagnostics that production suppresses
- `runtime-contract-mismatch`: the code assumes a backend, browser, server, or
  asset contract exists in both modes when it does not
- `test-env-confusion`: the observed behavior belongs to `test`, which is a
  third runtime and should not be treated as either development or production

Lead with the root cause, then explain the symptom.

## المرجعية في المشروع

In this repository, treat these commands as distinct runtime surfaces:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm test:e2e
```

Interpret them as follows:

- `pnpm dev` exercises local development behavior and the local backend default
  path
- `pnpm build` checks production compilation and framework-owned build rules
- `pnpm preview` is the closest local production runtime for the app shell
- `pnpm test` runs under `NODE_ENV=test`, which is neither development nor
  production
- `pnpm test:e2e` may reproduce runtime issues, but only if its environment
  matches the target surface

Important repository-specific contracts:

- frontend file extraction falls back to a localhost backend only in
  development
- debug logging is enabled only in development
- production self-check is imported lazily to exercise production-facing paths
- test config forces `NODE_ENV=test` through a dedicated test environment file

## نقطة البداية السريعة

1. Identify which surface the user is talking about: development, preview,
   build, or test.
2. Read the owning code before running commands, especially any branch on
   `NODE_ENV` or endpoint resolution logic.
3. Reproduce the issue in the matching surface, not in a convenient one.
4. Map the difference to one root cause category.
5. Summarize what exists only in development, only in production, or only in
   test.

## سير العمل

### 1. Establish the Runtime Surface

- Ask what actually failed in practice: local editor flow, build, preview, CI,
  or tests.
- Treat `test` as separate unless the bug is explicitly about test behavior.
- Do not use a passing development run as evidence that production is healthy.

### 2. Find the Owning Branch

Inspect the nearest owner first:

- logging and diagnostics owners
- endpoint resolution code
- lazy imports and production self-check hooks
- backend URL derivation and fallback rules
- test-only configuration loaders

If the code branches on runtime, note the exact condition and what each branch
returns.

### 3. Detect Repository-Specific Drift

In this repository, check these patterns by default:

- localhost endpoint defaults that exist only in development
- empty endpoint behavior in production when no public environment variable is
  configured
- debug logs that disappear outside development
- production self-check paths that are requested once or only on specific UI
  triggers
- tests that appear similar to production but actually run with test-only
  configuration and logging

### 4. Reproduce in the Correct Mode

Use the narrowest relevant reproduction:

- dev-only claim: run the local development surface
- production build claim: run build, then preview if runtime confirmation is
  needed
- test-only claim: run the relevant test command under the test config

If development and preview disagree, treat preview as the better proxy for
production behavior.

### 5. Compare the Behavioral Contract

For each mode, capture:

- endpoint source
- log visibility
- feature path taken
- required environment variables
- whether the code fails loudly or silently

The goal is not only to say that behavior differs, but to explain what contract
is present in one mode and absent in another.

### 6. Deliver Findings

Use this structure:

```markdown
# Runtime Boundary Report

## Surface
- User-observed mode:
- Reproduced mode:

## Root Cause
- Category:
- Owning file:
- Boundary:

## Environment Comparison
- Development:
- Production or preview:
- Test:

## Evidence
- Branch:
- Default or required value:
- Why behavior diverges:

## Recommended Next Step
1. ...
2. ...
```

## إشارات المشروع

Use these clues when triaging:

- if a URL defaults to `127.0.0.1`, it is likely development-only unless a
  public environment variable overrides it
- if behavior depends on `NODE_ENV === "development"`, production and test are
  both excluded
- if a logger hides debug outside development, absence of debug output is not
  proof that a path never ran
- if preview behaves differently from development, prefer fixing the shared
  contract instead of extending development-only fallbacks

## قواعد التقرير

- State explicitly whether the observation belongs to development, production
  preview, or test.
- Do not call `test` a production simulation unless the code path is proven to
  be equivalent.
- Distinguish a missing production configuration from a logic bug.
- Prefer the owner of the branch over scattered symptom locations.
- If a development-only fallback masks a production requirement, name the
  fallback directly.

## المراجع

For comparison heuristics and repository-specific examples, see:

- [references/runtime-boundary-playbook.md](references/runtime-boundary-playbook.md)
