---
description: 'Reference card — tool choice + the 3 loop classes + STOP triggers in ~1.5KB. Long form: agents/shared/LOOP_PREVENTION.md.'
disable: true
mode: "all"
---
# Loop prevention — rule card

**Pick the tool first (most loops start here):** read a known path → `read`; find text → `grep`; find files → `glob`; list dir → `list`/`ls`; run/test/build → `bash` with a timeout; edit → `edit` (exact match) or `write` (whole file). Never `bash cat` a file you can `read`; never `bash find` for `glob`.

**Three loop classes — detect by evidence, not feeling:**
- **Failure loop** — same tool, same args, same error twice → change the args or the tool; third identical error → `BLOCKED: <tool> <args> → <error>` and stop.
- **Schema loop** — tool rejects your arguments → re-read the tool's parameter names once; second rejection → BLOCKED with the exact message.
- **Success loop** — calls succeed but no new file/line/fact appears for 3 calls → write what you have to disk and move to the next ledger item.

**Budgets (counters count REPEATS, not attempts):** 2 repeats per (tool,args); 3 no-progress calls; 1 schema re-read; 15 coordinator tool calls (30 for `--deep`).

**Universal STOP:** budget hit · context > 60% and "one more file" · output ready but unwritten > 500 tokens (write it now) · asked to confirm/choose (pick the documented default, state it, continue).

`BLOCKED:` lines carry evidence (tool, args, error/exit code), never a feeling.
