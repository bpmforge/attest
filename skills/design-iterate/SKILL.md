---
name: design-iterate
description: 'Claude-Design-style visual iteration loop — render the running UI, screenshot at 375/768/1440, critique against docs/design/tokens.json and design principles, apply fixes, re-capture until clean (cap 3 iterations). Also extracts a token baseline from an existing codebase (--sync) and audits real logged-in browsers (--real). NOT a one-pass review — use /ux --review for findings-only; NOT functional conformance — use /ui-verify.'
---

# Design Iterate

Load and follow the instructions in the `design-iterator` agent.

**Usage:**
- `/design-iterate "<url or screen>"` (no flag) — the full loop: ground in `docs/design/tokens.json` → render → capture mobile/tablet/desktop → deterministic token-lint + vision critique → apply smallest fixes → re-capture until no P0/P1 remains or the 3-iteration cap hits
- `/design-iterate --sync` — extract an observed token baseline from an existing codebase + running app into `docs/design/tokens.json` (`provenance: extracted-baseline`) + `docs/design/TOKEN_DRIFT.md`. Only when no tokens.json exists — authored systems from design-system-lead always win
- `/design-iterate --real "<url>"` — capture + critique a real logged-in browser session (findings only, no fixes) via the tiers in `references/real-browser-bridge.md`

**Code and pixels in one loop:** a fix is not done when the code is edited — it is done when a fresh screenshot shows it closed. Every finding is grounded: screenshot path + viewport + element + cited token/principle. No vibes.

**References:** `references/visual-design-loop.md` (the protocol), `references/real-browser-bridge.md` (logged-in/real-browser tiers), `references/design-review-checklist.md` (rubrics).

**Workflow:** Read protocol → Ground in tokens → Render dev server → Capture 3 viewports → Token-lint + critique → Fix P0/P1 → Re-capture → Log → Exit at clean or cap.

**Outputs:**
- default → `docs/design/ITERATION_LOG.md` + `docs/screenshots/design-iterate/iter-N/`
- `--sync` → `docs/design/tokens.json` + `docs/design/TOKEN_DRIFT.md`
- `--real` → `docs/design/DESIGN_AUDIT_LIVE.md`
