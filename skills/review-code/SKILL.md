---
name: review-code
description: 'Code-health audit — complexity, duplication, error handling, type invariants, patterns, naming, comment accuracy. Four modes: --review (full pass), --debt (tech-debt catalog), --consolidate (DRY + error-handling consolidation), --patterns (cross-codebase consistency). NOT for security vulns (/security) or performance profiling (/perf).'
---

# Code Quality Review

Load and follow the instructions in the `code-reviewer` agent.

**Usage:**
- `/review-code --review` — Full 7-dimension code-health pass (default if no flag)
- `/review-code --debt` — Tech-debt catalog sorted by leverage
- `/review-code --consolidate` — DRY + error-handling consolidation proposals (silent-failure hunter, extract-method suggestions, references Consolidation Catalog)
- `/review-code --patterns` — Cross-codebase pattern consistency audit (drift from established idioms)
- `/review-code src/auth/` — Review a specific directory

**The 7 dimensions scored on every `--review`:**
1. Complexity (function/file length, nesting, cyclomatic)
2. Duplication / DRY (copy-paste ratio, missing abstractions)
3. Error Handling (silent failures, broad catches, missing context)
4. Type Safety & Invariants (illegal states unrepresentable)
5. Pattern Consistency (consistency with codebase idioms)
6. Naming Quality (intent-revealing, booleans-as-questions)
7. Comment Accuracy (comments match code behavior)

**Outputs:**
- `--review` → `docs/reviews/CODE_REVIEW_<date>.md` + Health Dashboard
- `--debt` → `docs/reviews/TECH_DEBT_<date>.md` + "if you only fix 3 things" section
- `--consolidate` → `docs/reviews/CONSOLIDATION_<date>.md` + extract-method proposals
- `--patterns` → `docs/reviews/PATTERNS_<date>.md` + Pattern Map + Drift section

**Reference:** `references/code-health-checklist.md` (read at start of every invocation). Confidence-scored findings (suppress <75), verbatim code quotes from `read(filePath=...)`, asymmetric gate-loop (< 5 = fail, ≥ 7 = pass). Distinct from `/security` (vulns) and `/perf` (profiling).
