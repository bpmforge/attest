# STRICT_REFACTOR_PLAN.md

**Version:** 0.15.0 (in progress)
**Date:** 2026-04-24
**Status:** Approved — executing all 5 waves

Refactor plan to make the SDLC and parallel agents follow strict processes by moving from large monolithic prompts + manual enforcement to small targeted prompts + automated validation. Replaces confidence-score feelings with inventory-coverage loops ("Ralph Wiggum" style). Adds tiered depth flags (`--quick` / `--deep`) so users opt into exhaustive verification when they want it.

---

## Motivation

### Observed problems

1. **Agents drift from strict process.** Parallel agents don't follow strict delegation rules. Rules exist but are buried deep in giant prompts.
2. **Onboarding is shallow by default.** Single pass over the codebase, no exhaustive verification that every API / sequence diagram / ERD node is covered.
3. **Security lacks a real deep mode.** Phase 4 OWASP iterates but there's no explicit `--deep` flag for Ralph-Wiggum-style exhaustive verification across all OWASP + all semgrep rules + iterative attack chain.
4. **Enforcement is manual.** Scope rules documented in prose — no validator checks that ARCHITECTURE.md actually has 6 diagram types or that every OWASP category hit confidence ≥ 7.

### Root causes (from audit)

| Weakness | Impact |
|----------|--------|
| **Prompt size** | `sdlc-lead.md` 4986 lines, `security-auditor.md` 2070 lines. Rules get truncated under context pressure. |
| **Distributed rule enforcement** | Same scope rules inlined in every specialist prompt. If one drifts, consistency dies. |
| **No automated completeness checks** | Gate advancement relies on orchestrator reading files and "feeling" confident. |
| **Confidence-score loops, not inventory loops** | "Score 7/10" is a feeling. No coverage %. |

---

## 5-Wave Plan

### Wave 1 — Shatter `sdlc-lead.md` into spine + mode files

**Problem:** One 5000-line file with all four modes intermixed.

**Action:** Split into:

| File | Target lines | Role |
|------|--------------|------|
| `agents/sdlc-lead.md` | ~400 | Router + shared protocols + HANDOFF templates index |
| `agents/sdlc-init-mode.md` | ~600 | Mode 1 — new project (Phases 0–5) |
| `agents/sdlc-onboard-mode.md` | ~600 | Mode 2 — reverse engineer existing codebase |
| `agents/sdlc-feature-mode.md` | ~500 | Mode 3 — feature addition |
| `agents/sdlc-improve-mode.md` | ~500 | Mode 4 — audit + backlog |
| `shared/BOUNDED_TASK_CONTRACT.md` | ~150 | Single source of truth for scope rules every specialist must follow |
| `shared/HANDOFF_TEMPLATES.md` | ~200 | Canonical HANDOFF block templates |
| `shared/FIX_VERIFY_LOOP.md` | ~100 | Canonical fix-verify protocol |

**Rule:** Specialist agents `Read()` the shared reference at runtime instead of inlining. Single source of truth. Update once, propagates everywhere.

### Wave 2 — Ralph Wiggum inventory-driven loops

**Problem:** Current loops iterate on confidence score, not coverage.

**Action:** Replace with:

```
INVENTORY   : enumerate the universe (all routes, all tables, all services, all P0 flows)
DISCOVER    : produce artifact per inventory row
VERIFY      : validator script confirms every row has an artifact
GAP         : if N rows uncovered → re-discover ONLY those N
REPEAT      : until coverage = 100% OR 3 iterations (then escalate)
```

Apply as reusable skills that compose in the mode files:

- `/onboard-inventory` — produce `docs/onboard/INVENTORY.md` (routes × tables × services × entry-points × P0 flows)
- `/onboard-sequence` — one HANDOFF per P0 flow from inventory
- `/onboard-erd` — one HANDOFF per subsystem from inventory
- `/onboard-component` — one HANDOFF per service (C3 diagram + responsibilities)
- `/onboard-verify` — runs `validate-inventory.sh` + returns gap list
- `/onboard-gap-fill` — re-runs only uncovered rows

Same pattern reused for Phase 3 architecture deliverables (one HANDOFF per diagram type, validator checks all 6 present).

### Wave 3 — Validation scripts (run this FIRST)

**Problem:** Gate advancement based on "read file and look confident."

**Action:** Shell scripts in `scripts/validators/` that return exit code + gap list:

| Script | Checks |
|--------|--------|
| `validate-architecture.sh` | 6 diagram types present, Mermaid syntax valid, no PLACEHOLDER/TODO text, HLA overview exists |
| `validate-owasp.sh` | All 10 OWASP categories rows present in tracker, all confidence ≥ 7, all marked DONE |
| `validate-api-coverage.sh` | Every route in code has a row in `API_DESIGN.md` + `openapi.yaml` |
| `validate-erd-coverage.sh` | Every migration / model class has an ERD node |
| `validate-sequence-coverage.sh` | Every P0 use case in `USE_CASES.md` has a sequence diagram |
| `validate-scope.sh` | `git status --porcelain` shows only files in assigned write-scope |
| `validate-inventory.sh` | Every inventory row has a corresponding artifact file |
| `validate-completion-manifest.sh` | Manifest has required sections (files-produced, decisions, known-issues, verify-result) |
| `validate-phase-gate.sh` | Runs all relevant validators for the current phase |

**Contract:** Each script takes a project root argument (defaults to `pwd`), prints gap list to stderr, writes machine-readable gap JSON to stdout, exits 0 if clean / 1 if gaps / 2 if validation itself errored.

**Gate rule:** Phase cannot advance if `validate-phase-gate.sh` exits non-zero.

### Wave 4 — Tiered depth flags

**Problem:** No way for user to opt into Ralph Wiggum depth without rewriting the agent.

**Action:** Add `--quick` and `--deep` flags:

**`/security`:**
- `--quick` — Phase 1–3 only (understand, semgrep scan, OWASP once-over). ~10 min.
- `--deep` — Ralph Wiggum: iterate every OWASP category × every custom semgrep rule file × every entry point. Then attack-chain iteratively (every pair, every triple, until a full pass finds no new chain). Runs `validate-owasp.sh` until clean. ~45–90 min.

**`/sdlc onboard`:**
- `--quick` — high-level `ARCHITECTURE.md` + `ONBOARDING.md` only. ~15 min.
- `--deep` — full Ralph Wiggum inventory loop. Blocks until `validate-inventory.sh` + `validate-architecture.sh` return 0. ~45–90 min.

Other skills (`/review-code`, `/ux`, `/perf`) stay auto-right-sized — they already work.

### Wave 5 — Automated parallel-wave enforcement

**Problem:** Parallel HANDOFFs rely on orchestrator manually reading completion manifests + deciding if scope was followed.

**Action:** Three automated gates per HANDOFF:

1. **Scope gate** — `validate-scope.sh <assigned-dir>` checks `git status --porcelain` — any file written outside `<assigned-dir>` → gate fails
2. **Manifest gate** — `validate-completion-manifest.sh <manifest-file>` — missing required sections → fails
3. **Coverage gate** — relevant validator from Wave 3 (e.g. `validate-architecture.sh` for architecture HANDOFFs)

Gate failures block wave advancement. No orchestrator judgment needed.

---

## Platform Support

| Platform | Support |
|----------|---------|
| **macOS** | ✅ Native (bash 3.2+ / zsh) |
| **Linux** | ✅ Native (bash 4+) |
| **Windows** | ✅ Via WSL2 only. Native PowerShell not supported. |

**Rationale:** All existing tooling (`install.sh`, `semgrep-full-audit.sh`, `cache-registry-packs.sh`) is bash. OpenCode itself runs on Mac/Linux primarily. A native Windows rewrite would mean maintaining parallel PowerShell validators — not worth the cost.

**Requirements documented in `README.md` + `install.sh` preflight check.** Install on native Windows refuses with a clear "please install WSL2" error.

**Compatibility rules enforced by all validators:**
- `#!/usr/bin/env bash` shebang
- `set -euo pipefail`
- POSIX-compatible sed/awk where possible
- No GNU-only flags (`sed -i ''` for mac, not `sed -i`)
- `shellcheck` clean

---

## Execution Order

Waves run in this order (each commits independently):

1. **Wave 3 first** — validators. Cheapest, gives immediate teeth, doesn't require moving anything.
2. **Wave 1** — split sdlc-lead. Enables everything else.
3. **Wave 2** — Ralph Wiggum loops. Depends on Wave 3 validators.
4. **Wave 4** — tiered depth. Depends on Wave 2 Ralph Wiggum pattern.
5. **Wave 5** — automated parallel enforcement. Depends on Wave 3 validators.

After each wave: commit → push to both remotes (gitea + github).

---

## Out of scope

- Rewriting every specialist agent internals. Not touching `db-architect`, `api-designer`, etc. beyond reference-update to the new `BOUNDED_TASK_CONTRACT.md`.
- New specialist agents. Everything here is restructuring + validators.
- Per-phase skill explosion. Skills stay thin triggers; *mode files* fan out.
- Native Windows PowerShell support.

---

## Success criteria

- `sdlc-lead.md` ≤ 500 lines
- Every specialist references `shared/BOUNDED_TASK_CONTRACT.md` instead of inlining rules
- `scripts/validators/*.sh` — 9 validators, all shellcheck-clean
- Onboarding Ralph Wiggum loop verified: delete a diagram from a test project → `validate-architecture.sh` flags it → gap-fill produces it → validator passes
- Security `--deep` mode traces every OWASP × every semgrep rule file and surfaces at least one new finding on a test project compared to `--quick`
- Claude Code and OpenCode agent systems both updated (per `memory/sync-claude-opencode.md`)
- CHANGELOG.md bumped to 0.15.0

---

## Post-execution review

After all 5 waves land, user reviews each part individually for further improvements. Track review outcomes in `docs/reviews/v0.15.0_retrospective.md`.
