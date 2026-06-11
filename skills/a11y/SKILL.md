---
name: a11y
description: 'Accessibility & compliance audit — WCAG 2.2 AA/AAA, EN 301 549 / EAA, Section 508. Automated (axe/pa11y/Lighthouse) + manual checklist, findings with criterion + file:line + fix. Use after UX design (audit the spec) and after implementation (audit the DOM). NOT for visual design — use /ux or /frontend.'
---

# Accessibility & Compliance Auditor

Load and follow the instructions in the `a11y-compliance` agent.

**Usage:**
- `/a11y` — Full audit (default `--audit`): automated tools + manual checklist against the running UI/DOM → `docs/reviews/A11Y_AUDIT_<date>.md`
- `/a11y --spec` — Phase 3 design-time review of UX_SPEC.md / STYLE_GUIDE.md (tokens, focus, target sizes) — 10x cheaper to fix than post-implementation
- `/a11y --quick` — Automated-only scan (axe/Lighthouse/pa11y) — ~40% coverage, never a conformance claim

**Rules:** every finding cites WCAG criterion + level + file:line + fix; first rule of ARIA is don't (native elements first); applicable standard comes from DESIGN_CONTEXT/market (EAA for EU-facing, 508 for US gov), never assumed.

**Manual checklist:** `references/wcag-audit-checklist.md` — keyboard walk, landmarks, focus order, 400% reflow, contrast, target size.

**Workflow:** Determine standard → Automated pass → Manual checklist → Dedupe findings → Conformance verdict + score → Remediation plan.
