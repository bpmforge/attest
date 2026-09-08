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
  `docs/work/CONDUCTOR_HALT.md` for file-backed boards, or the external
  worktree runtime directory for a JIRA board. `STOP` file in
  `--root` is checked between tickets. Per-ticket session counter
  (`--max-attempts`, default 2, per MASTER_PROMPT.md rule 9) — a ticket
  whose gates fail on every attempt is `release()`d back to `ready` with the
  gap history recorded, never advanced to `in_review`/`done`. Provider,
  reviewer-session, and missing-review-output failures are released as
  `ticket.blocked` and do not spend the feature's remaining coding attempts.
  Under `--no-merge`, a green candidate is pushed and logged
  `ticket.ready-for-pr`; `accept()` is not called and the external ticket stays
  In Progress until a separate merge process verifies main ancestry.
- `supervise.sh` — crash-restart layer (preserve target/worktree state,
  relaunch, cap, `STOP` file in the target root). Deterministic gate exits
  (configuration, drift, baseline, main-sync) stop rather than churn. The
  stop marker is checked only between
  tickets; it never interrupts a reviewer, fix, or runtime session mid-ticket.
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
- Per-role model routing lives in the **repo-root `models.json`**
  (`roles.coder` / `roles.reviewer` / `roles.challenger`), or in a
  `models.json` at the target project's root, or wherever `--models` points.
  There is no `models.json` in this directory — one used to sit here
  describing a `maker`/`cheap`/`cheapLanes` schema that nothing has ever
  parsed, and it cost real debugging time as a decoy. Two startup gates guard
  the routing: **G4** refuses a config whose coder and reviewer/challenger are
  the same model (`--role-gate warn` downgrades it), and **G4b** refuses a
  config naming a model this opencode install cannot resolve
  (`--model-gate warn|off`).

## Bounds (every loop has one)

A bounded unattended run is only as bounded as its weakest loop, so each one
has an explicit ceiling and they are reported separately:

| Flag | Bounds | Default |
| --- | --- | --- |
| `--max-tickets N` | Tickets that successfully **land** (or reach the PR boundary under `--no-merge`). A **success target**, not a work budget. | 999 |
| `--max-processed N` | Tickets this invocation may **claim at all**, whatever the outcome. A hard **activity ceiling**. | unbounded |
| `--max-attempts N` | Coding attempts per ticket. | 2 |
| `--fix-iterations N` | Bounded review→fix→re-review iterations per attempt. | 3 |
| `--session-timeout-retries N` | Same-worktree retries after a session **timeout**, separate from the provider rate-limit retries inside `runSession()`. | 0 |
| `--session-minutes N` | Wall-clock ceiling on one session. | 45 |

`--max-tickets` and `--max-processed` are deliberately different counters.
`landed` only advances on a *verified success*, so on a board with a low
success rate `--max-tickets 1` can claim, run and fail an unbounded number of
tickets before it stops — it is a target, and a target is not a budget. Set
`--max-processed` to bound how much of an unfamiliar board one invocation may
touch.

Orphans reconciled at startup (see `resume.mjs`) are reported as `resumed` and
do **not** consume the `--max-processed` budget: they were claimed by a
previous invocation, so charging them here would make the flag mean two
different things depending on how the last run died. `conductor.end` reports
`landed`, `processed`, `resumed` and the `stopReason` that ended the loop.

Every numeric flag is validated as an integer before the board is touched. A
typo used to become `NaN` and silently exit reporting `landed=0`, which is
indistinguishable from an empty board.

## Timeout safety and platform support

`spawnSync`'s `timeout` signals the **direct child only**, and a session is
never one process — it is `opencode` shelling out to a package manager, a
compiler, a formatter, a test runner. Those descendants outlive the timeout,
so a same-worktree retry races them over source files, lockfiles, review
documents and build output.

Sessions therefore spawn into their own process group (`detached`), and a
timeout kills the **whole group**: SIGTERM, a bounded grace period, SIGKILL,
then a liveness check. A retry is permitted only once that check proves the
group is empty (`scripts/lib/session-containment.mjs`).

Containment **fails closed**. A missing pid, a group that survives SIGKILL, or
a platform without process-group semantics all refuse the retry and return exit
124 rather than starting a second writer beside an unknown descendant. On
Windows that is always the case: it would need a Job Object, which nothing here
creates, so Windows performs **zero** same-worktree timeout retries.

Timeouts are also classified from *both* shapes Node reports them in — a
`signal` and `error.code === 'ETIMEDOUT'` — because the check for the second
used to sit below a generic error return, so the same timeout was logged as a
timeout on one machine and as a session failure on the next.

## What crosses an attempt boundary

When the bounded fix loop stays red, the attempt is discarded and the next one
starts from a fresh worktree off `main`. It receives the **final blocking
findings themselves**, not just the reviewer names — reviewer names are routing
metadata, not defect descriptions, and an attempt told only "code-reviewer
still blocking" has to rediscover the defect from nothing.

The findings are bounded twice (per-document and overall, with truncation
announced), carry only *non-approved* verdicts, mark an unreadable review
`(missing)` rather than inferring approval, and are fenced inside explicit
`BEGIN/END UNTRUSTED REVIEW EVIDENCE` markers. That last part is not cosmetic:
a review document quotes the source it reviewed, so it can carry
instruction-shaped text into the prompt of the agent about to rewrite that
source.

## Verdicts are read, not grepped

A review or runtime document's verdict is the **last line that is itself a
verdict** (`readVerdict()` in `scripts/lib/runtime-verdict.mjs`), not any
occurrence of the word anywhere in the body.

The prompts contain the strings `VERDICT: APPROVED` and `RUNTIME: PASS` as
instructions, so an unanchored match meant any model that restated its
instructions self-approved — a document ending `VERDICT: CHANGES REQUESTED`
read as APPROVED. A missing verdict line is treated as blocking, and a line
naming both outcomes fails closed.

Relatedly: **any code change after the last approving review invalidates that
approval.** Round 3 runs as the coder agent with the worktree writable, so a
runtime session that edits an implementation file — even one inside
`write_scope` — produces a candidate nobody reviewed. Non-document changes
found after the review rounds fail the attempt rather than being folded into
the closed commit.

## Before you point it at a repo

Three properties of the target repo are load-bearing, and all fail in ways
that look like an agent problem:

1. **The models must resolve.** `opencode run --model <unknown>` does not
   error — it silently falls back to the agent's own model. A `models.json`
   naming a provider you have not authenticated therefore runs every role on
   one model while the log, the receipts and the manifest all report the ids
   you configured. G4b now refuses this at startup; check `opencode models`
   for the ids your install actually serves.
2. **The baseline must be formatter-clean.** The post-edit hook runs
   `rustfmt`/`prettier`/`black` on files a session touches. If a file is
   committed unformatted, the first session to touch anything reformats it,
   it lands outside the ticket's `write_scope`, and the scope gate refuses —
   correctly, and unavoidably, no matter how disciplined the agent is. Run
   your formatter and commit before the first run. When a violation is
   whitespace-only the conductor now says so explicitly
   (`gates.evidence-cosmetic`) instead of leaving you to guess.
3. **The baseline must pass a ticket-independent health command.** Configure
   `baselineVerify` in the target's `conductor.config.json` with checks that
   do not require a ticket manifest or not-yet-built deliverable. The command
   runs once in a clean detached `main` worktree before any ticket is claimed.
   A failure exits 4, consumes zero coding attempts, and writes evidence under
   the external worktree runtime directory. The ticket-specific `close()` gate
   remains strict and still requires its own configured verify command to exit
   zero.

Before baseline verification, the conductor fetches every configured remote's
`main`. It fast-forwards a clean local `main` when the remotes agree and refuses
with exit 5 when they diverge or local history is not a remote ancestor. This
prevents a green preflight against stale local source.

When a scope or later gate fails, evidence is preserved under the external
worktree directory (`.evidence/`) rather than inside the target repository.
The worktree that held it is destroyed immediately after, so this is the only
record of what actually changed. Keeping runtime evidence outside the target
also prevents a failed ticket from dirtying `main` or being force-committed by
the conductor.

## Test

`node --test scripts/conductor/conductor.test.mjs` — builds a real temp git
repo with a 3-ticket fixture `plan.json`, a stub `opencode` binary
(`OPENCODE_BIN` env override) that plays two tickets straight (writes
in-scope files + a valid Completion Manifest) and fails the third
(out-of-scope write), then runs `conductor.mjs` against it end-to-end: real
`tickets.mjs` lifecycle, real `run-handoff-gates.sh` +
`validate-completion-manifest.sh` + `validate-scope.sh`, real git worktrees
and merges. Two further cases pin **G4b** from both sides — it must refuse a
role model the install cannot resolve, and it must *not* read an empty
`opencode models` list as "nothing resolves" (v3.1.2). Every fixture carries
its own `models.json` and every stub answers `models`, so the suite never
depends on which providers the developer has authenticated.

All three files run inside `npm test` as **Pass 53**
(`scripts/test-conductor-suite.ts`), which shells out to `node --test` with the
TAP reporter pinned and fails the suite by name when any conductor test goes
red. Until v3.1.2 they were standalone — out of the original ticket's
`scripts/conductor/**` write scope — which is exactly how v3.1.0 and v3.1.1
both shipped with all four of these tests RED while `npm test` reported green.
A zero-test run is treated as a failure too: an empty match must never read as
a pass.

`node --test scripts/conductor/conductor.hardening.test.mjs` — the GH #6
hardening regressions, and the only end-to-end coverage of the **full 3-round
loop** (review → bounded fix → runtime); every other conductor fixture runs at
`--rounds 1`. Every case is a **negative control**: it passes silently when its
defect is present, which is why these defects survived a 725-test suite. The
descendant-liveness case asserts the orphaned grandchild is *alive* after the
direct child is killed before asserting containment removes it — if that first
assertion ever fails, the platform is reaping the tree on its own and the rest
of the test proves nothing.

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

## v3.9.0 — hardened by the first live /autopilot proof (2026-09-01)

Four changes, each from a receipt in a real end-to-end run (two tickets,
OpenAI terra/luna, full code → dual review → runtime → merge chain):

- **Single-conductor lock.** `.git/conductor.lock` (runtime dir when the
  board is file-backed). A second conductor on the same root exits 4 —
  observed live: a supervised run and an orphaned detached run interleaved,
  one released a ticket while the other's rounds went green, and the green
  was never landed. Stale locks from dead pids clear themselves.
- **The machine owns the runtime verdict.** Round 3's agent document is the
  DIAGNOSIS; every FAIL is re-checked by the conductor running the ticket's
  own `verify` in the worktree, and a fail the machine cannot reproduce is
  overridden (logged `round3.runtime.overridden`). Observed live: a grounded
  FAIL quoting a real exit 1 the agent produced by running the verify in the
  wrong directory, while the identical candidate passed minutes later.
- **Lean reviewer default.** `agents.reviewer` defaults to `build`: the
  code-reviewer orchestrator (7-specialist dispatch) died docless four
  consecutive bounded unattended rounds; the lean agent, given the round's
  self-contained prompt, approved with a written document first try. Set
  `agents.reviewer: "code-reviewer"` in models.json to restore the
  orchestrator for attended runs.
- **Evidence inside the project.** `docs/work/.conductor-evidence/`
  (self-gitignored) — the old worktree-base location was outside the root
  and unattended sessions' reads of their own run's evidence were
  permission-auto-rejected.

Operator loop (kick off / track / reconcile without handoffs): the OPERATE
section of `skills/autopilot/SKILL.md`.
