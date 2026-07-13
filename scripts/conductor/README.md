# conductor/ — M28 Conductor (T28.1)

Unattended ticket executor for a **target project's** module-contract
`plan.json` (`docs/TICKET_SCHEMA.md`). Originally ported field-proven from
the Shipwright build (2026-07-11/12) as a reference implementation; T28.1
(2026-07-13) adapted it to this repo's actual lifecycle instead of
shipwright's flat `todo/in_progress/blocked/done` board:

- `conductor.mjs` — claim (WIP=1, via `scripts/lib/tickets.mjs`'s
  `claim`/`start`/`close`/`accept`/`release`) → fresh `opencode run` session
  per ticket in an isolated git worktree, no git/plan.json access inside the
  session → gates run from OUTSIDE (`validate-scope.sh` on the dirty tree,
  then a single checkpoint commit, then `close()` — which itself runs the
  ticket's `verify` command, normally `run-handoff-gates.sh` covering scope
  + Completion Manifest truth (`validate-completion-manifest.sh`) + tracker)
  → `accept()` by a distinct reviewer identity → merge `--no-ff` + dual push
  → next. Halts with a board-state summary written to
  `docs/work/CONDUCTOR_HALT.md` when nothing is claimable. `STOP` file in
  `--root` is checked between tickets. Per-ticket session counter
  (`--max-attempts`, default 2, per MASTER_PROMPT.md rule 9) — a ticket
  whose gates fail on every attempt is `release()`d back to `ready` with the
  gap history recorded, never advanced to `in_review`/`done`.
- `supervise.sh` — crash-restart layer (reset target tree, relaunch, cap,
  `STOP` file in the target root).
- `resume.mjs` (T28.5) — resume + drift refusal. On every startup, before a
  single ticket is (re-)claimed, any module left `claimed`/`in_progress` and
  owned by THIS actor (orphaned by a killed prior run) is checked against its
  receipts (`docs/work/conductor-log.jsonl`) and the git reality of its
  worktree/branch: a worktree already carrying real committed work is
  **re-verified** through the same scope/close gates — never re-run through
  a fresh `opencode` session, which would duplicate the killed run's work —
  while a plan.json claim with no receipt trail behind it, internally
  inconsistent evidence, or a branch already merged into main that plan.json
  never advanced past is **drift**: the whole run refuses to start (exit 3),
  surfacing every divergence, rather than guessing which source is right.
  plan.json plays the STATE.md role here (T27.4's drift-check pattern —
  claims vs receipts vs disk — applied to this ticket lifecycle instead of
  the SDLC's phase-based STATE.md, which this Conductor doesn't use).
- `models.json` — per-role model routing. **Not yet wired into
  `conductor.mjs`** — T28.2 (`blocked(T28.1)`) is scoped to pass `--model`
  per role and mechanically enforce maker != reviewer model. Today
  `conductor.mjs` accepts one flat `--model` for every session, and the
  maker/reviewer split in the Completion Manifest (`Maker:`/`Verifier:`
  lines) is identity-enforced only (same model, different declared names) —
  a known, intentional limitation of this ticket's scope.

## Test

`node --test scripts/conductor/conductor.test.mjs` — builds a real temp git
repo with a 3-ticket fixture `plan.json`, a stub `opencode` binary
(`OPENCODE_BIN` env override) that plays two tickets straight (writes
in-scope files + a valid Completion Manifest) and fails the third
(out-of-scope write), then runs `conductor.mjs` against it end-to-end: real
`tickets.mjs` lifecycle, real `run-handoff-gates.sh` +
`validate-completion-manifest.sh` + `validate-scope.sh`, real git worktrees
and merges. Not wired into `scripts/test.ts`'s Pass-N suite (out of this
ticket's `scripts/conductor/**` write scope) — run it standalone or as a
fast-follow adds a new Pass.

`node --test scripts/conductor/resume.test.mjs` (T28.5) — same
real-fixture style: one case hand-reconstructs a killed-mid-ticket state
(real `claim()`/`start()`, a real git worktree/branch with a committed
checkpoint, a hand-written receipts log matching what that run would have
logged) and proves a fresh `conductor.mjs` invocation lands it via
re-verification with the `opencode` stub never invoked; the other
hand-doctors plan.json with no receipt trail behind it and proves resume
refuses (exit 3) without touching plan.json or spawning any session.

## Deferred to later M28 tickets

- **T28.4** — `--breakpoint ticket|wave|never`, NEVER-AUTO parking queue,
  morning-review summary.

**Local-tier dispatch note (T30.8):** `runSession()` always spawns
`opencode run` — if a future ticket adds routing to a *different* local
model tier via `opencode-local`'s sync-then-exec wrapper, call
`node scripts/sync-model-limits.mjs --config <opencode.json> --write`
immediately before that spawn (same pattern as `scripts/opencode-local` and
`run-until-done.sh`'s `sync_model_limits()`).
