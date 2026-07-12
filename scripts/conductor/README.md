# conductor/ — M28 Conductor reference implementation (T28.x)

Field-proven on the Shipwright build (2026-07-11/12; see
`bpm-agent-amplifier/expertlessons/field-report-shipwright-conductor-run-2026-07-12.md`):
19 tickets landed unattended; provider-limit sleep-to-resume fired live at 05:20
and recovered; supervisor restarted the process across a fatal crash; the
sticky-findings + informed-APPROVE review gate eliminated both false-negative
(vanishing findings) and false-positive (immortal findings) failure modes.

- `conductor.mjs` — claim → fresh `claude -p` session per ticket in an isolated
  git worktree → out-of-session gates (board state, commits, write-scope diff,
  toolchain gate, diff-scoped validators) → independent review with sticky
  findings → merge --no-ff + dual push. Config-driven (`conductor.config.json`
  in the target repo). Board schema: RepoPulse-style plan.json
  (`tickets[]`, status todo|in_progress|blocked|done).
- `supervise.sh` — crash-restart layer (reset tree, relaunch, cap, STOP file).
- `models.json` — per-role model routing (maker/cheap/reviewer/security/escalate).

Adaptation TODO for this repo's module-ticket schema (T28.x): claim/close via
`scripts/lib/tickets.mjs` verbs instead of raw status flips; gates via
`run-handoff-gates.sh`; finding ledger per FIX_VERIFY_LOOP step-5 classes
(tier-aware budgets). Until then this runs plan.json product boards as-is.
