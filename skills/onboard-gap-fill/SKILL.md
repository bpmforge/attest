---
name: onboard-gap-fill
description: 'Ralph Wiggum deep-onboard: Step D4 — re-run focused HANDOFFs for rows flagged by /onboard-verify. Does NOT re-run the full DISCOVER phase.'
---

# Onboard Gap-Fill

Takes the gap list from `/onboard-verify` and emits ONE focused HANDOFF per gap to the appropriate specialist.

## Usage

- `/onboard-gap-fill` — fill gaps reported by the last verify run
- `/onboard-gap-fill <path>` — fill gaps for a specific project root

## What it does

1. Read the latest gap list (either from `/onboard-verify` output or by running `validate-phase-gate.sh onboard-deep` again)
2. For each gap, map the category -> agent:
   - `ROUTE` missing -> `api-designer`
   - `TABLE` missing -> `db-architect`
   - `SERVICE` missing -> `researcher`
   - `FLOW` missing -> `researcher`
   - `ENTRY` missing -> `researcher`
3. Emit a focused HANDOFF per gap (not a single mega-HANDOFF)
4. Each HANDOFF is scoped to the ONE inventory row it targets

## Hard cap

3 gap-fill iterations. After iteration 3, if gaps remain, emit the escalation block from `agents/shared/RALPH_WIGGUM_LOOP.md` and STOP.

## Rule

Do NOT re-run the whole DISCOVER phase. Re-discover only the flagged rows. This is what makes Ralph Wiggum cheap enough to run in practice.
