---
description: "Onboard to an existing codebase — reverse engineer and document. Supports --quick (minimal), default (7-step + lightweight inventory), and --deep (full Ralph Wiggum inventory loop)."
---

Onboard to this existing codebase by following the SDLC Lead agent Mode 2 methodology.

**Depth flags (three levels):**

- `/sdlc onboard --quick`
  Minimal 7-step pass. ~10–15 min. High-level ARCHITECTURE.md + ONBOARDING.md + ERD + sequence diagrams for discovered P0 flows. **No inventory verification.** Use when a quick orientation is enough — exploratory only.

- `/sdlc onboard` (default)
  Standard 7-step pass FOLLOWED BY a lightweight inventory loop that enumerates every ROUTE and TABLE in the codebase, then runs `validate-api-coverage.sh` + `validate-erd-coverage.sh` to confirm every route is documented in API_DESIGN.md / openapi.yaml and every table is in the ERD. ~25–35 min. Catches the most common onboarding gaps without going to full Ralph.

- `/sdlc onboard --deep`
  Standard pass + the full Ralph Wiggum inventory loop (`agents/shared/RALPH_WIGGUM_LOOP.md`). Enumerates every ROUTE / TABLE / SERVICE / FLOW / ENTRY as an inventory row, then discovers one artifact per row and blocks until `validate-phase-gate.sh onboard-deep` exits clean (or 3 iterations exhausted → escalation). ~45–90 min. Use before contract bids, diligence, or security-sensitive takeovers.

## Quick pass (7 steps — runs in all three modes)

1. Map the landscape — tech stack, structure, size, entry points
2. Trace entry points — follow call chains, document as sequence diagrams
3. Map data model — find schemas, produce ERD
4. Map components — responsibilities, dependencies, C2/C3 diagrams
5. Identify patterns — error handling, state, data access, testing, naming
6. Assess health — delegate to code reviewer, security, test coverage
7. Produce documentation — ARCHITECTURE.md, ONBOARDING.md, diagrams

## Default mode addition (lightweight inventory)

After step 7:

L1. **Lightweight inventory** — produce `docs/onboard/INVENTORY.md` with rows ONLY for ROUTE and TABLE categories (no SERVICE / FLOW / ENTRY).
L2. **Verify** — run `./scripts/validators/run-coverage-loop.sh onboard-deep`. If clean → done. If gaps → emit gap-fill HANDOFFs (up to 3 iterations).
L3. **Escalate** — after 3 iterations, surface the escalation block and stop.

This catches the two highest-value gaps (undocumented routes, undocumented tables) without the full SERVICE / FLOW / ENTRY enumeration.

## Deep mode addition (full Ralph Wiggum loop)

D1. **Inventory** — `docs/onboard/INVENTORY.md` with ALL 5 categories: ROUTE / TABLE / SERVICE / FLOW / ENTRY.
D2. **Discover** — parallel waves produce one artifact per inventory row.
D3. **Verify** — `validate-phase-gate.sh onboard-deep` must exit 0.
D4. **Gap-fill** — focused gap-fill HANDOFFs for uncovered rows only.
D5. **Repeat** — up to 3 iterations; escalate if still gapped.

Output all documentation to `docs/`. See `agents/sdlc-onboard-mode.md` for the full workflow.
