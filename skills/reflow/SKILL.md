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

1. **Mark done.** A module reaches `done` ONLY through `accept()` (T26.1/T26.3) — never hand-set. If a
   module is sitting `in_review` with its owner's work actually reviewed, run
   `node scripts/lib/tickets.mjs accept docs/work/plan.json <id> <reviewer>` (reviewer ≠ owner). Do not
   mark done on hope — `accept()` itself refuses unless the module's Completion Manifest has the
   `close()` receipt pasted into it (see "Close receipt = the only accepted completion signal" below).
2. **Recompute + collision check (deterministic):**
   ```
   node scripts/lib/tickets.mjs validate docs/work/plan.json   # graph integrity + write-scope collisions
   node scripts/lib/tickets.mjs status   docs/work/plan.json   # resolve blocked/ready, list claimable
   node scripts/gen-tickets-board.mjs    docs/work/plan.json   # regenerate docs/work/TICKETS.md
   ```
   If `validate` reports a **write-scope collision** involving an active module, STOP and surface it —
   do not hand off the overlapping module until the user resolves the scope overlap. Two people in the
   same files is the one thing this skill exists to prevent.
3. **Refuse-to-select-next-work gate (T26.3).** Before claiming, confirm it's actually safe to hand out
   MORE work: `node scripts/lib/tickets.mjs claim docs/work/plan.json <id> <actor>` enforces this itself
   and refuses with a clear `[x]` reason if either holds —
   - **hygiene is red**: the same collision/graph-integrity check from step 2 is red (`claim` re-checks
     it immediately before mutating, not just here) — fix the graph before handing out anything else;
   - **the actor's previous ticket is still open**: `claim`'s built-in WIP=1 check (T26.1) refuses if
     `<actor>` already owns another `claimed`/`in_progress` module elsewhere. An `in_review` ticket does
     NOT count as open — it has already been **closed** via a `close()` receipt (see below), the actor
     is just waiting on a reviewer's `accept()`. `node scripts/lib/tickets.mjs open-for docs/work/plan.json
     <actor>` answers this read-only, without attempting a claim, if you want to check first.
   Do not work around a refusal by hand-editing `plan.json` — fix the graph, or close/release the open
   ticket, then retry the real command.
4. **Present the claimable set** — for each `ready` + unclaimed module: id, title, write-scope,
   acceptance criteria, and its interface doc. This is the menu a newcomer picks from.

## Claiming a module → emit a HANDOFF (follow handoff rules)

On `/reflow claim <id>`: run `node scripts/lib/tickets.mjs claim docs/work/plan.json <id> <owner>` (this
IS the sanctioned way to set `owner`/`status: claimed` — step 3's gate runs automatically), regenerate
the board, then **emit a HANDOFF** for the module (per `agents/shared/EXECUTOR_SELECTION.md` — never
assume a spawn). The claimed module's contract becomes the HANDOFF contract:

```
════════════════════════════════════════════════════════════
HANDOFF → <owner/agent>  |  open new session → /<skill>   (default /code)
USER: open a new session, type /<skill>, paste everything below
════════════════════════════════════════════════════════════
SDLC-TASK for <agent>:

STAGE 0 — before any work: run
`node scripts/lib/tickets.mjs start docs/work/plan.json <id> <owner>`
and paste the printed "── start receipt: <id> ──" block verbatim, right here, before proceeding.
A HANDOFF that skips this stage has not proven it actually started the claimed ticket.

ROLE: <domain expert for this module>
CONTEXT (read first):
- <module.interface>                     -- the contract to build to
- <each dependency module's interface>   -- you code against these, not their internals
WRITE-SCOPE (exclusive): <module.write_scope>   -- edit nothing outside this
YOUR TASK: implement <module.title> to satisfy its acceptance criteria.
PRODUCE: <module.acceptance, as a checklist>
VERIFY before completing: run <module.verify>; all acceptance criteria met.
Completion Manifest at docs/work/manifests/<id>.md.

FINAL STAGE — completion signal (T26.3): once VERIFY passes, run
`node scripts/lib/tickets.mjs close docs/work/plan.json <id> <owner> --branch <b> --commits <c1,c2,...>`
and paste the printed "── close receipt: <id> ──" block VERBATIM into the Completion Manifest AND as
your last message. This receipt — not a self-asserted "<id> done" string — is the ONLY accepted
completion signal: `accept()` refuses to move the ticket to `done` without it pasted into the manifest,
and a self-asserted "<id> done" with no receipt is exactly the gap this closes (2026-07-07 incident).
════════════════════════════════════════════════════════════
END HANDOFF
════════════════════════════════════════════════════════════
```

Because each module's `write_scope` is exclusive and collisions were checked in step 2, multiple
claimed modules can be worked **in parallel** in separate sessions without clobbering each other.

## Close receipt = the only accepted completion signal (T26.3)

`close()` moves a ticket `in_progress → in_review` and prints a receipt (actor, branch, commits, the
`verify` command that was actually re-run, the manifest path, a timestamp). That receipt pasted verbatim
into the module's Completion Manifest is the durable proof `accept()` checks — a manifest that only ever
says "`<id> done -- ...`" with no receipt block is refused (`scripts/lib/tickets-lifecycle.mjs`'s
`manifestHasCloseReceipt()`, exercised by `scripts/validators/validate-close-receipt.sh` and its
`evals/fixtures/validators/validate-close-receipt/{red,green}` fixtures). The evidence in the receipt
(branch + every commit) must match what `close()` actually recorded — a hand-typed block that merely
looks like the receipt is rejected too.

## Notes
- Reflow itself runs inline (deterministic scripts + one HANDOFF on claim) — it does not fan out
  concurrent spawns, so it needs no executor gate; the single claim HANDOFF carries the full contract.
- Idempotent: re-running only advances statuses that newly qualify and regenerates the board.
