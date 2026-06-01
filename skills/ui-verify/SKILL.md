---
name: UI Verifier
trigger: /ui-verify
description: 'Live browser verification using playwright-mcp — navigate a running app, screenshot key flows, check accessibility snapshots, verify against use cases. Works with any LLM (no vision required). Use after implementation or for regression checks.'
context: fork
agent: ui-verifier
arguments:
  - name: url
    description: Base URL of the running app (e.g. "http://localhost:3000"). Omit if obvious from context.
    required: false
  - name: --smoke
    description: Quick pass — navigate main routes, screenshot each, check for errors (default)
    required: false
  - name: --use-cases
    description: Verify P0 use cases from docs/testing/USE_CASES.md one by one
    required: false
  - name: --flow
    description: Verify one specific flow end-to-end (e.g. --flow "user login and dashboard load")
    required: false
  - name: --regression
    description: Post-change regression check — screenshot key views, flag structural changes
    required: false
---

Triggers the **ui-verifier** subagent in a forked context.

Live browser verification specialist using `playwright-mcp`. Navigates a running
application, executes flows, and produces `docs/test/UI_VERIFICATION_REPORT.md`
with per-flow PASS/FAIL/WARN verdicts and descriptions of what was observed.

**Works without vision:** Uses accessibility tree snapshots (`browser_snapshot()`)
as the primary verification signal — no vision-capable model required. Screenshots
are taken for visual record and described if vision is available.

**Modes:**
- `--smoke` (default) — 5 min quick pass over main routes
- `--use-cases` — verify every P0 use case in USE_CASES.md
- `--flow "description"` — single flow end-to-end
- `--regression` — post-change check against last-known state

**Requires:** `playwright-mcp` registered (`claude mcp list` should show `playwright`).
If not registered, run `./install.sh` or `claude mcp add playwright -- npx -y @playwright/mcp@latest`.
