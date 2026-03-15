# Phase 0: Research & Outline

This document resolves unknowns and maps dependencies for the Unified Reception Pipeline feature.
Based on the `spec.md` and `plan.md`, there are no major unknowns ("NEEDS CLARIFICATION") as the requirements and constraints were fully clarified during the `speckit.clarify` session.

## Architecture Decisions

### 1. Unified Entry Point (الخدمة المشتركة)

- **Decision**: All three input paths (Paste, Old Doc, Modern Doc) will send their raw text to a single backend endpoint (e.g., `/api/text-extract` or the existing Karank engine router).
- **Rationale**: Ensures the exact same HMM/Karank processing logic is applied to all text sources, eliminating divergence between direct `parseDocx` and standard paste.
- **Alternatives considered**: Keeping `parseDocx` but mapping its output to match Karank output. Rejected because it violates the "Single Source of Truth" pipeline principle and maintains dead/divergent code.

### 2. Dead Code Elimination

- **Decision**: Fully delete the old review layer codebase and the direct `parseDocx` parsing logic.
- **Rationale**: Mandated by FR-007, FR-010, and SC-008 to prevent accidental regressions.
- **Alternatives considered**: Commenting out or wrapping in a feature flag. Rejected as it violates FR-010.

### 3. Background Processing & State

- **Decision**: Local classification executes synchronously to display immediate content. Suspicion and Review layers will execute asynchronously in the background. If they fail, a silent error (toast) is shown without altering the editor state.
- **Rationale**: Mandated by FR-014 and FR-015 for optimal UX.

### 4. Logging & Observability

- **Decision**: Implement step-by-step logging tracking the start/end of each pipeline stage and the full error stack if a failure occurs.
- **Rationale**: Mandated by FR-017 and SC-010 to ensure production readiness.
