chore(release): v3.14.1 — the handoff reply, fixed from a TUI capture

A field capture of the opencode TUI (2026-10-21) showed two things the
v3.14.0 handoff emitter got wrong:

1. The TUI COLLAPSES tool output. A pointer printed by handoff-emit.sh as a
   tool result never reached the user ("what to paste?"). The emitter now
   prints a REPLY TO THE USER block, and the lead's reply IS that block,
   verbatim: five lines, the SDLC-TASK paste line inside a ```text fence
   (the one markdown construct the TUI renders as-is).
2. The "same message eight times" symptom was not a prompt loop. Every copy
   was cut within a few tokens of the same spot and regenerated from the
   top: the model's OUTPUT CAP (finish=length) on a ~600-token "gate verdict
   + next step + pointer" reply. Fixes: the handoff reply is five lines by
   construction and carries no gate recap (that goes in DELEGATION_LOG.md /
   STATE.md); plugins/expert-hooks.ts now warns in the TUI when a reply hits
   the cap, naming the model and the config key; doctor.sh warns when any
   model's limit.output is below 4096.

Also: run the emitter as its own bash call, not at the end of a
`git commit && …` chain — a failing earlier command hides the lint result.

Tests: handoff-emit 5/5 (reply template pinned), intake/handoff-done/
persistence/hook-guard passes green, agents:check in sync.
