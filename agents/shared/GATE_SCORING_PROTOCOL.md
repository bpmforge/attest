---
name: gate-scoring-protocol
description: HANDOFF resume scoring — 1-10 scale, asymmetric threshold, confidence gates, delegation log format. Load after a specialist returns before resuming the SDLC pipeline.
metadata:
  type: protocol
---

# Gate Scoring Protocol

Loaded by sdlc-lead on every HANDOFF resume. Defines how to score returning specialist output, what threshold passes, and when to escalate vs. retry.

## Step 1 — Confirm State

Read `docs/work/sdlc-state.md` to confirm which agent was delegated and what it was expected to produce.

## Step 2 — Run Automated Gates

For every HANDOFF return, run the gate orchestrator:

```bash
./scripts/validators/run-handoff-gates.sh \
  --scope <assigned-dir> [--scope <dir2> ...] \
  --manifest <manifest-path> \
  [--coverage <validate-something.sh>]
```

Three gates in order (any failure aborts the rest):

| Gate | Check |
|------|-------|
| 1. Scope | `git status --porcelain` confined to assigned dirs + `docs/work/**` + `docs/reviews/**` |
| 2. Manifest | completion manifest has required sections + completion phrase |
| 3. Coverage | domain-specific validator (architecture, api-coverage, erd-coverage, owasp, inventory) |

**Coverage validator table:**

| HANDOFF type | `--coverage` arg |
|--------------|------------------|
| `api-designer` | `validate-api-coverage.sh` |
| `db-architect` | `validate-erd-coverage.sh` |
| architecture synthesis | `validate-architecture.sh` |
| `security-auditor --deep` | `validate-owasp.sh` |
| `onboard --deep` | `validate-inventory.sh` |
| `test-engineer` (test strategy + E2E infra) | `validate-e2e-setup.sh` |
| `architecture-designer` (module + infra) | `validate-module-design.sh` |
| `ux-engineer` (UX spec) | `validate-ux-spec.sh` |
| `frontend-design` (Wave 0 design system) | `validate-design-system.sh` |
| `sre-engineer` (IaC scaffolding) | `validate-iac.sh` |
| `test-engineer` (test design) | `validate-test-design.sh` |
| `coding-agent` (any code) | omit — use `--runtime` instead |
| phase-5 final gate | `validate-release-readiness.sh` |

Any non-zero exit → HANDOFF does not pass. Read the JSON gap list, return the specific gap to the specialist, request REVISE.

## Step 3 — Score Confidence (1-10)

Score the HANDOFF output on a 1-10 scale **only if all gates passed**:

| Score | Meaning |
|-------|---------|
| 10 | All expected files present, manifest complete, tests pass, no deviations |
| 7-9 | Files present, minor notes in deferred, tests pass |
| 5-6 | Files present but thin, or manifest missing, or deferred issues needing attention |
| 1-4 | Files missing, tests failing, agent deviated from spec |

## Step 4 — Apply Asymmetric Threshold

| Score | Action |
|-------|--------|
| >= 7 | **Pass** — continue to next step |
| 5-6 | **Revise** — ask user to re-run the agent (up to 3 times) with the specific gap. Do NOT rewrite the output yourself. |
| < 5 | **Auto-fail** — surface to user: "The [agent] output does not meet the minimum bar: [reason]. Please re-run with these corrections: [specifics]." |

## Step 5 — Update DELEGATION_LOG

Append the result to `docs/work/DELEGATION_LOG.md`:

```
| <timestamp> | <agent> | <task summary> | DONE/FAILED/REDO | <score>/10 | <notes> |
```

## Step 6 — Continue or Escalate

If the manifest reports test failures or known issues, surface them before continuing. If verification passes (score >= 7), continue to the next step.

## HANDOFF Manifest for Parallel Waves

When two or more HANDOFFs returned in parallel — resume order is unpredictable. Always read `docs/work/HANDOFF_MANIFEST.md` FIRST (not conversation history — context may have shifted). Mark the returned HANDOFF as DONE. If more are still PENDING, wait for them. When ALL are DONE, score all and proceed.
