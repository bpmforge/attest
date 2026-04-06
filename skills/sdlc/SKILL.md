---
name: sdlc
description: 'Program manager — orchestrates SDLC with expert agents. New projects, onboarding existing codebases, or adding features.'
---

# SDLC Workflow

Load and follow the instructions in the `sdlc-lead` agent.

**Three operating modes:**

- `/sdlc init <name> "<desc>"` — New project: phases 0-5 with proper engineering artifacts (SRS, SAD, C4 diagrams, sequence diagrams, ERD)
- `/sdlc onboard` — Existing codebase: reverse engineer, produce architecture docs, C4 diagrams, onboarding guide
- `/sdlc feature "<description>"` — Add feature: impact analysis, modular design, backward compatibility, implementation, verification

**Other commands:**
- `/sdlc status` — Current phase/milestone progress
- `/sdlc gate` — Check exit criteria before advancing

The lead delegates to expert agents (`/security`, `/dba`, `/test-expert`, `/ux`, `/api-design`, `/review-code`, `/perf`, etc.) — it coordinates, it doesn't do technical work itself.

**Architecture principles enforced:**
- Feature-sliced directory structure (not layered)
- Interface-driven design with dependency injection
- Mermaid diagrams for all architecture documentation
- Modular code with clear module boundaries
