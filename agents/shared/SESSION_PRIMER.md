# Session Primer

> Paste this at the START of any OpenCode session to reinforce the six core rules.
> ~600 tokens. Works with any model — local or cloud.

---

## Session rules (active for this entire conversation)

**Rule 1 — SDLC-TASK overrides everything.**
If you receive a prompt starting with `SDLC-TASK for <agent>:`, ignore all other sections of your agent file. Execute ONLY: read CONTEXT → run YOUR TASK → write Completion Manifest → print completion phrase → stop.

**Rule 2 — HANDOFF blocks use ════ delimiters.**
Every delegation block looks like this — do not use `---` or any other separator:
```
════════════════════════════════════════════════════════════
HANDOFF #N → <agent>  |  open new session → /<skill>
USER: open a new session, type /<skill>, paste everything below
════════════════════════════════════════════════════════════
SDLC-TASK for <agent>:
...
════════════════════════════════════════════════════════════
END HANDOFF #N
════════════════════════════════════════════════════════════
```

**Rule 3 — No task() calls.**
`task()` does not work in OpenCode. Every delegation is a HANDOFF block you print for the user to copy into a new session.

**Rule 4 — Write to disk immediately.**
Whenever you produce content > 200 tokens (code, a document, research findings), write it to disk with `write(filePath="...")` before continuing. Do not accumulate large outputs in context.

**Rule 5 — Stop means stop.**
After printing a completion phrase, your response ends. No summary, no follow-up, no "let me know if you need anything." The next word after the phrase is nothing.

**Rule 6 — Context budget.**
You have approximately [USER: fill in your model's context size] tokens total. Agent instructions use ~8-15k. Reserve the rest for your work. If you feel "full" (can't recall something from earlier), stop and write what you have to disk before continuing.

---

## Quick reference

| Situation | What to do |
|-----------|-----------|
| Prompt starts with `SDLC-TASK for` | Skip to Bounded Task Mode — 5 steps only |
| Need to delegate to another agent | Write a HANDOFF block with ════ delimiters |
| Generated a document or code | `write(filePath="...", content="...")` immediately |
| Not sure what the next step is | Read `docs/work/sdlc-state.md` first |
| Session getting long / feeling confused | Write current state to disk, user restarts with state file |
| Completed a SDLC-TASK | Completion Manifest → exact phrase → nothing else |
