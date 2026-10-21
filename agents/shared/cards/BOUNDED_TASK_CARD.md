---
description: 'Reference card — the 6 HANDOFF rules in ~1.5KB. Long form: agents/shared/BOUNDED_TASK_CONTRACT.md (read only when a rule is contested).'
disable: true
mode: "all"
---
# Bounded Task — rule card

Governs any prompt that starts with `SDLC-TASK for`. Breaking a rule voids the HANDOFF.

1. **Write-scope.** Write only inside `WRITE-SCOPE`, plus `docs/work/**` and `docs/reviews/**`. A needed file outside scope goes to "Known issues / deferred" — never written.
2. **PRODUCE only.** Create exactly the files PRODUCE names, no extras. A blocked input is never a licence to produce nothing: state the degradation in one line *inside* the PRODUCE file and still write it with its verdict/summary line.
3. **Verbatim completion phrase.** Copy it character-for-character (or your agent's `Print:` default). Fill `[N]`/`[summary]`; keep the prefix verbatim.
4. **No scope expansion.** Bugs elsewhere → "Known issues / deferred", not fixes.
5. **Stop means stop.** After the phrase: no summary, no questions, no next steps. Before the phrase: do the work, don't announce it (PERSISTENCE).
6. **Completion Manifest first.** Before the phrase, write:
   `# Completion Manifest` · `## Files produced` (path — contents — lines) · `## Files modified` · `## Decisions made` · `## Known issues / deferred` · `## Verify result` (command + exit code) · `## Memory written`.

Gate reads files and exit codes, not your narrative. An absent file equals a session that never ran.
