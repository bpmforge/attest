# Stack Coherence — one framework, one kit, one library per purpose

**Verified:** 2026-10-12 (static package lists checked against the npm registry; run `--online` for later deprecations).
**Gate:** `node ~/.config/opencode/scripts/stack-coherence.mjs --check` (exit 1 on any ERROR). `--json` for agents, `--online` to ask the registry which declared deps are deprecated.
**Readers:** every agent that adds UI code or dependencies — frontend-design, interaction-engineer, agent-ui-engineer, graphics-engineer, design-system-lead, coding-agent; ux-engineer `--review`.

The worst agent-built UIs aren't ugly components. They're **mismatched** ones: a Vue snippet in a React app, an MUI dialog on a shadcn screen, Tailwind v3 syntax on a v4 install, two drag-and-drop libraries, a deprecated package from a 2022 tutorial. Each compiles and renders, so nothing fails. The product ends up looking like three products with double the bundle and no upgrade path.

## Before adding anything (the 4-question pre-flight)

1. **What is the stack?** Run `stack-coherence.mjs` first. Its header line names the framework and component kit; everything you add must match them.
2. **Does the project already have a library for this purpose?** (one DnD, one animation, one chart, one icon set, one styling system, one headless-primitive kit). Use it.
3. **Is the candidate built for this framework and this major?** Check its `peerDependencies` (`npm view <pkg> peerDependencies --json`) against the installed majors.
4. **Is it current?** `npm view <pkg> deprecated`, `references/ui-ecosystem-map.md` lookup recipes.

Then add it, and re-run with `--check`. A new ERROR means the addition is rejected or the conflict gets resolved in the same change.

## Rules

| ID | Severity | What it catches | Fix |
|---|---|---|---|
| SC-01 | ERROR | More than one UI framework installed; `.vue`/`.svelte` files in a React app; source importing another framework | Port the component to the project's framework, or source a native one |
| SC-02 | ERROR | Two component kits (shadcn + MUI/antd/Chakra/Mantine/…) | Pick the kit in TECH_STACK.md; migrate the stray screens |
| SC-03 | ERROR (DnD, styling, headless primitives) / WARN (animation, charts, icons) | Two libraries for one purpose | Keep the one the design system uses; remove the other |
| SC-04 | ERROR / WARN | Deprecated or renamed packages (`react-beautiful-dnd`, `@measured/puck`, `react-flow-renderer`, `@base-ui-components/react`, legacy `@dnd-kit/core` mixed with `@dnd-kit/react`); superseded (`reactflow` v11, `framer-motion` → `motion`) | Use the successor named in the message |
| SC-05 | ERROR / WARN | Tailwind major vs the syntax in CSS (`@tailwind` directives on v4, `@import "tailwindcss"` on v3); v3-era `tailwindcss-animate` on v4; shadcn `components.json` pointing at a config file on v4 | Match the installed major's syntax |
| SC-06 | ERROR | Ecosystem majors out of step (R3F ↔ React, drei ↔ R3F) and any `npm ls` peer/invalid problem | Align majors; never `--legacy-peer-deps` past it |
| SC-07 | ERROR | Source imports a kit/UI library that isn't in `package.json` (pasted from elsewhere or hallucinated) | Add it deliberately (after the pre-flight) or remove the import |
| SC-08 | ERROR / WARN | shadcn `components.json` contradicting installed packages (icon library missing, no Tailwind) | Install the declared library or change `components.json` |

## Judgement calls the script can't make (reviewers check these)

- **Visual-language coherence.** One radius scale, one shadow scale, one focus-ring style across every component, including vendored ones. Vendored components get re-skinned to `docs/design/tokens.json` before merge (`references/component-sourcing.md` §3).
- **Pattern coherence.** One way to do modals, toasts, forms and tables across the app, not three.
- **Intentional exceptions** (e.g. GSAP for one scroll scene beside `motion` for UI) are written in TECH_STACK.md with the reason. A warning with a written reason is accepted; a silent one is not.

## Limits (stated, not hidden)

- Monorepos: run it per package (`--root=packages/web`). Several frameworks across *different* packages are fine.
- Static lists age. `--online` covers registry deprecations; renames that aren't flagged as deprecated need a list update. Bump **Verified** when you do.
