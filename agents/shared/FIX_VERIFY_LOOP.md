# FIX_VERIFY_LOOP.md

**Canonical fix-verify protocol used across every review stage.**

Single source of truth. Mode files reference this file instead of duplicating the protocol. Extracted from `sdlc-lead.md` v0.14.0.

---

## The five-step pipeline

```
1. PARALLEL FAN-OUT  -- emit every triggered review HANDOFF in ONE message
2. SYNTHESIZE        -- merge findings into a unified FIX_BACKLOG
3. REMEDIATE         -- single coding-agent HANDOFF applies CRITICAL+HIGH fixes
4. RE-VERIFY         -- targeted verification of backlog rows only (not full re-scan)
5. GATE              -- repeat steps 3-4 up to 3 iterations; escalate if still FAIL
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

Emit ONE re-verification HANDOFF per reviewer using Template 3 from `HANDOFF_TEMPLATES.md`. The reviewer verifies ONLY the backlog rows — does not scan for new issues.

Output:
- `docs/reviews/VERIFY_<feature>_<iteration>_<date>.md`
- Per-row: PASS / FAIL / INCONCLUSIVE + evidence

Targeted verification saves tokens vs. re-running a full review.

---

## Step 5: Gate

After re-verification:

- All CRITICAL+HIGH rows PASS -> loop closed, proceed to merge gate
- Any CRITICAL+HIGH row FAIL -> back to Step 3 with the failed rows
- Iteration counter increments

**Hard cap: 3 iterations.** If iteration 3 still has any FAIL, sdlc-lead STOPS and emits the escalation block:

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

---

## Merge gate integration

`git-expert` refuses to squash-merge to `main` unless ALL THREE conditions hold:

1. Matching `RUNTIME_*.md` exists with verdict PASS
2. Fix-verify loop closed: empty backlog OR latest VERIFY all PASS OR signed waivers cover every open CRITICAL/HIGH
3. No open CRITICAL/HIGH in any CODE_REVIEW / SECURITY / PERF / UX verdict

Missing or failing any of the three -> abort and report exactly which condition blocks.

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
