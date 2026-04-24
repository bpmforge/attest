---
description: "Onboard to an existing codebase — reverse engineer and document. Supports --quick (default) and --deep (Ralph Wiggum inventory loop)."
---

Onboard to this existing codebase by following the SDLC Lead agent Mode 2 methodology.

**Depth flags:**

- `/sdlc onboard` or `/sdlc onboard --quick`
  Standard 7-step pass. ~15 min. High-level ARCHITECTURE.md + ONBOARDING.md + ERD + sequence diagrams for discovered P0 flows.

- `/sdlc onboard --deep`
  Runs the standard pass FIRST, then the Ralph Wiggum inventory loop
  (`agents/shared/RALPH_WIGGUM_LOOP.md`). Enumerates every ROUTE / TABLE /
  SERVICE / FLOW / ENTRY as an inventory row, then discovers one artifact
  per row and blocks until `scripts/validators/validate-phase-gate.sh onboard-deep`
  exits clean. ~45-90 min. Use this before contract bids, diligence, or
  security-sensitive takeovers.

## Quick pass (7 steps)

1. Map the landscape — tech stack, structure, size, entry points
2. Trace entry points — follow call chains, document as sequence diagrams
3. Map data model — find schemas, produce ERD
4. Map components — responsibilities, dependencies, C2/C3 diagrams
5. Identify patterns — error handling, state, data access, testing, naming
6. Assess health — delegate to code reviewer, security, test coverage
7. Produce documentation — ARCHITECTURE.md, ONBOARDING.md, diagrams

## Deep pass (additional)

After the quick pass:

D1. INVENTORY — enumerate every unit (`docs/onboard/INVENTORY.md`)
D2. DISCOVER — parallel waves produce one artifact per inventory row
D3. VERIFY — run validators, fail on any uncovered row
D4. GAP — focused gap-fill HANDOFFs for uncovered rows only
D5. REPEAT — up to 3 iterations; escalate if still gapped

Deep-mode completion gate: `./scripts/validators/validate-phase-gate.sh onboard-deep` must exit 0.

Output all documentation to docs/ directory. See `agents/sdlc-onboard-mode.md` for the full workflow.
