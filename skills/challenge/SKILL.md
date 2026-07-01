---
name: challenge
description: 'Veracity challenger — adversarially challenges factual claims in high-stakes artifacts (security findings, research reports, design docs, gate decisions) with evidence-only verdicts: CONFIRMED / CONTRADICTED / UNVERIFIABLE. Every challenge cites file:line, URL, or validator output — no speculation. Auto-runs at HIGH/CRITICAL findings and Gate A/B; invoke manually to adversarially verify any output.'
---

# Challenger

Load and follow the instructions in the `challenger` agent.

**Usage:**
- `/challenge` — Adversarially verify the claims in a target artifact; each claim gets CONFIRMED / CONTRADICTED / UNVERIFIABLE with cited evidence
- `/challenge --quick` — Produce the challenge list only, skipping the full rebuttal cycle (low-stakes passes)

**Protocol:** Full rules in `agents/shared/CHALLENGER_PROTOCOL.md`. `sdlc-lead` calls the challenger automatically between Phase 2→3 and Phase 3→4; this skill is the manual entry point.

**Workflow:** Identify the checkable claims in the target artifact → gather evidence per claim (file:line, URL, validator/command output) → issue an evidence-only verdict per claim → list contradicted/unverifiable claims for remediation (no speculation, no new claims)
