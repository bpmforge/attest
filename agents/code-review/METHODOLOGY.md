# Code Reviewer — Deep Methodology

> Load when starting a full code review (--review, --debt, --consolidate, --patterns).
> Contains: 8 dimension passes, phase execution details, Health Dashboard format,
> Reader Simulation, confidence gates, scoring criteria.
> Context cost: ~8k tokens.

---

## Subtask List (every mode)

```
[1] Read references/code-health-checklist.md — PENDING
[2] Detect language/framework (package.json, Cargo.toml, go.mod, etc.) — PENDING
[3] Phase 1: Understand codebase patterns (read 3-5 files) — PENDING
[4] Phase 2: Run linter + complexity tools (if available) — PENDING
[5] Phase 3: Pass 1 — Complexity — PENDING
[6] Phase 3: Pass 2 — Duplication / DRY — PENDING
[7] Phase 3: Pass 3 — Error Handling (Silent-Failure Hunter) — PENDING
[8] Phase 3: Pass 4 — Type Safety & Invariants — PENDING
[9] Phase 3: Pass 5 — Pattern Consistency — PENDING
[10] Phase 3: Pass 6 — Naming Quality — PENDING
[11] Phase 3: Pass 7 — Comment Accuracy — PENDING
[12] Phase 4: Cross-cutting pattern analysis — PENDING
[13] Phase 5: Write report with Health Dashboard — PENDING
[14] Phase 6: Gate-loop (confidence per dimension) — PENDING
[15] Phase 7: Reader simulation pass — PENDING
```

Each mode follows all 15 subtasks. In `--debt`, `--consolidate`, and `--patterns`, steps 5-11 still run but the report emphasizes a different dimension.

---

## Phase 1: Understand the Codebase

Before reviewing any code:

- Read CLAUDE.md / AGENTS.md for project conventions
- Use `glob-mcp` to understand structure: `src/**/*.ts`, `tests/**/*.py`, etc.
- Read 3-5 files in the same module to learn established patterns: naming, error handling, state management, test shape
- Check `docs/reviews/` for prior findings — have you reviewed this codebase before? Don't re-raise resolved issues
- Record your baseline: "This project uses Result types, camelCase, Fastify handlers, Zod validation, Jest tests"

**After completing Phase 1 — initialize the tracker (MANDATORY before Phase 2):**

```
mkdir -p docs/reviews
write(filePath="docs/reviews/CODE_HEALTH_TRACKER.md", content="
# Code Health Tracker
<!-- Written by code-reviewer at Phase 1. Updated after every dimension pass.
     Survives context loss — read this file to resume an interrupted review. -->

**Date:** <YYYY-MM-DD>
**Project:** <project name>
**Language:** <detected language + framework>
**Mode:** <--review | --debt | --consolidate | --patterns>
**Scope:** <files/modules under review>
**Reviewer:** code-reviewer agent

---

## Progress Summary

| # | Dimension            | Status      | Score | Findings | Confidence |
|---|----------------------|-------------|-------|----------|-----------|
| 1 | Complexity           | ⏳ PENDING  | —     | —        | —         |
| 2 | Duplication / DRY    | ⏳ PENDING  | —     | —        | —         |
| 3 | Error Handling       | ⏳ PENDING  | —     | —        | —         |
| 4 | Type Safety          | ⏳ PENDING  | —     | —        | —         |
| 5 | Pattern Consistency  | ⏳ PENDING  | —     | —        | —         |
| 6 | Naming Quality       | ⏳ PENDING  | —     | —        | —         |
| 7 | Comment Accuracy     | ⏳ PENDING  | —     | —        | —         |
| 8 | Anti-Slop            | ⏳ PENDING  | —     | —        | —         |

**Overall score:** ⏳ pending all passes
**Verdict:** ⏳ pending

---

## Tool Results
<!-- Filled in at Phase 2 -->
Linter: ⏳
Complexity tool: ⏳
Duplication tool: ⏳
Tool findings to investigate: ⏳

---

## Codebase Baseline
<!-- Filled in at Phase 1 -->
Language: <detected>
Framework: <detected>
Naming convention: <camelCase / snake_case / etc.>
Error handling style: <Result types / exceptions / error codes>
Key files read: <list>
Prior reviews found: <yes/no — if yes, list resolved issues to avoid re-raising>

---

## Pass Detail

### Pass 1 — Complexity
Status: ⏳ PENDING
Files examined: —
Tool flags: —
Findings: —
Pass log: —
Score: —  |  Confidence: —  |  Verdict: —

---

### Pass 2 — Duplication / DRY
Status: ⏳ PENDING
Files examined: —
Tool flags: —
Findings: —
Pass log: —
Score: —  |  Confidence: —  |  Verdict: —

---

### Pass 3 — Error Handling
Status: ⏳ PENDING
Files examined: —
Catch blocks examined: —
Silent failures found: —
Pass log: —
Score: —  |  Confidence: —  |  Verdict: —

---

### Pass 4 — Type Safety & Invariants
Status: ⏳ PENDING
Files examined: —
Language-specific tripwires checked: —
Findings: —
Pass log: —
Score: —  |  Confidence: —  |  Verdict: —

---

### Pass 5 — Pattern Consistency
Status: ⏳ PENDING
Files examined: —
Pattern baseline established: —
Drift instances: —
Pass log: —
Score: —  |  Confidence: —  |  Verdict: —

---

### Pass 6 — Naming Quality
Status: ⏳ PENDING
Files examined: —
Findings: —
Pass log: —
Score: —  |  Confidence: —  |  Verdict: —

---

### Pass 7 — Comment Accuracy
Status: ⏳ PENDING
Files examined: —
Stale TODO/FIXME count: —
Misleading comments: —
Pass log: —
Score: —  |  Confidence: —  |  Verdict: —

---

## Cross-Cutting Patterns
<!-- Filled in at Phase 4 -->
_Not yet analyzed._

## Final Health Dashboard
<!-- Filled in at Phase 5 — mirrors the report's Health Dashboard table -->
_Not yet written._
")
```

Then fill in the Codebase Baseline section with what you learned (language, framework, naming convention, error handling style, key files read, prior reviews):
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="Language: <detected>\nFramework: <detected>\nNaming convention: <camelCase / snake_case / etc.>\nError handling style: <Result types / exceptions / error codes>\nKey files read: <list>\nPrior reviews found: <yes/no — if yes, list resolved issues to avoid re-raising>",
  newString="Language: <actual detected language>\nFramework: <actual framework>\nNaming convention: <what you found>\nError handling style: <what you found>\nKey files read: <actual list>\nPrior reviews found: <yes/no with details>")
```

## Phase 1b: Language-Specific Best Practices

Detect the primary language from `package.json` / `Cargo.toml` / `go.mod` / `requirements.txt` / `pyproject.toml`.

If the checklist doesn't cover the detected language in enough depth, use `websearch`:
- `"[language] code quality anti-patterns [current year]"` — language-specific anti-patterns
- `"[framework] common mistakes"` — framework-specific pitfalls

Record the language-specific checks you will apply. Add them to your pass criteria.

## Phase 2: Run Tools First

Check for and run the project's linter + complexity tools. **Tool output is a starting point for WHERE to look, not a final verdict.** For each tool finding, read the flagged file:line and decide if it's a real issue or a false positive.

```bash
# TypeScript/JavaScript
ls .eslintrc* eslint.config.* biome.json 2>/dev/null
npx eslint src/ --format json -o docs/reviews/eslint-results.json 2>/dev/null
npx biome check src/ --reporter json > docs/reviews/biome-results.json 2>/dev/null

# Python
ls pyproject.toml setup.cfg .ruff.toml 2>/dev/null
ruff check . --output-format json > docs/reviews/ruff-results.json 2>/dev/null
radon cc -s -a -j src/ > docs/reviews/radon-cc.json 2>/dev/null

# Rust
ls Cargo.toml 2>/dev/null && cargo clippy --message-format json 2> docs/reviews/clippy-results.json

# Go
ls go.mod 2>/dev/null && golangci-lint run --out-format json ./... > docs/reviews/golangci.json 2>/dev/null
gocyclo -over 10 . 2>/dev/null > docs/reviews/gocyclo.txt

# Duplication (any language)
npx jscpd src/ --min-lines 5 --min-tokens 50 --reporters json --output docs/reviews/jscpd 2>/dev/null
```

If none of the tools are available, say so explicitly in the report under `**Method:** Static only — no linter`. Your findings are still valid; they just need more manual verification.

**After running tools — update the tracker (MANDATORY before Phase 3):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="Linter: ⏳\nComplexity tool: ⏳\nDuplication tool: ⏳\nTool findings to investigate: ⏳",
  newString="Linter: <tool name + version, or 'not available'>\nComplexity tool: <tool name + version, or 'not available'>\nDuplication tool: <jscpd result summary, or 'not available'>\nTool findings to investigate: <N total flagged — list top files/lines worth reading>")
```

## Phase 3: The 7 Passes

**Resume check — read the tracker first:**
```
read(filePath="docs/reviews/CODE_HEALTH_TRACKER.md")
```
Any pass showing `✅ DONE` in the Progress Summary — skip it, its findings are already in the report file.
Any pass showing `🔄 RE-PASS` — resume that pass, it scored < 7 last time.
Any pass showing `⏳ PENDING` — run it now.
`⚠️ BLOCKED` passes (confidence < 5 after 3 attempts) — surface to user before continuing.

Follow the order and rules in `references/code-health-checklist.md`. Each pass targets ONE dimension. Score the dimension 1-10 after the pass. Write findings to the report file immediately.

**Before writing any finding:** use `read(filePath=..., offset=..., limit=...)` on the exact file:line range and paste the verbatim lines in the "Current code" block. Never paraphrase, never reconstruct from memory.

---

**Pass 1 — Complexity**

Run the complexity tools from the checklist for the detected language. Flag every function/file exceeding the language thresholds. Read each flagged location — is the complexity real or a false positive from generated/test code?

**After scoring — update the tracker (MANDATORY before Pass 2):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="| 1 | Complexity           | ⏳ PENDING  | —     | —        | —         |",
  newString="| 1 | Complexity           | <STATUS>   | <N>/10 | <COUNT>  | <CONF>/10 |")
```
Update Pass 1 detail section: files examined, tool flags, findings summary, pass log entry (`Pass <N> — <date> — score <X>/10 — <one-sentence>`).
If confidence < 7: status `🔄 RE-PASS <N>` — re-run targeting largest files and deepest nesting.
If confidence ≥ 7: status `✅ DONE`.
If confidence < 5 after 3 passes: status `⚠️ BLOCKED` — surface gap to user immediately.

---

**Pass 2 — Duplication / DRY**

Run `jscpd` (or equivalent) and read every flagged location. For each duplicate block: trace all instances, write a concrete extract-method proposal. "Looks similar" without reading both is not a finding.

**After scoring — update the tracker (MANDATORY before Pass 3):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="| 2 | Duplication / DRY    | ⏳ PENDING  | —     | —        | —         |",
  newString="| 2 | Duplication / DRY    | <STATUS>   | <N>/10 | <COUNT>  | <CONF>/10 |")
```
Update Pass 2 detail section: tool flags, instances found, extraction proposals, pass log entry.
If confidence < 7: `🔄 RE-PASS` — grep for the duplicate snippets manually to find what the tool missed.
If confidence ≥ 7: `✅ DONE`. If < 5 after 3: `⚠️ BLOCKED`.

---

**Pass 3 — Error Handling (Silent-Failure Hunter)**

Grep for every catch/except block. For EACH one: enumerate what the try block can throw, which errors the catch handles specifically, and which it silently swallows. This is the most important pass — do not rush it.

```
grep-mcp --pattern "catch\s*\(|except\s|\.catch\s*\(|rescue\s" --recursive
```

**After scoring — update the tracker (MANDATORY before Pass 4):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="| 3 | Error Handling       | ⏳ PENDING  | —     | —        | —         |",
  newString="| 3 | Error Handling       | <STATUS>   | <N>/10 | <COUNT>  | <CONF>/10 |")
```
Update Pass 3 detail section: catch blocks examined (list count), silent failures found (list file:line), pass log entry.
If confidence < 8 (error handling is the highest-risk dimension — threshold raised): `🔄 RE-PASS` on async paths specifically.
If confidence ≥ 8: `✅ DONE`. If < 5 after 3: `⚠️ BLOCKED`.

---

**Pass 4 — Type Safety & Invariants**

Check for the language-specific tripwires from the checklist: `any`, `!` assertions, `unwrap()`, `interface{}`, raw types, `Optional` overuse. For each: read the site, is it at a real trust boundary or just laziness?

```
grep-mcp --pattern "any\b|as any|@ts-ignore|ts-nocheck|unwrap\(\)|\.expect\(|interface{}" --recursive
```

**After scoring — update the tracker (MANDATORY before Pass 5):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="| 4 | Type Safety          | ⏳ PENDING  | —     | —        | —         |",
  newString="| 4 | Type Safety          | <STATUS>   | <N>/10 | <COUNT>  | <CONF>/10 |")
```
Update Pass 4 detail section: tripwires checked, language-specific findings, pass log entry.
If confidence < 7: `🔄 RE-PASS` reading the type definitions for the top 3 domain entities.
If confidence ≥ 7: `✅ DONE`. If < 5 after 3: `⚠️ BLOCKED`.

---

**Pass 5 — Pattern Consistency**

Read 3-5 files across different modules to establish what "normal" looks like for this codebase. Then grep for drift — async style, DI vs hardcoded, naming conventions, error return shapes.

**After scoring — update the tracker (MANDATORY before Pass 6):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="| 5 | Pattern Consistency  | ⏳ PENDING  | —     | —        | —         |",
  newString="| 5 | Pattern Consistency  | <STATUS>   | <N>/10 | <COUNT>  | <CONF>/10 |")
```
Update Pass 5 detail section: pattern baseline established (list the conventions found), drift instances, pass log entry.
If confidence < 7: `🔄 RE-PASS` — read more cross-module files to confirm the baseline.
If confidence ≥ 7: `✅ DONE`. If < 5 after 3: `⚠️ BLOCKED`.

---

**Pass 6 — Naming Quality**

Grep for generic names and abbreviations. For each: is the name clear from the call site without reading the implementation?

```
grep-mcp --pattern "\bdata\b|\binfo\b|\btemp\b|\btmp\b|\bres\b|\bobj\b|\bval\b|\bflag\b|\bn\b|\bx\b" --recursive
```

**After scoring — update the tracker (MANDATORY before Pass 7):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="| 6 | Naming Quality       | ⏳ PENDING  | —     | —        | —         |",
  newString="| 6 | Naming Quality       | <STATUS>   | <N>/10 | <COUNT>  | <CONF>/10 |")
```
Update Pass 6 detail section: files examined, misleading names found, generic names flagged, pass log entry.
If confidence < 7: `🔄 RE-PASS` on public API surface (exported functions, class methods, route handlers).
If confidence ≥ 7: `✅ DONE`. If < 5 after 3: `⚠️ BLOCKED`.

---

**Pass 7 — Comment Accuracy**

Run the stale TODO/FIXME detection from the checklist. Read every comment in the reviewed files — does it still match the code? JSDoc/docstring parameter lists against actual signatures.

```
grep-mcp --pattern "TODO|FIXME|XXX|HACK|@deprecated|NOTE:" --recursive
```

**After scoring — update the tracker (MANDATORY before Phase 4):**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="| 7 | Comment Accuracy     | ⏳ PENDING  | —     | —        | —         |",
  newString="| 7 | Comment Accuracy     | <STATUS>   | <N>/10 | <COUNT>  | <CONF>/10 |")
```
Update Pass 7 detail section: stale TODO/FIXME count and ages, misleading comments found, pass log entry.
If confidence < 7: `🔄 RE-PASS` running `git blame` on the oldest TODO entries.
If confidence ≥ 7: `✅ DONE`. If < 5 after 3: `⚠️ BLOCKED`.

## Phase 4: Cross-Cutting Pattern Analysis

Group findings by root cause. If the same issue appears in 3+ places, promote it from individual findings to an architectural observation in the **Pattern Analysis** section. The per-file findings stay, but the report highlights that they share one fix.

**After cross-cutting analysis — update the tracker:**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="## Cross-Cutting Patterns\n<!-- Filled in at Phase 4 -->\n_Not yet analyzed._",
  newString="## Cross-Cutting Patterns\n<List each architectural pattern found: name, instances (file:line list), root cause, recommended consolidation, effort>")
```

## Phase 5: Write the Health Report

Use the Health Dashboard template from the checklist. Score all 8 dimensions (include anti-slop), then compute the overall score. Apply the verdict rubric.

**After writing the report — mirror the Health Dashboard into the tracker:**
```
Edit(filePath="docs/reviews/CODE_HEALTH_TRACKER.md",
  oldString="## Final Health Dashboard\n<!-- Filled in at Phase 5 — mirrors the report's Health Dashboard table -->\n_Not yet written._",
  newString="## Final Health Dashboard\n\n| Dimension | Score | Status | Top Issue |\n|---|---|---|---|\n| Complexity | <N>/10 | <emoji> | <issue> |\n| Duplication / DRY | <N>/10 | <emoji> | <issue> |\n| Error Handling | <N>/10 | <emoji> | <issue> |\n| Type Safety | <N>/10 | <emoji> | <issue> |\n| Pattern Consistency | <N>/10 | <emoji> | <issue> |\n| Naming Quality | <N>/10 | <emoji> | <issue> |\n| Comment Accuracy | <N>/10 | <emoji> | <issue> |\n| **Overall** | **<avg>**/10 | <emoji> | <top 3 summary> |\n\n**Verdict:** <APPROVED | APPROVED WITH SUGGESTIONS | NEEDS REVISION | REJECT>\n**Report file:** docs/reviews/<filename>")
```

**Verdict rubric:**

| Verdict | Criteria |
|---|---|
| **APPROVED** | All dimensions ≥7 (anti-slop ≥8), 0 HIGH, pattern violations ≤1 |
| **APPROVED WITH SUGGESTIONS** | All dimensions ≥6, HIGH ≤2 (with concrete fixes), pattern violations ≤3 |
| **NEEDS REVISION** | Any dimension ≤4, OR HIGH >2, OR functions >100 lines, OR any swallowed error in a critical path |
| **REJECT** | Multiple dimensions ≤4, systemic architectural problems, data-loss risk |

## Phase 6: Confidence Gate-Loop (asymmetric)

All 8 tracker rows should now be `✅ DONE` or `⚠️ BLOCKED`. Read the tracker to verify:
```
read(filePath="docs/reviews/CODE_HEALTH_TRACKER.md")
```

From the tracker's Progress Summary table, extract and print the final confidence table:

```
| Dimension            | Score | Confidence | Passes | Status      |
|----------------------|-------|-----------|--------|-------------|
| Complexity           | X/10  | X/10      | N      | ✅/🔄/⚠️   |
| Duplication / DRY    | X/10  | X/10      | N      | ...         |
| Error Handling       | X/10  | X/10      | N      | ...         |
| Type Safety          | X/10  | X/10      | N      | ...         |
| Pattern Consistency  | X/10  | X/10      | N      | ...         |
| Naming Quality       | X/10  | X/10      | N      | ...         |
| Comment Accuracy     | X/10  | X/10      | N      | ...         |
| Anti-Slop            | X/10  | X/10      | N      | ...         |
```

Any dimension still showing `⏳ PENDING` means the tracker was not updated — go back and run that pass now.

Confidence rules (applied per dimension):

- **Score < 5** on any dimension = **automatic fail** — STOP, surface to user with the specific gap. Do NOT iterate.
- **Score 5-6** = revise that specific pass (max 3 revision passes). Update the tracker to `🔄 RE-PASS <N>`.
- **Score ≥ 7** = pass. Mark `✅ DONE` in tracker.
- After 3 revision passes still < 7, set tracker status to `⚠️ BLOCKED` and surface to the user:
  - The specific question you could not answer
  - Which files you'd need to read to answer it
  - What additional context would resolve it

**Error Handling (Pass 3) uses a raised threshold of 8** — it is the highest-risk dimension. If < 8 after pass 1, re-pass on async paths specifically.

Do NOT write the final report until all 7 tracker rows show ✅ DONE (or ⚠️ BLOCKED — user must clear blockers first).

## Phase 7: Reader Simulation

Before declaring done, re-read your report as a skeptical fresh reader who hasn't seen your work:

- Flag any claim without a file:line reference
- Flag jargon that isn't defined
- Flag unsupported superlatives ("the biggest issue", "always", "never") — verify or remove
- Flag missing expected sections
- If you'd ask a question reading this cold, add the answer before delivering

---

## Anti-Slop Audit (8th Dimension — Mandatory Pass)

**Canonical rules:** `agents/shared/ANTI_SLOP_RULES.md` — read it before running this pass. All 20 rules (R-01 through R-20) apply.

This is the 8th scored dimension alongside the 7 in `references/code-health-checklist.md`. Score it 1-10 using the scoring guide in ANTI_SLOP_RULES.md § Anti-Slop Scoring.

**Pass order:** Run after complexity (Pass 1) and before patterns (Pass 5). Reason: slop findings often overlap with complexity and pattern findings — audit slop third to avoid triple-flagging the same line.

**Quick scan — script-enforced rules (always run first):**
```bash
bash scripts/validators/validate-code-health.sh .
```
Script catches: R-01 (catch-all), R-02 (try in loops), R-13 (what-comments), R-16 (emojis), H-01 (functions >50L), H-02 (files >250L), H-03 (TODO/FIXME), H-04 (debug prints), H-05 (magic numbers).

**Manual review — rules requiring judgment:**
- R-03 exception-driven control flow (grep for `JSON.parse` in catch, `Number()` without guard)
- R-04 serial awaits (grep for consecutive `await` lines without `Promise.all`)
- R-05 single-implementation interfaces (check: does the interface have >1 impl?)
- R-06 delegation-only wrappers (check: does the class add any logic?)
- R-07 single-use helpers (grep: is this function called in >1 place?)
- R-08 repository on CRUD (check: does the layer add logic beyond the ORM call?)
- R-17 speculative generalization (check: does the spec require this parameter/option?)
- R-18 cargo-cult patterns (check: is this pattern required by DESIGN_CONTEXT.md or SRS.md?)
- R-19 copy-paste duplication (look for identical 4+ line blocks across files)
- R-20 pattern inconsistency (check: does this file use a different pattern than the rest of the module?)

**Scoring threshold:** anti-slop dimension uses the same raised threshold as error handling — **≥8 to pass** (not 7). AI slop is systemic; a score of 7 means violations present.

---

## Mode Specifics

### `--review` (default)
Full health pass across all 8 dimensions. Output: `docs/reviews/CODE_REVIEW_<YYYY-MM-DD>.md` with the full Health Dashboard, all findings, Pattern Analysis, and Verdict.

### `--debt`
Tech-debt catalog mode. Run the same 7 passes but prioritize findings by `(blocked_work × priority) / cost_to_fix`. Output: `docs/reviews/TECH_DEBT_<YYYY-MM-DD>.md` with one DEBT-NNN item per finding, sorted by leverage. Use the template in the checklist's "Tech Debt Register" section. Include a section at the top: "If you only fix 3 things this sprint, fix these."

### `--consolidate`
DRY + error-handling consolidation mode. Passes 2 (Duplication) and 3 (Error Handling) get full weight; others run but findings go in an appendix. Output: `docs/reviews/CONSOLIDATION_<YYYY-MM-DD>.md`. Every finding MUST reference a pattern from the Consolidation Catalog in the checklist (central error boundary, Result type, middleware, custom error class, decorator, defer/finally). Include concrete extract-method proposals with: name, signature, caller list, effort estimate.

### `--patterns`
Cross-codebase consistency mode. Read 8-12 files across different modules first to build a pattern map. Then every finding is about drift from the established pattern. Output: `docs/reviews/PATTERNS_<YYYY-MM-DD>.md` with a "Pattern Map" section (what the project's conventions ARE) followed by a "Drift" section (where the code diverges). This mode suppresses individual-code findings below confidence 85 — the focus is systemic drift only.

---

## Verifier Isolation

When reviewing code produced by another agent or an automated process, evaluate ONLY the artifact. Do not ask for or consider the producing agent's reasoning chain — form your own independent assessment. Agreement bias from seeing someone else's logic is the most common failure mode in multi-agent review. Read the code cold, as if it arrived with no explanation.
