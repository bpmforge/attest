---
name: reflow
description: 'Reflow the module-ticket graph so a newcomer can pick up work. Reads plan.json + completed artifacts, marks done modules, recomputes the claimable (ready + unclaimed) set, flags write-scope collisions, and emits a HANDOFF for a claimed module. Read-mostly and idempotent — run it any time someone asks "what can I work on?"'
---

# Reflow — recompute the claimable module set

Turns "where can I plug in?" into a concrete, collision-free answer. Works on the
module-contract ticket layer in `plan.json` (see `docs/TICKET_SCHEMA.md`). Uses the
deterministic helpers so the graph math is not vibes.

**Usage:**
- `/reflow` — recompute status, show the claimable modules + the board
- `/reflow claim <module-id> [as <owner>] [with /<skill>]` — claim a module and emit its HANDOFF

## Procedure

Locate the plan (`docs/work/plan.json`; if none, tell the user to run `/sdlc feature`/`/sdlc init`
so the module graph exists). Then:

1. **Mark done.** For each module not already `done`, run its `verify` gate (the script/validator
   in the ticket) and confirm its `acceptance` criteria are met. If it passes, set the module's
   `status` to `done` in `plan.json`. Do not mark done on hope — the gate must pass.
2. **Recompute + collision check (deterministic):**
   ```
   node scripts/lib/tickets.mjs validate docs/work/plan.json   # graph integrity + write-scope collisions
   node scripts/lib/tickets.mjs status   docs/work/plan.json   # resolve blocked/ready, list claimable
   node scripts/gen-tickets-board.mjs    docs/work/plan.json   # regenerate docs/work/TICKETS.md
   ```
   If `validate` reports a **write-scope collision** involving an active module, STOP and surface it —
   do not hand off the overlapping module until the user resolves the scope overlap. Two people in the
   same files is the one thing this skill exists to prevent.
3. **Present the claimable set** — for each `ready` + unclaimed module: id, title, write-scope,
   acceptance criteria, and its interface doc. This is the menu a newcomer picks from.

## Claiming a module → emit a HANDOFF (follow handoff rules)

On `/reflow claim <id>`: set the module's `owner` and `status: claimed` in `plan.json`, regenerate the
board, then **emit a HANDOFF** for the module (per `agents/shared/EXECUTOR_SELECTION.md` — never assume
a spawn). The claimed module's contract becomes the HANDOFF contract:

```
════════════════════════════════════════════════════════════
HANDOFF → <owner/agent>  |  open new session → /<skill>   (default /code)
USER: open a new session, type /<skill>, paste everything below
════════════════════════════════════════════════════════════
SDLC-TASK for <agent>:

ROLE: <domain expert for this module>
CONTEXT (read first):
- <module.interface>                     -- the contract to build to
- <each dependency module's interface>   -- you code against these, not their internals
WRITE-SCOPE (exclusive): <module.write_scope>   -- edit nothing outside this
YOUR TASK: implement <module.title> to satisfy its acceptance criteria.
PRODUCE: <module.acceptance, as a checklist>
VERIFY before completing: run <module.verify>; all acceptance criteria met.
Completion Manifest at docs/work/manifests/<id>.md.
Print exactly: "<id> done — <one sentence>"
════════════════════════════════════════════════════════════
END HANDOFF
════════════════════════════════════════════════════════════
```

Because each module's `write_scope` is exclusive and collisions were checked in step 2, multiple
claimed modules can be worked **in parallel** in separate sessions without clobbering each other.

## Notes
- Reflow itself runs inline (deterministic scripts + one HANDOFF on claim) — it does not fan out
  concurrent spawns, so it needs no executor gate; the single claim HANDOFF carries the full contract.
- Idempotent: re-running only advances statuses that newly qualify and regenerates the board.
