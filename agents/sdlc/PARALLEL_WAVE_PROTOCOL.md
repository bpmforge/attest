---
name: parallel-wave-protocol
description: Phase 4 parallel implementation wave protocol — 3-round mini-lifecycle per module (code → review+fix → runtime), wave gate, scope collision rules, when to refuse parallel. Load when user opts into parallel mode during Phase 4 execution.
metadata:
  type: protocol
---

# Parallel Wave Protocol

Load this when the user has chosen parallel mode (`[P]`) for a Phase 4 wave. Sequential mode does NOT need this file.

---

## Overview

A parallel wave runs THREE rounds per module: **code → review → runtime**. Every module produces its own `CODE_REVIEW_<module>_<date>.md` and `RUNTIME_<module>_<date>.md`. A wave does not advance until every module has its own runtime verdict `PASS`.

**Roles (canonical names — `agents/shared/PRODUCT_SHAPE_PROTOCOL.md` §1):** the wave machinery is
the ORCHESTRATOR (claims, scopes, gates, lands — decides sequence, never doneness) driving BOTS (the
per-module coding sessions, untrusted by construction) under a REVIEW PANEL (the wave-level expert
pass — advisory, deterministic validators own the gate) and the HONESTY LOOPS (Wiggum coverage +
Challenger veracity). Whether the PRODUCT is done belongs to the GOAL loop's evidence predicate, not
to this protocol — a drained wave list proves nothing. Use these five names in every plan and
report; also observe the two-stack rule there when a bootstrap harness and a product engine coexist.

---

## Round 1 — Code (N parallel coding-agent HANDOFFs)

Emit ONE message containing every coding HANDOFF for the wave. Example for a 3-module wave:

```
---
  WAVE 2 — ROUND 1: CODE (3 HANDOFFs — open 3 OpenCode sessions)
---
These 3 modules are independent — no shared write-scope, no cross-module imports.
Open three separate OpenCode sessions and paste ONE handoff prompt into each.
Report back with all three completion phrases before I emit Round 2.

Write-scope (ENFORCED):
  HANDOFF #1 (coding-agent → auth):          src/auth/           ONLY
  HANDOFF #2 (coding-agent → users):         src/users/          ONLY
  HANDOFF #3 (coding-agent → notifications): src/notifications/  ONLY

If any agent needs to change a file outside its assigned directory, it MUST
stop and flag the cross-cutting concern — do not edit cross-module.

───── HANDOFF #1 ─────
[coding-agent prompt for module 1 — completion phrase: "code done — auth module: [summary]"]
───── HANDOFF #2 ─────
[coding-agent prompt for module 2 — completion phrase: "code done — users module: [summary]"]
───── HANDOFF #3 ─────
[coding-agent prompt for module 3 — completion phrase: "code done — notifications module: [summary]"]
---
```

**Round 1 gate:** every module's completion phrase present, no write-scope collisions (`git status` shows no overlap).

---

## Round 2 — Review (three-level model: wave-level expert pass, per-module Level 1)

**The expert pass runs once per WAVE over the aggregate diff, not per module** (P-A1/P-A2 — the
per-module fan-out measured 4.8 expert sessions per coding attempt). Per module, Round 2 is the
Level-1 deterministic gate only (scope, manifest, verify commands, chained validators). Then emit
ONE message with the wave-level review HANDOFFs:
- code-reviewer: always (over the wave's aggregate diff)
- security-auditor: if the wave diff carries a security surface
- performance-engineer: if it changes a measured hot path
- ux-engineer: if it changes user-visible behavior
- PLUS a per-module expert HANDOFF for any **high-risk** module (authn/authz, crypto, secrets,
  schema/query shape, public API compatibility, concurrency, material interaction redesign) — those
  keep individual review in addition to the wave pass.

**Reviewer verdicts are advisory (P-A8):** a REJECT files findings (resolvable citations required)
and may demand a deterministic check; deterministic validators own the gate
(`GATE_SCORING_PROTOCOL.md`, "Who holds the gate"). Findings attribute to the introducing module —
only that module reopens, and re-review runs only the failed checks.

Completion phrases: `"review done — <module>: <verdict>"`, `"security done — <module>: <verdict>"`, etc.

After all completion phrases return, run the Fix-Verify Loop Protocol **per attributed module**
(only modules with findings reopen):
- Each module produces its own `FIX_BACKLOG_<module>_<date>.md`
- Iterate up to 3 times: remediation + re-verification per module
- A module passes when every merge-blocking row in its backlog is `VERIFY=PASS`
- A module stuck after 3 iterations emits its own escalation block — peer modules advance to Round 3

---

## Round 3 — Runtime (N parallel coding-agent HANDOFFs)

Emit ONE message with N runtime-validation HANDOFFs, one per module. Each runs the full runtime gate scoped to its module:
- build → lint/typecheck → start → module-level smoke → regression smoke
- Produces: `docs/reviews/RUNTIME_<module>_<date>.md`
- Completion phrase: `"runtime done — <module>: [PASS or FAIL]"`

**Round 3 gate — per module:**
1. Module's RUNTIME_<module>.md shows PASS
2. Module's FIX_BACKLOG_<module>.md has 0 open CRITICAL/HIGH
3. `run-handoff-gates.sh` scope check clean for this module

A module that fails Round 3 blocks only itself — fix that module and re-run its Round 3 HANDOFF while other modules' PASS verdicts remain valid.

---

## Wave Gate (mandatory before Wave N+1)

**Landing discipline:** the merge unit is the FEATURE, never the individual ticket
(`agents/shared/PRODUCT_SHAPE_PROTOCOL.md` §3). A module that passes Round 3 PARKS its branch
(durable, committed board status — a park is not a landing, and parked is not claimable after a
restart); the feature merges ONCE when every member is parked-done. A blocked member is not closed —
it holds the whole feature in WAITING. If park durability or intra-feature branch-stacking isn't
available yet, land per-ticket and name the gap instead of faking the mode.

1. Every module in the wave has RUNTIME PASS and clean FIX_BACKLOG
2. No write-scope collisions: `git status --porcelain` — no overlap between modules
3. Update `docs/PARALLELIZATION_MAP.md`: mark wave DONE
4. Update SDLC_TRACKER Phase 4 Wave Execution row: `Status = ✅ DONE`

Print before advancing:
```
WAVE [N] COMPLETE ✓
  Modules: [list] — all RUNTIME PASS, all FIX_BACKLOGs clean
  Advancing to Wave [N+1]: [modules]
  [or: All waves complete — running Phase 4 pre-gate checklist]
```

---

## When to Refuse Parallel and Force Sequential

- The wave contains any module that writes to `src/shared/`, `src/common/`, or root-level config (tsconfig, package.json, etc.)
- Two modules in the wave both depend on a contract that hasn't been frozen yet
- `PARALLELIZATION_MAP.md` lists the modules in different waves (don't cross wave boundaries for convenience)

---

## State Save (before emitting parallel HANDOFFs)

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4 — Wave [N] (parallel)
Last completed: Wave [N-1] verified
Awaiting: coding-agent × [M modules] — see HANDOFFs below
Next after resume: verify each, gate wave, advance to Wave [N+1]
")
```
