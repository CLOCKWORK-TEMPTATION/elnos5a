# Runtime Boundary Playbook

## Purpose

Use this reference when the main skill tells you to compare development,
production, preview, and test behavior in a root-cause-first way.

## Repository Signals

### Development-only defaults

These code paths provide a localhost fallback only in development:

```ts
process.env.NODE_ENV === "development"
```

Typical effect:

- local extraction endpoints resolve automatically during development
- production requires an explicit public environment variable instead of a
  silent localhost default

### Development-only observability

Debug logging is gated by a development check.

Typical effect:

- a missing debug line in production does not mean the feature path was skipped
- production diagnosis must rely on info, warn, error, or explicit self-check
  reporting

### Test is a third mode

This repository forces test configuration with:

```ts
NODE_ENV: "test"
```

Typical effect:

- test logging and environment values differ from both development and
  production
- a passing test does not automatically validate the development fallback or
  the production runtime contract

### Production self-check

Production-facing verification is triggered through a lazy import and is
designed to probe production-oriented paths without assuming development-only
diagnostics.

Typical effect:

- the self-check is useful evidence when development appears healthy but the
  packaged flow is suspect

## Command Heuristics

| Goal | Best command surface |
| --- | --- |
| Confirm local editing behavior | `pnpm dev` |
| Confirm production compilation | `pnpm build` |
| Confirm local production-like runtime | `pnpm preview` |
| Confirm isolated behavioral contract | focused `pnpm test` command |
| Confirm browser runtime after app start | `pnpm test:e2e` |

## Diagnostic Questions

Ask these in order:

1. Does the code branch on runtime?
2. Does development supply a default that production does not?
3. Is the missing signal merely a logging difference?
4. Is the observed result actually from test mode?
5. Does preview reproduce the production claim?

## Report Pattern

```markdown
- Category: local-dev-fallback
- Owning file: endpoint resolution module
- Development: falls back to localhost extraction backend
- Production: requires explicit public backend URL
- Test: separate config, not proof of production
- Next step: remove the hidden assumption or make the requirement explicit
```
