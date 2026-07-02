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
- If you cannot call a tool, say exactly why in one line (`BLOCKED: <reason>`); never emit a
  plan as your final message when execution was requested.
- Before ending your turn, check: (1) completion phrase emitted **or** `BLOCKED:` stated;
  (2) tracker / todos updated; (3) no step of your own plan left silently undone.
- Do not stop because the response is getting long — finish the step, then stop.

Governs the moment **before** the completion phrase; `BOUNDED_TASK_CONTRACT.md` "Stop means
stop" governs **after** it. Persistence ≠ ignoring gates: a real human gate or a NEVER-AUTO
pause (`AUTONOMY_PROTOCOL.md`) is a legitimate stop, not an early end.
