# Graphics Patterns — 3D, WebGL/WebGPU, canvas: stack choice, budgets, gates

**Verified:** 2026-10-12. Versions from `npm view` / `gh api` that day — see `references/ui-ecosystem-map.md` §2 and re-run its lookup recipes before adopting.
**Readers:** graphics-engineer (all modes), frontend-design, performance-engineer, a11y-compliance.

## 0. Choose the stack

| Need | Use | Status 2026-10-12 | Notes |
|---|---|---|---|
| 3D in a React app | `@react-three/fiber` 9.8.1 + `@react-three/drei` 10.7.9 on `three` 0.186.1 | active, MIT | R3F 9 targets React 19; check peers. three.js is 0.x: read the migration guide across every release gap. |
| 3D without React | `three` directly | active, MIT | Same migration rule. |
| Post-processing (bloom, DOF, SSAO) | `@react-three/postprocessing` 3.2.0 | active, MIT | Each pass is a full-screen cost; budget it. |
| Fast 2D sprites/particles/large point sets | `pixi.js` 8.22.0 (`@pixi/react` 8.0.5 for React) | active, MIT | Prefer over raw canvas past a few thousand objects. |
| Minimal WebGL, tiny bundle, custom shaders | `ogl` 1.0.11 | last release 2025-01, Unlicense | Small and stable but quiet; fine for a single effect. |
| Scroll/timeline orchestration | `gsap` 3.15.0 or `motion` 14.1.0 | GSAP has its own no-charge license | Check that GSAP's license fits the product. |
| Visual timeline/sequence editing | `@theatre/core` / `@theatre/r3f` 0.7.2 | **last release 2024-05, repo push 2024-08: treat as unmaintained** | Do not adopt for new long-lived work without a written reason. |
| Designer-built 3D scenes | Spline (`@splinetool/react-spline` 4.1.0) | no license field on npm | Runtime cost and licensing must be checked; often heavy. |
| Debug UI / perf overlay (dev only) | `leva` 0.10.1, `lil-gui` 0.21.0, `r3f-perf` 7.2.3 (last release 2024-11) | MIT | Never ship them in production bundles. |
| Charts, dashboards | **Not this stack** — SVG/canvas chart library per dataviz guidance | — | WebGL only for >100k points or true spatial data. |
| Node graphs users edit | **Not this stack** — React Flow (interaction-engineer) | — | — |

## 1. Purpose gate (before any code)

- [ ] One sentence: what this graphic communicates or enables.
- [ ] The non-graphic alternative (static image, SVG, table, chart) is named and its rejection justified.
- [ ] Decorative-only graphics are optional, removable, and off for reduced motion and low tier.

## 2. Performance budget

| Tier | Detect | Target | Typical caps (adjust in spec) |
|---|---|---|---|
| High | WebGL2/WebGPU, `deviceMemory ≥ 8`, desktop | 60 fps (p95 ≤ 16.7 ms) | ≤ 300 draw calls, ≤ 1M tris, ≤ 256 MB textures |
| Mid | WebGL2, mobile or `deviceMemory 4` | 60 fps target, 30 floor | ≤ 100 draw calls, ≤ 300k tris, ≤ 96 MB textures |
| Low | WebGL1 only, `deviceMemory ≤ 2`, save-data | 30 fps floor or static | static image or minimal scene |
| None | no WebGL, reduced data, no JS | static | DOM fallback |

**Gates:**
- [ ] Budgets stated per tier in `GRAPHICS.md`; measured p95 frame time is recorded per tier.
- [ ] Instancing/merging used where draw calls exceed budget; LOD for large meshes.
- [ ] `frameloop="demand"` (R3F) or an equivalent: no continuous rendering while nothing changes.
- [ ] Rendering pauses when the canvas is off-screen (IntersectionObserver) or the tab is hidden.
- [ ] DPR capped (typically ≤ 2; adaptive on low tier).
- [ ] No long tasks > 50 ms during interaction; heavy setup (geometry generation, decoding) is off the main thread or chunked.

## 3. Assets

- [ ] glTF/GLB, compressed with Draco or Meshopt; KTX2/Basis textures (or right-sized AVIF/WebP for 2D).
- [ ] Byte budget per asset and per scene; total recorded.
- [ ] Progressive loading: a placeholder or low-res version first, with a labeled progress state; failed loads fall back without breaking the page.
- [ ] Fonts in 3D (SDF/troika via drei `Text`) subset to what's needed.

## 4. Fallbacks and robustness

- [ ] Static/DOM fallback exists, ships first, and renders when WebGL is unavailable (test by disabling WebGL).
- [ ] `webglcontextlost` handled: pause, show the fallback, attempt restore (force with `WEBGL_lose_context` in tests).
- [ ] WebGPU paths fall back to WebGL2 automatically; feature detection, never UA sniffing.
- [ ] SSR-safe: canvas code only runs on the client (dynamic import / client component).
- [ ] Mount/unmount ×10 leaves `renderer.info.memory.geometries/textures` flat (dispose geometries, materials, textures, render targets, and controls listeners).

## 5. Accessibility

- [ ] The information in the scene is available in the DOM (text, table, list, or alt text describing *what it shows*, not "3D scene").
- [ ] Canvas has `role="img"` + `aria-label` when non-interactive, or interactive objects have DOM proxies that are focusable, labeled, and keyboard-operable (drei `A11y` or equivalent).
- [ ] Camera controls have keyboard equivalents and don't trap scroll; there's a visible "reset view".
- [ ] `prefers-reduced-motion`: no auto-rotation, parallax, or camera flythroughs; state changes are instant or crossfades (WCAG 2.3.3). Flashing stays under 3 per second (WCAG 2.3.1).
- [ ] Text overlaid on scenes meets contrast against the *worst* frame, not the average.

## 6. Interaction inside the canvas

- [ ] Pointer picking is accurate on high-DPR and touch; hover states have a non-hover equivalent on touch.
- [ ] Gestures (orbit, pinch-zoom) don't hijack page scroll on mobile unless the canvas is explicitly focused/fullscreen.
- [ ] Selection and focus state are visible in-scene and mirrored to the DOM proxy.

## Audit severity

| Severity | Examples |
|---|---|
| P0 | Black/broken page when WebGL is missing or the context is lost; information only exists in the canvas; scroll trapped on mobile; flashing > 3/s |
| P1 | p95 frame time > 2× budget on target tier; memory grows on navigation (missing dispose); continuous rendering while idle; no reduced-motion variant |
| P2 | Uncompressed assets; no loading state; DPR uncapped; dev overlays shipped |
| P3 | Minor jank on high tier; unoptimized but within-budget draw calls |

Every finding cites the gate (`§4.5`), the surface, and evidence (perf trace, `renderer.info` numbers, screenshot).
