---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# FIX_VERIFY_LOOP.md

**Canonical fix-verify protocol used across every review stage.**

Single source of truth. Mode files reference this file instead of duplicating the protocol. Extracted from `sdlc-lead.md` v0.14.0.

---

## The five-step pipeline

```
1. PARALLEL FAN-OUT  -- emit every triggered review HANDOFF in ONE message
2. SYNTHESIZE        -- merge findings into a unified FIX_BACKLOG
2b. CHALLENGE        -- if any row is HIGH/CRITICAL, challenger HANDOFF adjudicates
                        CONFIRMED/CONTRADICTED before remediation (CHALLENGER_PROTOCOL)
3. REMEDIATE         -- single coding-agent HANDOFF applies CONFIRMED CRITICAL+HIGH fixes
4. RE-VERIFY         -- targeted verification of backlog rows only (not full re-scan)
5. GATE              -- repeat steps 3-4 by iteration CLASS, not a flat count:
                        fix-verify.mjs reads the ceiling from docs/work/.model-context
                        (6 metered / 12 local); STALLED escalates after 2 same-tier
                        attempts, PROGRESSED may extend to the ceiling, OSCILLATING
                        (regressed) escalates immediately and stops on the 2nd.
```

---

## Step 1: Parallel review fan-out

sdlc-lead decides which reviews to run based on impact analysis:

| Review | Auto-trigger condition |
|--------|------------------------|
| code-review | ALWAYS |
| security | auth / session / authorization / user-input / file-upload / SQL / crypto / external-API-with-credentials surfaces touched |
| performance | NFR-tracked paths / DB queries / loops / caching / background jobs touched |
| ux | any UI file touched |

Emit every triggered review HANDOFF in one message using Template 4 from `HANDOFF_TEMPLATES.md` (parallel wave). User opens N concurrent OpenCode sessions.

---

## Step 2: Synthesize FIX_BACKLOG

After every review's completion phrase prints, sdlc-lead reads each review file and produces:

**`docs/reviews/FIX_BACKLOG_<feature>_<date>.md`**

```markdown
# FIX_BACKLOG — <feature> (<date>)

| # | Source review | Severity | File:line | Finding | Recommended fix | Verify criterion |
|---|---------------|----------|-----------|---------|-----------------|------------------|
| 1 | SECURITY_... | CRITICAL | src/auth/login.ts:42 | SQL injection via raw query concat | Parameterize via prepared statement | grep for `query.*\+.*req` returns nothing |
| 2 | CODE_REVIEW_... | HIGH | src/users/handler.ts:88 | Unchecked JSON.parse on user input | Try/catch + validate shape via zod | test passes: `test('rejects malformed JSON', ...)` |
| 3 | PERF_... | MEDIUM | src/api/list.ts:17 | N+1 query in loop | Batch via `IN (...)` | k6 p95 < 200ms on /api/list |
```

Dedupe rows where two reviewers flagged the same `file:line` — keep the higher severity.

---

## Severity -> Action matrix (canonical)

| Severity | Action for this cycle | Merge impact |
|----------|----------------------|---------------|
| CRITICAL | MUST fix this iteration (or signed waiver) | Blocks merge to `main` |
| HIGH | MUST fix this iteration (or signed waiver) | Blocks merge to `main` |
| MEDIUM | Track in backlog; defer to tech-debt | Merge-OK |
| LOW | Informational only | Merge-OK |

Waivers: recorded in `docs/reviews/WAIVERS_<feature>_<date>.md` with compensating control + review date. sdlc-lead NEVER signs waivers — only the user does.

---

## Step 3: Remediate

Emit ONE remediation HANDOFF using Template 2 from `HANDOFF_TEMPLATES.md`. Passes:

- The `FIX_BACKLOG` file
- Rule: fix only CRITICAL+HIGH rows this iteration
- Rule: minimum change at cited file:line
- Rule: stop and report if a fix needs a design change

Output:
- Code edits at cited locations
- `docs/reviews/FIX_SUMMARY_<feature>_<iteration>_<date>.md` with per-row FIXED / DEFERRED / NEEDS-DESIGN

---

## Step 4: Targeted re-verification

**Deterministic re-verify first (when a finding came from a tool).** Before
asking a model to judge "is it fixed?", run the script that found it — the
verdict that can't be faked:

```
# baseline BEFORE the fix (Step 3), per finding source:
node scripts/fix-verify.mjs snapshot semgrep                 # SAST findings
node scripts/fix-verify.mjs snapshot validate-dead-code.sh   # dead/stub code
node scripts/fix-verify.mjs snapshot validate-deps.sh        # dependency CVEs
node scripts/fix-verify.mjs snapshot validate-contract-conformance.sh  # O2.5: interface drift a fix may introduce (caught in-loop, not only at phase-5)

# AFTER the fix:
node scripts/fix-verify.mjs verify semgrep --floor ERROR
```

`fix-verify` re-runs the scan and diffs by fingerprint (rule + file + matched
code, so it survives line drift): prints CLOSED / STILL-OPEN / NEW and exits
non-zero if any in-scope finding remains OR the fix introduced a regression. A
backlog row whose source is scriptable is PASS **only** when fix-verify shows
it CLOSED — never on the model's say-so.

**Model re-verify for the rest.** Findings from manual review (OWASP logic,
design issues, UX) have no script — emit ONE re-verification HANDOFF per
reviewer using Template 3 from `HANDOFF_TEMPLATES.md`. The reviewer verifies
ONLY the backlog rows — does not scan for new issues.

> **Independent verifier (MODEL_ADAPTER.md § Maker/Verifier split).** The model
> re-verify runs on `verifier_model` in a **fresh session** — never the
> coding-agent that wrote the fix. A maker asked "did your own fix work?"
> over-reports. Different instance, cleared context; record `maker==verifier`
> in DELEGATION_LOG if only one model is available.

Output:
- `docs/reviews/VERIFY_<feature>_<iteration>_<date>.md` — per-row PASS / FAIL / INCONCLUSIVE + evidence
- The fix-verify JSON reports under `docs/security/fix-verify-*.json` are the evidence for scriptable rows.

This is the canonical division: **scriptable findings get a deterministic gate,
judgment findings get a model gate.** Add a `Verify-by` column to the
FIX_BACKLOG (`fix-verify:<source>` or `manual`) so each row's gate is explicit.

---

## Step 5: Gate

After re-verification:

- All CRITICAL+HIGH rows PASS -> loop closed, proceed to merge gate
- Any CRITICAL+HIGH row FAIL -> back to Step 3 with the failed rows
- Iteration counter increments

**Classify the iteration before spending the next one** (field-validated on the
Shipwright conductor run 2026-07-12 — a flat cap treats two different failures
identically; see `issues/` field reports). Using the per-row verdicts
(CLOSED / STILL-OPEN / NEW / REGRESSED):

| Iteration class | Ledger signature | Budget rule |
|---|---|---|
| **STALLED** | a row is STILL-OPEN after an iteration that explicitly targeted it | **2 targeted iterations per row at the same specialist/tier, never 3** — the third identical attempt is the worst spend in the system. On the 2nd STILL-OPEN: escalate that row now (option D — different specialist / stronger tier), don't wait for the loop cap. |
| **PROGRESSED** | all prior rows CLOSED, but NEW rows opened | Healthy — the fix let review see deeper (observed live: findings 2→9→15 while *converging on completeness*). Does not count against the same budget as a stall: the loop may extend past 3 iterations **only** while every iteration closes all its prior rows AND the NEW-row count strictly decreases; absolute ceiling 6 on frontier/metered tiers — but **tier-aware**: on local/owned-hardware tiers (tokens ~free) the PROGRESSED ceiling rises to 12, matching the proven localFrontier setting (12 iterations landed complete SDLCs on local models where a flat cap of 3 hard-escalated; the wall-clock watchdog is the backstop). The principle, field-proven on the original opencode/Jarvis local runs: **as long as it is not looping on the same error, let it loop and fix.** Hitting any ceiling while still PROGRESSED is a *decomposition signal* (the change is too big — split it), not a fix failure. |
| **OSCILLATING** | any previously-CLOSED row comes back (REGRESSED) | Zero tolerance — the fixes are fighting each other, usually across a module boundary the change blurs. **First regression: escalate immediately. Second: stop.** |
| **Infra event** | verify run truncated / interrupted / tooling crashed | Re-run the verification; it consumes **no** iteration and opens **no** row. Never charge the fixer for infrastructure. |

**Default hard cap stays 3 iterations** (PROGRESSED extension above is the only
exception). If the cap is hit with any FAIL, sdlc-lead STOPS and emits the escalation block:

```
---
  FIX-VERIFY LOOP EXHAUSTED (3 iterations, still failing)
---
Open backlog rows:
  - [row #, severity, finding, why it keeps failing]

Choose one:
  (A) Sign a waiver (compensating control + review date)
  (B) Redesign -- one of the reviewed changes needs a different approach
  (C) Defer to tech debt -- re-classify from CRITICAL/HIGH to MEDIUM
  (D) Change specialist -- assign a different agent to the fix

No 4th iteration without explicit user direction.
---
```

On escalation, capture the lesson so the same fix doesn't fail the same way next time
(Cherny's "write it down, don't re-prompt"):

```
node scripts/loop-learn.mjs \
  --symptom "fix-verify stuck: <row, finding>" \
  --cause   "<why the fix keeps failing re-verify>" \
  --rule    "<the durable correction>" \
  --source  "fix-verify:<feature>" --claude
```

Pass the printed `memory_store` payload to the memory MCP.

---

## Merge gate integration

`git-expert` refuses to merge to `main` (or a sub-component branch to its parent feature
branch) unless ALL FIVE conditions in `git-expert.md`'s Rules section hold — this section used
to say "ALL THREE," which drifted out of sync as the other two were added (confirmed 2026-07-07,
T27.3):

1. Matching `RUNTIME_*.md` exists with verdict PASS
2. CI pipeline green (every forge check passing)
3. Fix-verify loop closed: empty backlog OR latest VERIFY all PASS OR signed waivers cover every open CRITICAL/HIGH
4. No open CRITICAL/HIGH in any CODE_REVIEW / SECURITY / PERF / UX verdict
5. Anti-drift gates pass (G-B + G-D — see `git-expert.md` for the exact validator list, which
   changes as new anti-drift validators ship; this section intentionally doesn't duplicate it)

Missing or failing any of the five -> abort and report exactly which condition blocks. This is
prose, not enforcement — `git-expert.md` is the source of truth for the actual condition list.

---

## Tracker updates

Every iteration updates `docs/work/DELEGATION_LOG.md`:

```
| <timestamp> | coding-agent | FIX iteration <N> | DONE | <score>/10 | <notes> |
| <timestamp> | code-reviewer | VERIFY iteration <N> | DONE | <score>/10 | <N PASS, M FAIL> |
```

And updates the SDLC_TRACKER with a Fix-Verify row:

```
| Fix-Verify Iteration <N> | <date> | <backlog-size> open | <PASS-count> PASS / <FAIL-count> FAIL | <status> |
```

Status: `IN PROGRESS` / `CLOSED` / `ESCALATED (3 iterations exhausted)`.
