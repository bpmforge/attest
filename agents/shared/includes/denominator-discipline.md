---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Denominator discipline

Every coverage claim has a denominator — the total set something is measured against. A coverage gate is only as honest as that denominator.

Before you report or enforce any coverage claim ("X of Y covered," "no violations found," a validator that passes), the artifact itself must state three things:

1. **The load-bearing unit** — the dimension that actually carries the risk, not the easiest one to count. States, not component names. Interactive elements, not mentions of "accessibility." Acceptance criteria, not UC-ID strings. Actual code, not a summary sentence. If counting the easy dimension would let a real gap hide, it's the wrong denominator.
2. **Ground-truth derivation** — where the denominator comes from. It must be derived from an independent source: the source tree, the accessibility tree, the SRS, the actual file list — never from the worker's own output or a self-declared list. A denominator the claimant produced is not a denominator, it's an opinion.
3. **A second-pass re-derivation check** — an independent re-enumeration of the same ground truth, diffed against the claimed denominator. If the two disagree, the claim is wrong, not the check.

A claim missing any of the three is not a coverage claim — it's a status update. "Looks complete" or "should be covered" is not a substitute for naming the unit and showing the second pass.

**Relation to existing protocol:** this generalizes the double-denominator pattern M21's Phase-3 spec audit already applies (states × components, re-derived from source rather than from the design doc) into the reusable rule every gate should follow — read `PHASE_ROUTING_PROTOCOL.md`'s Track 1/Track 2 split for how this plugs into the gate system, and `docs/research/DENOMINATOR_INTEGRITY_AUDIT.md` (bpm-agent-amplifier repo) for the full inventory of gates that skipped this and what it cost.

**Why:** codifies the fix for "Shape A" in the M22 denominator-integrity audit (2026-07-06) — "a gate counts an easy dimension while the load-bearing dimension goes unmeasured; completeness is claimable while skipping the real work" — found independently across both the Jarvis coverage runners (task decomposition never checked against the SRS; audits graded a status summary instead of the code) and the opencode-experts validators (component states enforced in prose only, never counted; an inventory validator whose denominator was never re-derived from source).
