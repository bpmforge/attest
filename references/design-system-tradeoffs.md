# Design-System Architecture: Decision Guide

For ux-engineer / frontend-design at Phase 3, and any "which component
approach?" question. Three viable architectures — pick by team size, time
budget, and customization needs, then record the choice as an ADR.

## The three architectures

**1. Utility CSS + headless components** (Tailwind + shadcn/Radix style)
- Tokens live in the Tailwind config; components are copied into the repo
  and owned outright.
- (+) Fastest to first screen; full visual control; no library upgrade
  treadmill; AI agents handle it well (everything is visible in-file).
- (−) Consistency is convention-enforced, not API-enforced; a growing team
  can drift; copied components receive no upstream fixes.

**2. Full component library** (MUI / Ant / Mantine / Chakra)
- Tokens map onto the library's theme object; components are imported.
- (+) Hundreds of accessible components on day one; API-enforced
  consistency; the right call when product velocity beats brand identity.
- (−) Distinctive branding fights the library's opinions (theme override
  depth is the hidden cost); bundle weight; major-version migrations.

**3. Custom design system** (own tokens + own components + Storybook)
- (+) Exact brand expression; multi-product/multi-framework reuse;
  design–dev contract via Storybook + Figma tokens.
- (−) A product in itself: realistic cost is 1–2 engineers ongoing, not a
  one-time build. Almost always wrong below ~5 frontend engineers.

## Decision matrix

| Situation | Pick |
|-----------|------|
| Solo dev / small team, shipping fast | 1 — utility + headless |
| Internal tool, admin UI, MVP | 2 — full library |
| Strong existing brand, marketing-visible product | 1, or 3 if ≥5 FE engineers |
| Multiple products sharing one identity | 3 (or 1 with a shared preset package) |
| Heavy data-grid/enterprise widgets needed | 2 (grids are the hardest thing to hand-roll) |
| Accessibility certification required, thin team | 2 (inherit the library's a11y work) |

## Rules that hold regardless of choice

- Tokens are the contract: components never hardcode color/size/font values
  (the design-system validator enforces this).
- One source of truth for tokens — config file or tokens.css, not both.
- Decide the breaking-change policy when you create the system: how a token
  rename propagates, who signs off, how downstream finds out.
- Re-evaluate only at inflection points (team triples, second product,
  rebrand) — switching architectures mid-product is a quarter-long project.
