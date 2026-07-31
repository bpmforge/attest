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
- `/reflow audit [plan.json] [--skip-verify]` — reconciliation mode (T26.4): the incident
  recovery tool, not a phase-gate check. Use it when a plan.json's process trail may already be
  broken (self-asserted "done" with no claim/close history — the 2026-07-07 incident) and you
  need to know what the CODE actually says was built, independent of what the tickets claim.

## Procedure

Locate the plan (`docs/work/plan.json`; if none, tell the user to run `/sdlc feature`/`/sdlc init`
so the module graph exists). Then:

1. **Mark done.** A module reaches `done` ONLY through `accept()` (T26.1/T26.3) — never hand-set. If a
   module is sitting `in_review` with its owner's work actually reviewed, run
   `node ~/.config/opencode/scripts/lib/tickets.mjs accept docs/work/plan.json <id> <reviewer>` (reviewer ≠ owner). Do not
   mark done on hope — `accept()` itself refuses unless the module's Completion Manifest has the
   `close()` receipt pasted into it (see "Close receipt = the only accepted completion signal" below).
2. **Recompute + collision check (deterministic):**
   ```
   node ~/.config/opencode/scripts/lib/tickets.mjs validate docs/work/plan.json   # graph integrity + write-scope collisions
   node ~/.config/opencode/scripts/lib/tickets.mjs status   docs/work/plan.json   # resolve blocked/ready, list claimable
   node ~/.config/opencode/scripts/gen-tickets-board.mjs    docs/work/plan.json   # regenerate docs/work/TICKETS.md
   ```
   If `validate` reports a **write-scope collision** involving an active module, STOP and surface it —
   do not hand off the overlapping module until the user resolves the scope overlap. Two people in the
   same files is the one thing this skill exists to prevent.

   **External tracker mirror (optional).** If the project runs against Jira
   (`TRACKER_BACKEND=jira`, or `JIRA_BASE_URL` set — see `references/jira-adapter.md`),
   `plan.json` stays the source of truth and Jira is a mirrored ledger. Once, after the
   backlog exists, create the Jira epics/stories/links: `scripts/jira/jira.sh sync-plan`.
   Thereafter the lifecycle verbs mirror automatically (via `scripts/jira/jira.sh claim|
   start|comment|close|accept|release`, which run the same `tickets.mjs` engine then
   mirror), and `scripts/jira/jira.sh reconcile` converges any drift. When Jira is not
   configured this whole paragraph is a no-op — the `tickets.mjs` commands above are the
   ledger. The `validate-jira-hygiene.sh` gate flags unmirrored work, but only when a
   backend is configured.
3. **Refuse-to-select-next-work gate (T26.3).** Before claiming, confirm it's actually safe to hand out
   MORE work: `node ~/.config/opencode/scripts/lib/tickets.mjs claim docs/work/plan.json <id> <actor>` enforces this itself
   and refuses with a clear `[x]` reason if either holds —
   - **hygiene is red**: the same collision/graph-integrity check from step 2 is red (`claim` re-checks
     it immediately before mutating, not just here) — fix the graph before handing out anything else;
   - **the actor's previous ticket is still open**: `claim`'s built-in WIP=1 check (T26.1) refuses if
     `<actor>` already owns another `claimed`/`in_progress` module elsewhere. An `in_review` ticket does
     NOT count as open — it has already been **closed** via a `close()` receipt (see below), the actor
     is just waiting on a reviewer's `accept()`. `node ~/.config/opencode/scripts/lib/tickets.mjs open-for docs/work/plan.json
     <actor>` answers this read-only, without attempting a claim, if you want to check first.
   Do not work around a refusal by hand-editing `plan.json` — fix the graph, or close/release the open
   ticket, then retry the real command.
4. **Present the claimable set — grouped by lane.** `tickets.mjs status` (step 2) already breaks the
   claimable set out per lane (`claimableByLane()`, T10.3) — every lane gets a line, including a `(0)`
   line for a lane with nothing claimable right now, matching `docs/work/TICKETS.md`'s lane board. Lane
   is the parallel-safety partition, so this is the menu a newcomer picks from without cross-referencing
   write-scopes by hand: for each `ready` + unclaimed module, under its lane, show id, title, write-scope,
   acceptance criteria, and its interface doc.

## Claiming a module → emit a HANDOFF (follow handoff rules)

On `/reflow claim <id>`: run `node ~/.config/opencode/scripts/lib/tickets.mjs claim docs/work/plan.json <id> <owner>` (this
IS the sanctioned way to set `owner`/`status: claimed` — step 3's gate runs automatically), regenerate
the board, then **emit a HANDOFF** for the module (per `agents/shared/EXECUTOR_SELECTION.md` — never
assume a spawn). The claimed module's contract becomes the HANDOFF contract:

```
════════════════════════════════════════════════════════════
HANDOFF → <owner/agent>  |  run by: <owner/agent> via /<skill>   (default /code)
════════════════════════════════════════════════════════════
SDLC-TASK for <agent>:

STAGE 0 — before any work: run
`node ~/.config/opencode/scripts/lib/tickets.mjs start docs/work/plan.json <id> <owner>`
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
`node ~/.config/opencode/scripts/lib/tickets.mjs close docs/work/plan.json <id> <owner> --branch <b> --commits <c1,c2,...>`
and paste the printed "── close receipt: <id> ──" block VERBATIM into the Completion Manifest AND as
your last message. This receipt — not a self-asserted "<id> done" string — is the ONLY accepted
completion signal: `accept()` refuses to move the ticket to `done` without it pasted into the manifest,
and a self-asserted "<id> done" with no receipt is exactly the gap this closes (2026-07-07 incident).
════════════════════════════════════════════════════════════
END HANDOFF
════════════════════════════════════════════════════════════
```

Write that block to `docs/work/HANDOFF_<agent>.md`, then print the pointer for the user — nothing
addressed to the user goes *inside* the `════` delimiters, since the specialist reads that body as
its task and will relay any `USER:` line back at you:

```
── NEXT HANDOFF ──────────────────────────────
Open agent:  /<skill>   (default /code)
Paste this one line into it:

    SDLC-TASK for <agent>: read docs/work/HANDOFF_<agent>.md and execute it.

Come back with the close receipt.
──────────────────────────────────────────────
```

The paste line **must start with `SDLC-TASK for`** — that prefix is the trigger for Bounded Task
Mode. A bare "open /code, it reads …" pointer lets smaller models fall through to their default mode
and hand the ticket straight back instead of working it.

Because each module's `write_scope` is exclusive and collisions were checked in step 2, multiple
claimed modules can be worked **in parallel** in separate sessions without clobbering each other.

## Close receipt = the only accepted completion signal (T26.3)

`close()` moves a ticket `in_progress → in_review` and prints a receipt (actor, branch, commits, the
`verify` command that was actually re-run, the manifest path, a timestamp). That receipt pasted verbatim
into the module's Completion Manifest is the durable proof `accept()` checks — a manifest that only ever
says "`<id> done -- ...`" with no receipt block is refused (`scripts/lib/tickets-lifecycle.mjs`'s
`manifestHasCloseReceipt()`, exercised by `~/.config/opencode/scripts/validators/validate-close-receipt.sh` and its
`evals/fixtures/validators/validate-close-receipt/{red,green}` fixtures). The evidence in the receipt
(branch + every commit) must match what `close()` actually recorded — a hand-typed block that merely
looks like the receipt is rejected too.

## Audit mode — reconciliation after a lost audit trail (T26.4)

Distinct from `validate-ticket-hygiene.sh` (T26.2): that validator is a forward-looking GATE —
it blocks new claims while a plan.json's *recorded* evidence is incomplete, and checks
evidence→code correspondence (does a cited commit stay inside its module's write_scope?). Audit
mode answers the reverse question a post-incident cleanup actually needs — code→evidence
correspondence — and is a manually-invoked recovery tool, not a chained gate:

```
node ~/.config/opencode/scripts/lib/reflow-audit.mjs <plan.json> [--repo <path>] [--out <path>] [--skip-verify]
```

Grades every non-`blocked` module against real git history, independent of what `status` claims:

- **manifest** — does `module.manifest` exist on disk (resolved relative to `plan.json`'s directory)?
- **verify** — does `module.verify`, re-run now (never a caller override — same rule `close()`
  already follows), exit 0? Pass `--skip-verify` when the target plan's `verify` fields aren't
  known-safe runnable commands (bare doc paths, side-effecting scripts) — a module simply cannot
  reach `VERIFIED` without a confirmed pass, so skipping only ever costs precision, never
  fabricates one. "Not configured" and "skipped" are distinct from "ran and failed" — a module
  with no `verify` field at all is not penalized for it.
- **evidence** — do `module.evidence.commits` (if any) actually exist in git history?
- **code** — does `git log` on the *current checkout* (HEAD, not `--all` — an unmerged branch
  should never manufacture a false grade) show real commits touching this module's `write_scope`?

Three grades: **VERIFIED** (manifest + verify + evidence all check out), **ORPHAN-CODE** (real
commits touch the write_scope but no evidence was ever recorded — the 2026-07-07 incident
pattern: code was built outside the lifecycle machinery), **UNVERIFIED** (everything else,
including not-yet-started tickets — that alone is not a red flag). Writes
`docs/work/RECONCILIATION.md` (or `<plan-dir>/RECONCILIATION.md` for an out-of-repo target, or
wherever `--out` points) with a summary + one subsection per graded module explaining exactly
which checks passed. Use the ORPHAN-CODE section as the reconciliation punch list: confirm what
was actually built, then record evidence retroactively (or re-close properly) before trusting the
ticket layer again.

## Notes
- Reflow itself runs inline (deterministic scripts + one HANDOFF on claim) — it does not fan out
  concurrent spawns, so it needs no executor gate; the single claim HANDOFF carries the full contract.
- Idempotent: re-running only advances statuses that newly qualify and regenerates the board.
