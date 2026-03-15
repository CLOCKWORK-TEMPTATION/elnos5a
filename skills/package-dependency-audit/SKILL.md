---
name: package-dependency-audit
description: Audits JavaScript and TypeScript package manifests to find outdated, conflicting, missing, misclassified, and unused dependencies with root-cause analysis. Use when inspecting package.json, lockfiles, peer dependency issues, package drift, broken installs, or import-to-package mismatches.
---

# تدقيق تبعيات الحزم

## متى تستخدم

Use this skill when the task involves dependency health in a JavaScript or
TypeScript repository, especially when the user asks to:

- inspect `package.json`
- find outdated packages
- detect dependency conflicts
- identify missing or misclassified dependencies
- explain peer dependency problems
- review lockfile drift or install failures

## تصنيف الأسباب الجذرية

Do not stop at symptoms. Classify each issue under one primary cause:

- `graph-conflict`: incompatible versions or unmet peer requirements in the
  resolved dependency graph
- `manifest-drift`: imported packages are missing from the manifest, or the
  manifest declares packages not reflected in actual usage
- `boundary-misclassification`: runtime packages live in `devDependencies`, or
  build/test-only packages live in `dependencies`
- `update-lag`: packages are behind supported or desirable versions
- `lockfile-divergence`: `package.json` and the lockfile no longer represent
  the same install state

Lead with the cause, then explain the visible symptom.

## نقطة البداية السريعة

1. Detect the package manager and repository scope.
2. Read the relevant manifest and lockfile before making claims.
3. Audit conflicts, outdated packages, missing packages, and dependency
   placement.
4. Summarize findings by category, evidence, impact, and recommended next step.

## سير العمل

### 1. Establish Scope

- Detect whether the repository is a single package or a workspace/monorepo.
- Inspect the root manifest first, then any package-specific manifests touched
  by the task.
- Treat `packageManager`, lockfiles, workspace config, and override rules as
  part of the dependency contract.

### 2. Snapshot the Manifest

Capture the following before auditing:

- `dependencies`
- `devDependencies`
- `peerDependencies`
- `optionalDependencies`
- overrides or resolutions
- local protocols such as `workspace:`, `file:`, or `link:`

### 3. Check for Conflicts

Look for:

- multiple major versions of critical runtime libraries
- unmet or invalid peer dependency relationships
- overrides or resolutions masking an underlying mismatch
- framework-coupled packages that have drifted apart

Always trace suspicious packages back to the reason they are installed.

### 4. Check for Outdated Packages

- Use the package manager's native outdated command.
- Separate safe-looking patch or minor updates from risky major upgrades.
- Do not recommend broad upgrades blindly when framework coupling exists.
- Call out when an outdated package is intentionally pinned by a lockstep
  ecosystem.

### 5. Check for Missing or Misclassified Packages

- Compare actual external imports against declared dependencies.
- Ignore relative imports, aliases that resolve internally, and Node built-ins.
- Map subpath imports back to their root package before comparing.
- Runtime code in application or server paths should not rely only on
  `devDependencies`.
- Build, test, lint, and code generation tooling usually belongs in
  `devDependencies`.
- If the repository already uses a tool such as `knip`, prefer it before adding
  new tooling.

### 6. Check for Unused or Drifted Entries

- Flag declared packages with no convincing usage signal.
- Distinguish truly unused packages from transitive, generated, or
  configuration-only dependencies.
- Verify whether the lockfile changed without a matching manifest change, or
  vice versa.

### 7. Deliver Findings

Use this structure:

```markdown
# Dependency Audit

## Conflicting
- Package:
- Evidence:
- Root cause:
- Risk:
- Next step:

## Outdated
- Package:
- Current:
- Wanted or latest:
- Upgrade risk:
- Recommendation:

## Missing
- Package:
- Imported from:
- Expected section:
- Root cause:

## Misclassified
- Package:
- Current section:
- Expected section:
- Evidence:

## Unused
- Package:
- Why it looks unused:
- Confidence:

## Lockfile Drift
- Evidence:
- Impact:

## Recommended Next Steps
1. ...
2. ...
```

## قواعد التدقيق

- Prefer manager-native commands over generic guesses.
- Prefer repository-installed tooling over adding temporary packages.
- For monorepos, report whether the issue is root-wide or package-local.
- Include evidence for each finding: file path, import site, command result, or
  lockfile clue.
- Do not convert observations into edits unless the user asks for fixes.
- If the user asks for fixes, propose the smallest change that resolves the
  root cause.

## فحوصات الارتباط الوثيق

Be especially careful with version coupling in these families:

- `react`, `react-dom`, framework adapters
- `next`, React versions, and related type packages
- `typescript`, `typescript-eslint`, ESLint core, and parser plugins
- editor ecosystems such as `@tiptap/*`
- SDK families published under the same vendor scope

## المراجع

For command selection and comparison heuristics, see:

- [references/dependency-audit-playbook.md](references/dependency-audit-playbook.md)
