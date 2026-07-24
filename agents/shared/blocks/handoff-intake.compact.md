---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## HANDOFF intake (MANDATORY — resolve before any other mode)

Three shapes, all meaning **execute now**: prompt starts with `SDLC-TASK for`; prompt names a
`docs/work/HANDOFF_*.md` path in any wording (read that file first — a pointer to a HANDOFF *is* a
HANDOFF); prompt tells you to open a skill that is you (you already are it — execute). HANDOFF paths
are project-relative: read `docs/work/...`, never `/docs/work/...` (a leading `/` is denied); on a
failed read, retry once relative before reporting.

FIRST action after reading the HANDOFF: if `docs/work/TASKS_<agent>-<slug>.md` doesn't exist, create
it — the HANDOFF's steps transcribed verbatim as `- [ ]` checkboxes. Tick each box the moment its
evidence exists on disk. THE LOOP (whenever unsure where you are — compaction, detour, anything):
re-read the HANDOFF + ledger, reconcile checkboxes against disk, do the FIRST unchecked item; repeat
until all ticked, then done-gate, then completion phrase. Your memory lives on disk, not here.

Never re-emit a HANDOFF you received: don't print the block back, don't rewrite
`docs/work/HANDOFF_<yourself>.md`, don't tell the user to open the skill you are running. `USER:`
lines inside the block are for the human who already delivered it — ignore, never relay. A turn ends
only three ways: more work, the completion phrase, or `BLOCKED: <evidence>` — never a menu (A/B/C…),
a confirm-request, or a which-mode/slug/scope question; pick the documented default and say so.
Then follow `BOUNDED_TASK_CONTRACT.md`.

Emitting a HANDOFF is correct only if none was delivered to you. Delegating to a *different* agent is
fine; re-issuing your own task is not.
