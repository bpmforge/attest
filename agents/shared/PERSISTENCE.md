---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Persistence (do not end your turn early)

The canonical prompt-side fix for the #1 accidental pause — *announce-then-stop*, where the
model says "I'll now edit X" and ends the turn with no tool call, so the runtime legitimately
ends the loop. OpenAI measured this reminder at ~+20% on SWE-bench for agentic runs. Plugins
(`opencode-auto-resume`) are the backstop; this is the source fix and costs nothing per pause.

- You are an agent: keep going until the task is completely handled before ending your turn.
  **Never end your turn after ANNOUNCING an action — perform it.**
- **The ask-variant (post-compaction):** after an autocompaction, do not end your turn asking
  "should I proceed?" / "say Proceed to continue" / presenting your plan for approval. A
  compaction summarizes history; it does not revoke the authorization the task arrived with.
  Field basis (2026-07): a coder kept a perfect summary — every step, the exact next command —
  then stalled the pipeline waiting for a "Proceed" nobody was there to type. Resume executing
  the summary's next step immediately.
- If you cannot call a tool, say exactly why in one line (`BLOCKED: <reason>`); never emit a
  plan as your final message when execution was requested.
- Before ending your turn, check: (1) completion phrase emitted **or** `BLOCKED:` stated;
  (2) tracker / todos updated; (3) no step of your own plan left silently undone.
- Do not stop because the response is getting long — finish the step, then stop.

Governs the moment **before** the completion phrase; `BOUNDED_TASK_CONTRACT.md` "Stop means
stop" governs **after** it. Persistence ≠ ignoring gates: a real human gate or a NEVER-AUTO
pause (`AUTONOMY_PROTOCOL.md`) is a legitimate stop, not an early end.

## Persistence ≠ selecting new work over a red gate (T26.3)

"Keep going until the task is completely handled" means finish the unit of work you are ON — it
never means reach past a red gate to grab a NEW ticket. Before selecting/claiming the next ticket
(`/reflow claim`, or `run-until-done.sh` starting a fresh session's worth of work), two conditions
must both hold, and this is code-enforced, not just prose: hygiene is clean (`node scripts/lib/
tickets.mjs claim` itself refuses on a red ticket-graph check; `run-until-done.sh`'s
`next_work_gate_ok()` refuses to start at all if `validate-state-drift.sh`/`validate-tickets.sh` are
red), and your own previous ticket is actually closed — a `close()` receipt exists (`in_review` or
later), not merely claimed/in_progress (`tickets.mjs open-for <plan> <actor>` / claim's built-in
WIP=1 check). A refusal from either of those is the same kind of legitimate stop as a NEVER-AUTO
pause: report it (`BLOCKED: <reason>`), don't route around it by hand-editing `plan.json` or
skipping the receipt.
