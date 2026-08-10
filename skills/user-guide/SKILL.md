---
name: user-guide
description: 'Image-quality gating and single-annotation tooling for captured screenshots (img-gate.mjs, annotate.mjs). Placeholder skill front door — T21.2 scope only.'
---

# user-guide — image gate + annotation tooling (T21.2 placeholder)

Two Node.js tooling scripts built for the M21 user-guide capture pipeline
live at `scripts/lib/` (relocated from this directory so they ship in BOTH
the OpenCode install and the generated Claude target — `skills/*/scripts/`
ships to neither):

- `scripts/lib/img-gate.mjs` — Gate A quality check for a captured screenshot:
  size floor, per-channel-stddev blank-detect, dominant-color-ratio vs a
  per-app calibrated baseline, and two-shot pixel-diff stability. Returns a
  pass/fail result with a specific reason per failed check.
- `scripts/lib/annotate.mjs` — draws one rounded highlight box and a numbered
  badge onto a copy of a screenshot at a recorded bounding box; the
  original is never mutated.

Both require `sharp` (+ `pixelmatch` for img-gate) — direct deps of this
repo; installed projects need them available (`npm i -D sharp pixelmatch`).
See `README.md` in this directory for the per-app baseline calibration file
schema and usage examples of both scripts.

## Scope note

This `SKILL.md` exists only to satisfy this repo's `npm test` invariant
that every directory under `skills/` has one — it is **not** the full
user-guide skill. The real skill front door (activation modes, coverage
reporting, assembly wiring into a manual) is a separate, later ticket that
authors this file for real, in both this repo and its generated sibling.
Until then, treat this file as a stub pointing at the two scripts above.
