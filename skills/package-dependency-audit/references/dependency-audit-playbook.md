# Dependency Audit Playbook

## Detect the Package Manager

Use the first reliable signal you find:

1. `packageManager` in `package.json`
2. lockfile presence
3. workspace configuration files
4. repository conventions already used in scripts or docs

Common lockfiles:

- `pnpm-lock.yaml`
- `package-lock.json`
- `yarn.lock`

## Preferred Commands

Choose commands that match the detected package manager.

### pnpm

- outdated packages: `pnpm outdated --long`
- full graph snapshot: `pnpm list --depth 99`
- trace why a package exists: `pnpm why <package>`
- lockfile validation: `pnpm install --frozen-lockfile`

### npm

- outdated packages: `npm outdated`
- full graph snapshot: `npm ls --all`
- trace why a package exists: `npm explain <package>`
- lockfile validation: `npm ci`

### yarn

- outdated packages: `yarn outdated`
- trace why a package exists: `yarn why <package>`
- graph inspection: `yarn list`
- lockfile validation: use the repository's existing immutable install mode

## Missing Dependency Heuristics

When checking missing packages:

1. Search source, server, test, script, and config files for external imports.
2. Ignore relative imports, path aliases that resolve inside the repository, and
   built-in Node modules.
3. Convert subpath imports back to the root package.

Examples:

- `lodash/get` maps to `lodash`
- `date-fns/format` maps to `date-fns`
- `@scope/pkg/subpath` maps to `@scope/pkg`

If a package is imported from runtime code, it usually belongs in
`dependencies`. If it is imported only from tests, build scripts, lint config,
or developer tooling, it usually belongs in `devDependencies`.

## Conflict Heuristics

Investigate deeper when you see:

- multiple major versions of the same runtime library
- peer dependency warnings during install
- overrides or resolutions that pin around an upstream mismatch
- framework families that should move together but do not

Useful follow-up pattern:

1. identify the duplicated or incompatible package
2. trace each branch of the graph
3. find the top-level package pulling the older or conflicting version
4. decide whether to align versions, add an override, or keep the split

## Outdated Package Heuristics

Do not treat every outdated result as equally actionable.

- patch updates: usually low risk
- minor updates: often safe, but confirm framework notes
- major updates: assume behavioral risk until proven otherwise

Before recommending an upgrade:

1. check whether the package is part of a tightly coupled family
2. confirm whether types packages must move with runtime packages
3. verify whether the repository intentionally pins the version

## Unused Package Heuristics

A package may still be legitimate even if no direct import exists. Check for:

- CLI usage in scripts
- framework auto-loading
- config-only references
- code generation or build-time plugins
- transitive peer requirements that must remain declared

Treat unused-package findings as medium-confidence unless supported by multiple
signals.
