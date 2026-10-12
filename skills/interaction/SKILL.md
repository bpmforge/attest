---
name: interaction
description: 'Interaction engineering — drag-and-drop and sortable cards, Kanban, resizable panels, dashboard/layout editors (dnd-kit, Puck), node canvases (React Flow), command palettes, undo/redo, layout persistence as validated JSON, keyboard + single-pointer alternatives, reduced motion. Spec it, build it, or audit it. NOT visual polish (frontend-design), NOT flows/WCAG-wide review (ux-engineer), NOT agent/generative UI (agent-ui-engineer).'
---

# Interaction

Load and follow the instructions in the `interaction-engineer` agent.

**Usage:**
- `/interaction --spec "<screen>"` — write the interaction contract → `docs/design/INTERACTIONS.md`
- `/interaction --implement "<screen>"` — source components, build to the contract, Playwright-verify each gesture
- `/interaction --audit "<url or screen>"` — exercise mouse/keyboard/touch/reduced-motion/failure paths → `docs/reviews/INTERACTION_AUDIT_<slug>_<date>.md`
- `/interaction` (no flag) — audit if the UI runs, otherwise spec

**Looks things up, never builds from memory:** re-verifies library status (`npm view`, `gh api`) from `references/ui-ecosystem-map.md`, grounds APIs per `references/library-adoption-protocol.md`, sources components per `references/component-sourcing.md`.

**Gates:** `references/interaction-patterns.md` — every drag has a keyboard path and a single-pointer alternative, Escape restores, layout JSON round-trips, reduced motion has a variant.
