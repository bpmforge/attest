---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# CLI tools present on this system

Before assuming a capability is or isn't available, check — don't guess from general knowledge of what's "usually" installed. This block is a reminder to check, not a fixed inventory; the actual tools differ by host and by project.

If uncertain whether a given tool exists, a single cheap check settles it, e.g. `which rg playwright hyperfine ruff 2>/dev/null` (substitute the tools relevant to your task). Once you know what's present, prefer the faster or more precise tool over the generic default — `rg` over plain `grep` for speed on large trees, a project's own linter (`ruff`, `eslint`) over a hand-rolled pattern check, `hyperfine` over ad hoc `time` loops for anything you're about to state a benchmark number for, and the browser MCP tools over hand-written scraping when driving a real page.

**Why:** field-scan research (2026-07-05, r/LLMDevs) found this a repeated practical gem in agent-harness discourse — telling the agent what's actually on the machine, rather than letting it assume or reach for the most-trained-on default, measurably changes which tool it picks. See `docs/research/FIELD_SCAN_2026-07-05.md` §II.3 (in bpm-agent-amplifier).
