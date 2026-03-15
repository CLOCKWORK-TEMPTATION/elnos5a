---
name: toolchain-config-audit
description: Audits TypeScript, Next.js, ESLint, Tailwind, PostCSS, Vitest, Playwright, and related project configuration to find drift, contradictions, risky defaults, and broken cross-file contracts. Use when reviewing tsconfig, next.config, eslint.config, alias setup, include or exclude rules, runtime boundaries, or config regressions.
---

# تدقيق إعدادات سلسلة الأدوات

## متى تستخدم

Use this skill when the task is about understanding, reviewing, or fixing
project configuration, especially when the user asks to:

- analyze `tsconfig`
- inspect `next.config`
- review `eslint.config`
- explain why lint, typecheck, build, or tests disagree
- audit aliases, include or exclude patterns, or environment settings
- compare related config files instead of reading one file in isolation

## تصنيف الأسباب الجذرية

Do not treat config problems as isolated file mistakes. Classify findings under
one primary root cause:

- `alias-divergence`: import aliases or module resolution rules differ across
  tools
- `scope-divergence`: include, exclude, ignore, content, or test globs do not
  target the same source surface
- `execution-boundary-mismatch`: client, server, build, and test environments
  expect different runtimes or globals
- `strictness-erosion`: compiler or lint settings quietly allow avoidable
  problems
- `ownership-confusion`: the same concern is configured in multiple places
  without a clear source of truth
- `toolchain-drift`: one config evolved but its dependent configs did not

Lead with the root cause, then explain the visible symptom.

## المرجعية في المشروع

In this repository, treat these relationships as important by default:

- `tsconfig.json` owns TypeScript compiler behavior and path aliases
- `next.config.ts` owns Next.js runtime and bundler customizations
- `eslint.config.js` owns static analysis scope and rule intent
- `tailwind.config.ts` and `postcss.config.mjs` own styling pipeline coverage
- `vitest.config.ts`, `vite.config.ts`, and `playwright.config.ts` own local
  test execution behavior
- `package.json` scripts are the operational contract that ties these configs
  together

Do not review any one of them without checking the related contract files.

## نقطة البداية السريعة

1. Read the target config file and the configs that depend on the same concern.
2. Build a small contract matrix for aliases, scope, runtime, and scripts.
3. Identify the owning file for each concern before recommending changes.
4. Summarize contradictions, risks, and the smallest fix at the correct owner.

## سير العمل

### 1. Establish Scope

- Start with the file the user mentioned.
- Expand only to directly related configs that control the same behavior.
- For this repo, that usually means checking `package.json` and at least one of:
  `tsconfig.json`, `next.config.ts`, `eslint.config.js`,
  `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`,
  `vite.config.ts`, `playwright.config.ts`.

### 2. Build the Contract Matrix

For each concern below, note which file defines it and which files must stay in
sync with it:

- path aliases
- module resolution
- source inclusion and exclusion
- browser versus Node expectations
- generated directories and ignored outputs
- test discovery and environment selection
- script names and referenced config files

### 3. Review the Primary Config

Use the right lens for the file under review.

#### `tsconfig.json`

Check:

- `strict` and related safety options
- `module`, `moduleResolution`, and `jsx`
- path aliases and whether other tools mirror them
- `include` and `exclude` boundaries
- mixed JavaScript support such as `allowJs`
- plugins and framework-specific compiler assumptions

#### `next.config.ts`

Check:

- runtime toggles such as strict mode
- webpack or bundler alias overrides
- external package handling and server-only dependencies
- custom behavior that must stay aligned with TypeScript and test tooling

#### `eslint.config.js`

Check:

- file globs and ignored surfaces
- browser or Node globals
- rule intent versus actual repository architecture
- whether lint scope matches TypeScript and test scope

### 4. Review Related Configs

When the issue crosses boundaries, inspect the supporting configs as a system:

- `tailwind.config.ts`: content globs, exclusions, and token ownership
- `postcss.config.mjs`: plugin chain consistency with the styling pipeline
- `vitest.config.ts`: aliases, environment selection, setup files, and test
  scope
- `vite.config.ts`: alias handling and overlap with other test or build config
- `playwright.config.ts`: environment assumptions, base URL handling, and
  script coupling
- `package.json`: commands, package manager, and script-to-config references

### 5. Run Cross-File Consistency Checks

Always verify these before concluding:

- alias rules match across TypeScript, Next.js, Vite, and Vitest
- include, exclude, ignore, and content globs describe the same intended
  project surface
- browser and Node assumptions do not conflict between lint, build, and tests
- generated directories are either consistently ignored or intentionally
  included
- package scripts point to real config files and current command names

### 6. Deliver Findings

Use this structure:

```markdown
# Config Audit

## Root Cause
- Category:
- Owning file:
- Affected files:

## Findings
- File:
- Concern:
- Evidence:
- Risk:
- Recommended fix:

## Cross-File Contracts
- Contract:
- Status:
- Notes:

## Recommended Next Steps
1. ...
2. ...
```

## قواعد التدقيق

- Do not recommend edits until you know which file owns the behavior.
- Prefer root-cause fixes over duplicating the same setting in more places.
- Treat mismatched aliases and scope boundaries as high-risk because they hide
  future failures.
- If the user asks for fixes, change the smallest owning config first, then
  update dependent configs only when required.
- If a config appears redundant, verify that it is not serving a different
  execution path before suggesting removal.

## التحقق من الإصلاحات

Use the narrowest relevant verification after changes:

- type boundary issue: run the type checker
- lint scope issue: run the linter
- build or Next.js issue: run the build
- test config issue: run the narrowest relevant test command

Do not run broad validation without a reason tied to the suspected contract.

## المراجع

For detailed review checklists and contract patterns, see:

- [references/config-audit-playbook.md](references/config-audit-playbook.md)
