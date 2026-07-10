# Tickets

> Derived from `docs/work/plan.json` by `scripts/gen-tickets-board.mjs`. Do not hand-edit — edit the plan and regenerate.

**0 agents can start right now** — every module is blocked, claimed, or done.

## Full table

| ID | Module | Status | Owner | Blocked by | Write-scope |
|----|--------|--------|-------|------------|-------------|
| T-hygiene-red-done | Done with no evidence trail (incomplete-evidence) | claimed | alice | — | src/red-done/** |
| T-hygiene-red-wip-1 | First open ticket for bob (wip-violation, stale-claim) | claimed | bob | — | src/red-wip-1/** |
| T-hygiene-red-wip-2 | Second concurrent open ticket for bob (wip-violation) | in_progress | bob | — | src/red-wip-2/** |
| T-hygiene-red-scope | Evidence commit outside write_scope + a fabricated commit | in_progress | carol | — | totally/unrelated/** |
