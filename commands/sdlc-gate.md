---
description: "Check SDLC phase exit criteria — runs the automated validators for the current phase and reports any gaps. SDLC-aware: reads sdlc-state.md to auto-detect the phase."
---

Check the current SDLC phase gate. This is the SDLC-aware wrapper around `scripts/validators/validate-phase-gate.sh`.

## Steps

1. **Read state** — `docs/work/sdlc-state.md` to determine current mode + phase. If the file does not exist, the project has no SDLC initialized; tell the user to run `/sdlc init`, `/sdlc onboard`, or `/sdlc improve` first.

2. **Pick the phase argument** based on the state:

   | Mode | Phase | `<phase>` arg |
   |------|-------|---------------|
   | Mode 1 (init) | Phase 0 | `phase-0` |
   | Mode 1 (init) | Phase 1 | `phase-1` |
   | Mode 1 (init) | Phase 2 | `phase-2` |
   | Mode 1 (init) | Phase 3 | `phase-3` |
   | Mode 1 (init) | Phase 4 | `phase-4` |
   | Mode 1 (init) | Phase 5 (release) | `phase-5` |
   | Mode 2 (onboard) `--deep` | post-discover | `onboard-deep` |
   | `/security --deep` | post-attack-chain | `security-deep` |

3. **Run the validator:**

   ```bash
   ./scripts/validators/validate-phase-gate.sh <phase>
   ```

4. **Interpret the exit code:**
   - `0` — gate clean, phase can advance
   - `1` — one or more validators reported gaps; read the JSON output for the gap list
   - `2` — validator itself errored (e.g. missing dependency, malformed input); investigate before re-running

5. **Report** in the format below. **Do not second-guess the validator** — if it says clean, gate passes; if it says gap, fix the gap.

## Output format

```
═══════════════════════════════════════════════════════════
  GATE CHECK — <phase>
═══════════════════════════════════════════════════════════

Validator: validate-phase-gate.sh <phase>
Exit: 0 or 1

| Validator              | Gaps | Detail                                          |
|------------------------|------|-------------------------------------------------|
| validate-architecture  | 0    | clean                                            |
| validate-api-coverage  | 2    | POST /api/orders, DELETE /api/orders/* missing  |
| validate-erd-coverage  | 0    | clean                                            |

Overall: PASS / FAIL — <one-line reason>
Next: <if PASS> ready to advance to phase N+1 / <if FAIL> close listed gaps then re-run
═══════════════════════════════════════════════════════════
```

## Phase → required deliverables (reference)

| Phase | Required files | Validators run |
|-------|----------------|----------------|
| 0 (Ideation) | VISION.md, COMPETITIVE_ANALYSIS.md | file-existence only |
| 1 (Planning) | SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md | file-existence only |
| 2 (Requirements) | SRS.md, USER_STORIES.md, docs/testing/USE_CASES.md, docs/testing/TEST_PLAN.md | file-existence only |
| 3 (Design) | ARCHITECTURE.md, TECH_STACK.md, DATABASE.md, API_DESIGN.md, docs/api/openapi.yaml, THREAT_MODEL.md | architecture + api-coverage + erd-coverage + sequence-coverage |
| 4 (Implementation) | Source + tests + reviews + RUNTIME_*.md PASS | inline per-module runtime check |
| 5 (Release) | FIX_BACKLOG closed, all reviews APPROVED, RUNTIME PASS | phase-5 release gate |
| onboard-deep | INVENTORY, ARCHITECTURE, API, ERD, sequences | inventory + architecture + erd-coverage + sequence-coverage |
| security-deep | OWASP tracker all 10 ≥ 7, attack-chains | owasp |

## When to use this vs. `/gate`

- **`/sdlc gate`** (this command) — reads `docs/work/sdlc-state.md` and auto-picks the phase. Use during normal SDLC work.
- **`/gate <phase-arg>`** — direct invocation when state file is stale or you want to spot-check a specific phase.

Both call the same `validate-phase-gate.sh` underneath.

## Bypass / waiver

Emergency bypass goes through `/gate bypass` (the standalone skill), which writes to `docs/reviews/WAIVERS_<phase>_<date>.md` with a compensating control. Only the user signs waivers — the orchestrator never silently skips a gate.

## Other commands

- `/sdlc status` — phase progress overview without running validators
- `/sdlc init`, `/sdlc onboard`, `/sdlc feature`, `/sdlc improve` — the four operating modes
- `/gate approve`, `/gate bypass` — gate state changes (handled by the standalone gate skill)
