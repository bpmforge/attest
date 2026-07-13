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

Gates in order (any failure aborts the rest):

| Gate | Check |
|------|-------|
| 1. Scope | `git status --porcelain` confined to assigned dirs + `docs/work/**` + `docs/reviews/**` |
| 2. Manifest | required sections + completion phrase, AND (T27.2 v2) every "Files produced" path exists on disk, "Verify result" cites a real artifact, Maker/Verifier identity lines are present and distinct |
| 3. Coverage | domain-specific validator (architecture, api-coverage, erd-coverage, owasp, inventory) |
| 4. Tracker | (T27.2) tracker-worthy work changed a tracker file — `validate-tracker-fresh.sh` per-step mode against the working tree |

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

## Step 3 — Score Confidence (1-10, advisory)

> **Independent verifier (MODEL_ADAPTER.md § Maker/Verifier split).** Confidence scoring runs on `verifier_model` — a different instance from the one that produced the artifact. The maker over-reports its own success. If only one model is available, score in a fresh session with cleared context and record `maker==verifier` in DELEGATION_LOG.

**T27.2: the score is advisory, not the pass/fail decision.** Step 2's gates already ran deterministic checks against reality — Files-produced paths stat'd on disk, Verify-result citing a real artifact, Maker/Verifier identity recorded and distinct (`validate-completion-manifest.sh` v2), plus scope/coverage/tracker. If Step 2 passed, the HANDOFF is structurally sound and truthful by the checks that can actually verify it; a subjective 1-10 number below shouldn't be able to override that into an outright fail — that would mean a human/model's gut feeling overrules a deterministic receipt, exactly backwards from what this program is trying to fix (2026-07-07 ticket-hygiene incident: self-asserted status strings, no gate ever ran).

The score still matters — it's an early-warning signal for **quality** questions no automated gate can see: is the implementation thin, does it deviate from spec in spirit, are the deferred issues actually concerning. Score honestly:

| Score | Meaning |
|-------|---------|
| 10 | All expected files present, manifest complete, tests pass, no deviations |
| 7-9 | Files present, minor notes in deferred, tests pass |
| 5-6 | Files present but thin, or deferred issues needing attention |
| 1-4 | Deviated from spec, work is materially incomplete despite passing gates |

### Required field: "re-ran independently"

**Every score MUST carry a `re-ran independently:` line** — the specific check the *verifier* re-executed itself (not the maker's self-report), plus its concrete result:

```
re-ran independently: <what you re-ran> — <counts> — <exit code>
```

Examples:
- `re-ran independently: npm test (fresh, no cache) — 292 passed, 0 failed — exit 0`
- `re-ran independently: re-read src/auth/session.ts:40-80 — confirmed the timeout guard the manifest claims — n/a`
- `re-ran independently: grep for the removed route in router.ts — 0 matches, confirmed gone — exit 0`

**A score submitted without this field is INCOMPLETE — not a valid score.** Do not proceed to Step 4; send it back to whoever scored it ("add `re-ran independently: <...>`") and wait for the resubmission. This codifies the single highest-value pattern from the 2026-07-08 field report (H9/D-1): verify-don't-trust caught nearly every serious defect that run precisely *because* verification was independently re-run by the verifier, not read off the maker's manifest. A score with no re-run behind it is a guess wearing a number.

**Checklist — a score is only complete when all of these hold:**
- [ ] Step 2's automated gates ran and their pass/fail result is known
- [ ] A 1-10 number was assigned per the table above
- [ ] `re-ran independently: <what, counts, exit codes>` is present and names a concrete, independent action — not "looks good" or "manifest checks out"
- [ ] The DELEGATION_LOG row (Step 5) carries the same field

Any unchecked box → reject the score and return it to the scorer; it does not reach Step 4.

## Step 4 — Interpret the Score

Gates already decided pass/fail (Step 2). The score decides whether to accept as-is or ask for a polish pass — it does not undo Step 2's verdict:

| Score | Action |
|-------|--------|
| >= 7 | **Accept** — continue to next step |
| 5-6 | **Revise (quality)** — ask the agent to address the specific quality note (up to 3 times). This is a polish request, not a re-run of the gates — the gates already passed. |
| 1-4 | **Escalate to user** — gates passed but the score is this low, something is wrong with the score, the gates, or both; don't silently auto-fail a HANDOFF whose deterministic checks are clean. Surface both to the user rather than unilaterally rejecting artifacts the gates already verified.

If Step 2's gates **failed**, the HANDOFF does not reach scoring at all — return to REVISE with the specific gate's JSON gap list (see Step 2), same as before.

## Step 5 — Update DELEGATION_LOG

Append the result to `docs/work/DELEGATION_LOG.md`. The `re-ran independently` field (see Step 3) is required — a row without it is an incomplete log entry, same as an unscored HANDOFF:

```
| <timestamp> | <agent> | <task summary> | DONE/FAILED/REDO | <score>/10 | re-ran independently: <what, counts, exit codes> | <notes> |
```

## Step 6 — Continue or Escalate

If the manifest reports test failures or known issues, surface them before continuing. If verification passes (score >= 7), continue to the next step.

## HANDOFF Manifest for Parallel Waves

When two or more HANDOFFs returned in parallel — resume order is unpredictable. Always read `docs/work/HANDOFF_MANIFEST.md` FIRST (not conversation history — context may have shifted). Mark the returned HANDOFF as DONE. If more are still PENDING, wait for them. When ALL are DONE, score all and proceed.
