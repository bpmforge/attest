---
name: graphics
description: 'Interactive graphics — 3D (three.js / React Three Fiber + drei), WebGL/WebGPU and shaders, high-performance 2D canvas (PixiJS, OGL), scroll/timeline scenes, spatial visualizations. Frame budgets per device tier, compressed assets, static/DOM fallbacks, disposal, canvas accessibility. Design, build, or audit. NOT standard charts (frontend-design), NOT drag/drop or node editors (interaction-engineer), NOT game loops (gameplay-engineer).'
---

# Graphics

Load and follow the instructions in the `graphics-engineer` agent.

**Usage:**
- `/graphics --design "<scene>"` — purpose, device tiers + budgets, scene inventory, asset pipeline, fallbacks, a11y → `docs/design/GRAPHICS.md` (+ ADR)
- `/graphics --implement "<scene>"` — static fallback first, then the scene one element at a time; demand rendering, disposal, tier switching, perf + fallback tests
- `/graphics --audit "<url>"` — throttled-mobile frame times, memory over time, WebGL-off / context-loss / reduced-motion / keyboard checks → `docs/reviews/GRAPHICS_AUDIT_<slug>_<date>.md`
- `/graphics` (no flag) — audit if the scene runs, otherwise design

**Looks things up:** three.js is 0.x with breaking changes nearly every release, and R3F/drei/postprocessing majors move with React. Every package and peer set is re-verified before use (`references/ui-ecosystem-map.md`, Context7, `/api-ground`, the three.js migration guide).

**Gates:** `references/graphics-patterns.md` — purpose stated, budgets measured on the low tier, fallback works with WebGL off, no memory growth across remounts, reduced-motion variant.
