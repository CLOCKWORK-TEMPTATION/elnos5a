# Config Audit Playbook

## Default Review Order

Use this order unless the user gives a narrower target:

1. `package.json`
2. `tsconfig.json`
3. `next.config.ts`
4. `eslint.config.js`
5. test and styling configs that depend on the same concerns

This keeps ownership clear before you judge downstream behavior.

## Contract Checklist

### Alias Contract

Check whether the same alias appears consistently in:

- `tsconfig.json`
- `next.config.ts`
- `vite.config.ts`
- `vitest.config.ts`
- any runtime code that assumes the alias exists

If one tool resolves `@` differently from another, treat that as
`alias-divergence`.

### Scope Contract

Compare:

- `include` and `exclude` in `tsconfig.json`
- `ignores` and `files` in `eslint.config.js`
- `content` in `tailwind.config.ts`
- `include`, `exclude`, and environment globs in `vitest.config.ts`
- `testDir` and `testMatch` in `playwright.config.ts`

If a directory is intentionally excluded in one tool but still covered in
another, decide whether that is an intentional boundary or drift.

### Runtime Contract

Check whether browser and Node assumptions align:

- browser globals in lint config
- server-only packages in Next.js config
- `jsdom` versus `node` test environments
- `.mjs` server files versus TypeScript compiler assumptions

If server code is analyzed like browser code, or vice versa, classify it as
`execution-boundary-mismatch`.

## File-Specific Heuristics

### `tsconfig.json`

Investigate carefully when you see:

- `allowJs` enabled in a mostly TypeScript codebase
- broad `include` patterns with narrow exclusions
- aliases defined here but not mirrored in bundler or test config
- framework plugins without corresponding framework ownership

### `next.config.ts`

Investigate carefully when you see:

- webpack alias overrides that duplicate or diverge from TypeScript paths
- `serverExternalPackages` that affect deployment or bundling assumptions
- Node-only packages exposed to paths that may execute on the client

### `eslint.config.js`

Investigate carefully when you see:

- global environment set only for browser in a mixed browser and server repo
- ignore patterns that hide meaningful source code
- rules that enforce one architecture while scripts or tests assume another

### Related Configs

Review them when they touch the same concern:

- `tailwind.config.ts` for coverage of actual component paths
- `postcss.config.mjs` for pipeline compatibility
- `vitest.config.ts` and `vite.config.ts` for alias and environment overlap
- `playwright.config.ts` for dev server, base URL, and output behavior

## Report Quality Rules

Every finding should answer:

1. what is inconsistent
2. why that inconsistency matters
3. which file should own the fix
4. what minimal change restores the contract

Avoid vague statements such as "config looks messy" or "this may be wrong."
Tie each claim to a specific contract and impact.
