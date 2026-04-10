---
name: sdlc
description: 'Program manager — orchestrates SDLC with expert agents. New projects, onboarding existing codebases, or adding features.'
---

# SDLC Workflow

Load and follow the instructions in the `sdlc-lead` agent.

**Three operating modes:**

- `/sdlc init <name> "<desc>"` — New project: phases 0-5 with proper engineering artifacts (SRS, SAD, C4 diagrams, sequence diagrams, ERD).
  **Starts with a Discovery Interview** — asks 7 targeted questions about problem, users, constraints, and tech before writing any documents.

- `/sdlc onboard` — Existing codebase: reverse engineer, produce architecture docs, C4 diagrams, onboarding guide

- `/sdlc feature "<description>"` — Add feature: **starts with a Feature Discovery Interview** (scope, success criteria, constraints), then impact analysis, modular design, backward compatibility, implementation, verification.
  **Asks Design Clarification Questions** before architecture work begins.

**Other commands:**
- `/sdlc status` — Current phase/milestone progress
- `/sdlc gate` — Check exit criteria before advancing

The lead delegates to expert agents via `task` tool — it coordinates, it doesn't do technical work itself.

**Interactive questioning phases:**
- Mode 1 (init): Discovery Interview before Phase 0, Design Clarification before Phase 3
- Mode 3 (feature): Feature Discovery Interview before impact analysis

**Confidence loops:** Each phase gate runs a score loop (1-10 per deliverable,
min 7 to advance, up to 3 revision iterations) — not a one-shot pass/fail.

**Architecture principles enforced:**
- Feature-sliced directory structure (not layered)
- Interface-driven design with dependency injection
- Mermaid diagrams for all architecture documentation
- Modular code with clear module boundaries
