---
name: gauntlet
description: 'Gauntlet loop — multi-agent quality harness: a lead sets a real reference bar (a named product, test suite, or baseline to match or beat), splits the goal into gradeable units, builders produce artifacts in clean context, and blind fresh-per-round critics grade each artifact against the bar with evidence; failures loop until every unit passes, two rounds stall, or budget runs out. NOT /challenge (verifies factual claims); NOT /review (one-pass verdict) — this rebuilds until the work beats something real.'
---

# Gauntlet

Load and follow the instructions in the `gauntlet-lead` agent.

**Usage:**
- `/gauntlet "<goal>"` — run the full loop: bar + budget → split into units → builders (clean context, parallel) → blind critics (fresh per unit per round) → fix and repeat → optional smooth pass → report
- `/gauntlet "<goal>" --bar "<exemplar>"` — name the thing to match or beat up front (a reference product/screenshot, a test suite + threshold, a model doc, a measured baseline)
- `/gauntlet "<goal>" --budget <N>` — max rounds (default 5)

**The two inviolables:** the agent that builds never grades its own work, and a critic that saw a previous draft never grades the retry — every critic is a fresh context used for one unit in one round. The bar must be something real named in advance; "make it amazing" gets `BLOCKED: no real bar`.

**Exit rules:** every unit clears the bar, OR two consecutive rounds show no improvement (stall — surfaced to you), OR budget exhausted. Below-bar residuals are always reported, never dropped.

**Protocol:** `agents/shared/GAUNTLET_LOOP.md` — including how it composes with `frontend-design`/`coding-agent` builders, how it differs from the challenger, Fix-Verify, and Wiggum coverage loops, and the Consensus & agreement map for multi-model critic rounds (single-critic rounds remain the default and fully valid).

**Workflow:** Write bar file → user nod (interactive) → split → build → blind critique with evidence → route FAILs back → exit check per round → smooth → report.

**Outputs:**
- `docs/gauntlet/BAR_<slug>.md` — the exemplar, per-criterion checks, budget
- `docs/gauntlet/GAUNTLET_<slug>.md` — round log, PASS evidence, which exit rule fired, below-bar residuals
