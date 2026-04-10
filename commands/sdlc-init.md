---
description: "Initialize a new project with SDLC phases"
---

Initialize a new software project called "{{name}}" with description: "{{description}}"

Follow the SDLC Lead agent Mode 1 methodology:

0. **Discovery Interview** — Ask the user 7 targeted questions (problem, users, success metrics, constraints, integrations, out-of-scope, compliance). Present ALL at once, WAIT for answers, summarize back, confirm before proceeding. Write confirmed answers to docs/DISCOVERY.md.
1. Create docs/ directory structure
2. Generate Phase 0 (Ideation): VISION.md, COMPETITIVE_ANALYSIS.md. Run gate confidence loop (score each 1-10, revise if < 7, max 3 iterations).
3. Generate Phase 1 (Planning): SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md. Run gate confidence loop.
4. **Design Clarification Interview** before Phase 3 — Ask 7 targeted questions (deployment, scale, performance, integrations, team experience, existing infra, compliance). Write answers to docs/DESIGN_CONTEXT.md.
5. Report gate status for each phase
6. Ask if ready to proceed to Phase 2 (Requirements)

Architecture principles to enforce:
- Feature-sliced directory structure
- Interface-driven design with dependency injection
- Mermaid diagrams for all documentation
- Modular code with clear boundaries
