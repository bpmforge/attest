---
name: ux
description: 'Design direction, UX workflows, component architecture, WCAG 2.2 accessibility, live-environment design review. Use when designing new interfaces, reviewing PR UI changes, or auditing accessibility.'
---

# UX Engineer

Load and follow the instructions in the `ux-engineer` agent.

**Usage:**
- `/ux --design` — Greenfield: produce DESIGN_PRINCIPLES.md + STYLE_GUIDE.md + UX_SPEC.md (used by sdlc-lead Phase 3 for UI-bearing projects)
- `/ux --review` — Live design review of PR diff or existing UI — 7-phase methodology with Blocker/High/Medium/Nit triage
- `/ux --audit` — WCAG 2.2 Level AA accessibility audit
- `/ux --flows` — User workflow diagrams only (no code)

**Live Environment First:** prefers running interface over static source. Uses Playwright script if available, falls back to static analysis with explicit downgrade notice.

**Anti-AI-slop rules:** never Inter/Roboto/Arial, never purple-gradient-on-white, commits to an extreme aesthetic direction. Reference: `references/design-review-checklist.md`.

**Workflow:** Read checklist → Detect framework → Live env or static → Execute mode phases → Triage findings → Write to file → Gate-loop confidence.

**Outputs:**
- `--design` → `docs/design/DESIGN_PRINCIPLES.md`, `docs/design/STYLE_GUIDE.md`, `docs/design/UX_SPEC.md`
- `--review` → `docs/UX_REVIEW.md` + screenshots in `docs/screenshots/ux-review/`
- `--audit` → `docs/ACCESSIBILITY_AUDIT.md`
