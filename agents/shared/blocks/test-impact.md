---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Test impact (MANDATORY when you add or change code)

1. **The changed function is the unit of test work.** Input: `git diff -U0 <base>...HEAD` → every changed or added function. For each: write a test, or cite one that already exercises it. "The file has tests" is not an answer.
2. **New tests declare covers:** `node ~/.config/opencode/scripts/test/map.mjs declare <test> <sources...>` (sources = files it imports or exercises, spawned scripts included). It writes the committed `.sdlc/test-covers.json`; commit it with the test.
3. **Report in the HANDOFF/manifest:** changed functions covered (new) `fn → test`; already covered `fn → <file>::<name>`; left `fn` (rated nice-to-have, with the reason).
4. **FIX_BACKLOG rows that need a test** carry `Test: <file>::<name> (new|existing)`; `validate-fix-backlog-closed.sh` closes such a row only when that file shows `pass` in `docs/work/test/ledger.json`.
5. **Gate per ticket:** the impact selection (`validate-tests.sh --scope impact`) plus the P0 always-set must pass. The full run belongs to the integration review. A test that fails on the impact run but passes alone is reported as flaky — never retried more than once.
