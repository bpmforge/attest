# edit-tasks — code-edit tasks with HIDDEN behavioural tests

Fixtures for the gateguard A/B (docs/work/GROUP_K_DESIGN.md, K2). Each task is a tiny plain-Node-ESM repo plus a hidden
test the agent never sees. Run: `node scripts/run-edit-tasks.mjs --help`.

```
<id>/
  task.json        { "id", "kind": "multi-module|isolated|reuse-trap", "hazard": "<one line: what a careless edit breaks>", "prompt": "<what the agent is told>" }
  repo/            starting tree the agent works in (src/*.mjs, optional data files). NO test files the agent could copy the assertions from.
  hidden/test.mjs  node:test file; imports the code under test via  process.env.WORKDIR + "/src/..."  (never a relative path)
  solution/        files overlaid on repo/ to make hidden/test.mjs PASS (used only to prove the task is solvable)
```
Rules: `node --test hidden/test.mjs` with WORKDIR=repo/ MUST FAIL (behaviour missing); with WORKDIR=repo+solution MUST PASS.
The prompt states the goal in user terms only. The hazard is real but never mentioned in the prompt.
