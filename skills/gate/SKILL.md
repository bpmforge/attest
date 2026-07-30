---
name: gate
description: 'SDLC phase gate — runs the automated validators for the current phase and reports gaps. Use after completing all deliverables for a phase. Wraps ~/.config/opencode/scripts/validators/validate-phase-gate.sh.'
---

# SDLC Gate Management

Check or manage phase gate requirements for the current SDLC project.

**Usage:**
- `/gate` or `/gate check` — Check if current phase exit criteria are met (runs validators)
- `/gate approve` — Mark current phase as approved and advance
- `/gate bypass` — Emergency bypass with documented reason (use sparingly)

## How to check gates

1. Read `docs/work/sdlc-state.md` to determine current mode + phase
2. Run the automated validator:

   ```bash
   ~/.config/opencode/scripts/validators/validate-phase-gate.sh <phase>
   ```

   where `<phase>` is one of:

   | Mode | Phase arg |
   |------|-----------|
   | Mode 1 Phase 0 | `phase-0` |
   | Mode 1 Phase 1 | `phase-1` |
   | Mode 1 Phase 2 | `phase-2` |
   | Mode 1 Phase 3 | `phase-3` |
   | Mode 1 Phase 4 | `phase-4` |
   | Mode 1 Phase 5 (release) | `phase-5` |
   | Mode 2 deep | `onboard-deep` |
   | `/security --deep` | `security-deep` |

3. Exit code:
   - `0` = all validators clean, gate passes
   - `1` = one or more gaps; read the JSON gap list for details
   - `2` = validator itself errored; investigate before interpreting

4. If gaps exist, report them with the gate table format below.

## Phase -> Required Deliverables (reference)

| Phase | Required files | Validators run |
|-------|----------------|----------------|
| 0 (Ideation) | VISION.md, COMPETITIVE_ANALYSIS.md | file-existence only |
| 1 (Planning) | SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md | file-existence only |
| 2 (Requirements) | SRS.md, USER_STORIES.md, docs/testing/USE_CASES.md, docs/testing/TEST_PLAN.md | file-existence only |
| 3 (Design) | ARCHITECTURE.md, TECH_STACK.md, DATABASE.md, API_DESIGN.md, docs/api/openapi.yaml, THREAT_MODEL.md | architecture + api-coverage + erd-coverage + sequence-coverage |
| 4 (Implementation) | Source + tests + reviews + RUNTIME_*.md PASS | inline per-module runtime check |
| 5 (Release) | FIX_BACKLOG closed, all reviews APPROVED, RUNTIME PASS | phase-5 release gate |
| onboard-deep | INVENTORY, ARCHITECTURE, API, ERD, sequences | inventory + architecture + erd-coverage + sequence-coverage |
| security-deep | OWASP tracker all 10 >= 7, attack-chains | owasp |

## Output format

```
===========================================================
  GATE CHECK -- <phase>
===========================================================

Validator: validate-phase-gate.sh <phase>
Exit: 0 or 1

| Validator              | Gaps | Detail                                          |
|------------------------|------|-------------------------------------------------|
| validate-architecture  | 0    | clean                                            |
| validate-api-coverage  | 2    | POST /api/orders, DELETE /api/orders/* missing  |
| validate-erd-coverage  | 0    | clean                                            |

Overall: FAIL -- api-coverage has 2 gaps
===========================================================
```

## Gate failure rules

- Any validator exit != 0 = gate FAILS
- Gate FAILS blocks phase advance
- To advance: close every gap, then re-run `/gate`
- `/gate bypass` -- write to `docs/reviews/WAIVERS_<phase>_<date>.md` with compensating control + review date. Only the USER signs waivers, not the orchestrator.

## Why automated

Previous version rated each deliverable 1-10 on Completeness and Quality. That was a feeling. The Wave 3 validators replace the feeling with coverage facts: either the file contains the required section, or it doesn't; either every P0 use case has a sequence diagram, or it doesn't.

Do not second-guess the validator. If it says clean, gate passes. If it says gap, fix the gap -- do not override.
