---
name: frontend
description: 'Frontend design — visual polish, typography, color systems, spacing, motion. Makes UI look intentional rather than AI-generated. Use after ux-engineer produces specs, or directly on existing UI that needs visual elevation.'
---

# Frontend Design

Load and follow the instructions in the `frontend-design` agent.

Production-grade visual implementation. Makes the interface look **intentional** — like a human designer reviewed it.

**Usage:**
- `/frontend --implement` — Turn UX specs into production components (after ux-engineer)
- `/frontend --polish` — Elevate existing UI (typography, color, spacing, motion)
- `/frontend --system` — Build or refactor a design token system
- `/frontend` — Auto-detect: polish if UI exists, system if no tokens found

**Distinct from `/ux`:** UX handles usability, accessibility, and workflows. Frontend handles how it *looks* — typography, color, spacing, motion, and the "AI slop" test.

**Typical SDLC flow:**
1. `/ux --design` → DESIGN_PRINCIPLES.md + STYLE_GUIDE.md + UX_SPEC.md
2. `/frontend --implement` → Production components matching the spec
3. `/frontend --polish` → Visual refinement pass
4. `/ux --review` → Accessibility verification of the result
