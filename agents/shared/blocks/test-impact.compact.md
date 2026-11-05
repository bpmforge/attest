---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Test impact (MANDATORY when you add or change code)

1. Unit = changed function (`git diff -U0`): write a test or cite one (`<file>::<name>`).
2. New tests: `node ~/.config/opencode/scripts/test/map.mjs declare <test> <sources...>`; commit `.sdlc/test-covers.json`.
3. Report: covered (new) / already covered (cite) / left (nice-to-have + reason).
4. Backlog rows needing a test: `Test: <file>::<name> (new|existing)`; closed only if it passed in the ledger.
5. Gate: impact selection + P0 always-set; full at integration review. Fails on impact, passes alone = flaky, not retried.
