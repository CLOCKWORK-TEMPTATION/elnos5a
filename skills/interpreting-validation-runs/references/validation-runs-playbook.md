# Validation Runs Playbook

## Purpose

Use this reference when the main skill tells you to explain command output in a
root-cause-first way.

## Command Matrix

| Command | What it proves | What it cannot prove |
| --- | --- | --- |
| `pnpm lint` | Static rule compliance for the files in ESLint scope | Runtime correctness, type soundness beyond lint rules |
| `pnpm typecheck` | TypeScript-visible contract consistency | Runtime behavior, mocked module shape, build-only boundaries |
| `pnpm test` | Behavior under the current runner, environment, and mocks | Production bundling behavior or unsupported environments |
| `pnpm build` | Production compilation, bundling, and Next.js build-time checks | End-to-end runtime behavior after deployment |

## Signal Mapping

### `lint`

| Signal | Likely root cause | Interpretation tip |
| --- | --- | --- |
| Same rule repeated across many files | `rule-violation` or config drift | Check the shared abstraction or lint config owner before editing many files |
| One rule in one file | `rule-violation` | Usually a direct local fix |
| Autofix-safe wording | `rule-violation` | Mention that the failure may be mechanical |

### `typecheck`

| Signal | Likely root cause | Interpretation tip |
| --- | --- | --- |
| Missing exported member | `type-contract-break` | Usually import/export drift, not a test problem |
| Property does not exist | `type-contract-break` | Data model or API contract moved |
| Type not assignable | `type-contract-break` | Compare caller expectations with callee output |
| Cannot find module or alias | `type-contract-break` or config drift | Check `tsconfig.json` and related toolchain config |

### `test`

| Signal | Likely root cause | Interpretation tip |
| --- | --- | --- |
| `expected x to be y` | `behavior-regression` | Product behavior or stale expectation |
| `is not a function` | `type-contract-break` or `test-harness-break` | Decide whether the export changed or the mock shape is wrong |
| Mock export complaints | `test-harness-break` | Usually test setup, not product runtime |
| URL or path scheme exceptions | `test-harness-break` | Environment-specific path handling |
| Timeout or restart errors | `test-harness-break` or orchestration issue | Check async ownership and harness assumptions |

### `build`

| Signal | Likely root cause | Interpretation tip |
| --- | --- | --- |
| Compilation stopped | `build-pipeline-break` | Report the build blocker first |
| Prerender crash | `build-pipeline-break` | Usually server/client or data-fetch boundary |
| Warning with zero exit | Risk, not failure | Explain why it matters without misreporting status |

## Cross-Stage Heuristics

- If `lint` and `typecheck` pass but `test` fails, prefer product logic,
  runtime wiring, or harness analysis over config theory.
- If `typecheck` fails and `build` also fails, treat the type error as the
  earlier owner unless build reveals a distinct production-only problem.
- If `build` passes with warnings, keep the status as pass and record the
  warning under risk.
- If `test` emits many failures, cluster by repeated signal before summarizing.

## Report Style

Use short, high-signal summaries:

```markdown
- Command: pnpm test
- Status: failed
- Root cause: test-harness-break
- Evidence: No "default" export is defined on the "node:child_process" mock
- Owning area: test mock setup for the bridge module
- Next step: fix the mock shape, then rerun the affected test file
```

## Repo-Specific Notes

- `pnpm test` uses coverage and excludes end-to-end tests. Ignore coverage
  chatter unless the task is about coverage itself.
- `pnpm build` uses `next build`, which can surface warnings after a successful
  build. Record them separately from failures.
- `pnpm validate` does not include `pnpm build`; do not claim build health from
  `validate` alone.
