# Graphics Patterns — 3D, WebGL/WebGPU, canvas: stack choice, budgets, gates

**Verified:** 2026-10-12 (versions from `npm view` / `gh api`; measurement recipes revised after a live smoke-test audit of a three.js r186 example). Re-run `references/ui-ecosystem-map.md` lookup recipes before adopting.
**Readers:** graphics-engineer (all modes), frontend-design, performance-engineer, a11y-compliance.
**Paths:** `references/<x>.md` resolves to `~/.config/opencode/references/<x>.md` (opencode) or `~/.claude/agents/<x>.md` (Claude Code).

Every gate has an id (`§4.2`). Findings cite it; `--design` copies the applicable lines into `docs/design/GRAPHICS.md`.

## 0. Choose the stack

| Need | Use | Status 2026-10-12 | Notes |
|---|---|---|---|
| 3D in a React app | `@react-three/fiber` 9.8.1 + `@react-three/drei` 10.7.9 on `three` 0.186.1 | active, MIT | R3F 9 targets React 19; check peers (`stack-coherence.mjs` SC-06). three.js is 0.x: read the migration guide across every release gap. |
| 3D without React | `three` directly | active, MIT | Same migration rule. |
| Post-processing (bloom, DOF, SSAO) | `@react-three/postprocessing` 3.2.0 | active, MIT | Each pass is a full-screen cost; budget it. |
| Fast 2D sprites/particles/large point sets | `pixi.js` 8.22.0 (`@pixi/react` 8.0.5 for React) | active, MIT | Prefer over raw canvas past a few thousand objects. |
| Minimal WebGL, tiny bundle, custom shaders | `ogl` 1.0.11 | last release 2025-01, Unlicense | Small and stable but quiet; fine for a single effect. |
| Scroll/timeline orchestration | `gsap` 3.15.0 or `motion` 14.1.0 | GSAP: own no-charge license | One per app unless written reason (SC-03). |
| Visual timeline/sequence editing | `@theatre/core` / `@theatre/r3f` 0.7.2 | **last release 2024-05 — treat as unmaintained** | No new long-lived work without a written reason. |
| Designer-built 3D scenes | Spline (`@splinetool/react-spline` 4.1.0) | no npm license field | Check runtime cost and terms; often heavy. |
| Debug UI / perf overlay (dev only) | `leva` 0.10.1, `lil-gui` 0.21.0, `r3f-perf` 7.2.3 | MIT | Never in production bundles. |
| Charts, dashboards | **Not this stack** — SVG/canvas chart library | — | WebGL only for >100k points or true spatial data. |
| Node graphs users edit | **Not this stack** — React Flow (interaction-engineer) | — | — |

## 1. Purpose gate (before any code)

- **§1.1** One sentence: what this graphic communicates or enables.
- **§1.2** The non-graphic alternative (static image, SVG, table, chart) is named and its rejection justified.
- **§1.3** Decorative-only graphics are optional, removable, and off for reduced motion and low tier.

## 2. Performance budget

| Tier | Detect | Target | Typical caps (adjust in spec) |
|---|---|---|---|
| High | WebGL2/WebGPU, `deviceMemory ≥ 8`, desktop | 60 fps (p95 ≤ 16.7 ms) | ≤ 300 draw calls, ≤ 1M tris, ≤ 256 MB textures |
| Mid | WebGL2, mobile or `deviceMemory 4` | 60 fps target, 30 floor | ≤ 100 draw calls, ≤ 300k tris, ≤ 96 MB textures |
| Low | WebGL1 only, `deviceMemory ≤ 2`, save-data | 30 fps floor or static | static image or minimal scene |
| None | no WebGL, reduced data, no JS | static | DOM fallback |

- **§2.1** Budgets stated per tier in `GRAPHICS.md`; measured p95 frame time recorded per tier **on a real GPU** (see Measurement method).
- **§2.2** Instancing/merging where draw calls exceed budget; LOD for large meshes.
- **§2.3** No continuous rendering while nothing changes (`frameloop="demand"` in R3F or equivalent). **Carve-out:** scenes that are animated by design may render continuously, but must still satisfy §2.4 and §5.4.
- **§2.4** Rendering pauses when the canvas is off-screen (IntersectionObserver) and when the tab is hidden (a `requestAnimationFrame` loop is browser-throttled when hidden; a `setInterval`/worker-driven loop is not — check which the code uses).
- **§2.5** DPR capped (typically ≤ 2; adaptive on low tier).
- **§2.6** No long tasks > 50 ms during interaction; heavy setup (geometry generation, decoding) is off the main thread or chunked. A one-off setup task is reported, not failed, unless it blocks first interaction.

## 3. Assets

- **§3.1** glTF/GLB compressed with Draco or Meshopt; KTX2/Basis textures (or right-sized AVIF/WebP for 2D).
- **§3.2** Byte budget per asset and per scene; total recorded.
- **§3.3** Progressive loading: placeholder or low-res first, labeled progress state; failed loads fall back without breaking the page.
- **§3.4** Fonts in 3D (SDF/troika via drei `Text`) subset to what's needed.

## 4. Fallbacks and robustness

- **§4.1** Static/DOM fallback exists, ships first, and renders when WebGL is unavailable — no uncaught error, no blank region.
- **§4.2** `webglcontextlost`: pause and show the fallback or a message while lost; restore on `webglcontextrestored`.
- **§4.3** WebGPU paths fall back to WebGL2 automatically; feature detection, never UA sniffing.
- **§4.4** SSR-safe: canvas code only runs on the client. *N/A for standalone (non-SSR) pages — say so.*
- **§4.5** Mount/unmount ×10 leaves GPU object counts flat (dispose geometries, materials, textures, render targets, control listeners). *N/A for pages that never unmount the scene — say so.*

## 5. Accessibility

- **§5.1** The information in the scene is available in the DOM (text, table, list, or alt text describing *what it shows*).
- **§5.2** Canvas has `role="img"` + `aria-label` when non-interactive, or interactive objects have focusable, labeled DOM proxies (drei `A11y` or equivalent).
- **§5.3** Camera controls have keyboard equivalents, don't trap page scroll, and a visible "reset view" exists.
- **§5.4** `prefers-reduced-motion`: no auto-rotation, parallax, camera flythroughs, or perpetual animation loops; state changes are instant or crossfades (WCAG 2.3.3). Flashing stays under 3 per second (WCAG 2.3.1).
- **§5.5** Text overlaid on scenes meets contrast against the *worst* frame, not the average.

## 6. Interaction inside the canvas

- **§6.1** Pointer picking is accurate on high-DPR and touch; hover states have a touch equivalent.
- **§6.2** Gestures (orbit, pinch-zoom) don't hijack page scroll on mobile unless the canvas is explicitly focused/fullscreen.
- **§6.3** Selection/focus state is visible in-scene and mirrored to the DOM proxy.

## Audit severity

| Severity | Examples |
|---|---|
| P0 | Broken page (blank + uncaught error) with WebGL unavailable (§4.1); context loss that **never recovers** (§4.2); information only in the canvas (§5.1); scroll trapped on mobile (§6.2); flashing > 3/s (§5.4) |
| P1 | Canvas **blank while lost** but recovers on restore (§4.2); p95 frame time > 2× budget on a real target-tier GPU (§2.1); GPU objects grow across remounts (§4.5); continuous rendering while idle in a non-animated scene (§2.3); no reduced-motion variant (§5.4) |
| P2 | Uncompressed assets (§3.1); no loading state (§3.3); DPR uncapped (§2.5); no keyboard path for camera controls (§5.3); unlabeled canvas (§5.2); dev overlays shipped |
| P3 | Minor jank on high tier; within-budget but unoptimized draw calls |

For demos/examples (not products), keep findings but tag those that are "expected for a demo" (purpose gate, perf overlays, continuous animation) separately.

## Measurement method (recipes and rules)

- **Renderer first.** Read `WEBGL_debug_renderer_info` `UNMASKED_RENDERER_WEBGL` before any frame measurement. If it says **SwiftShader** (headless Chromium's software renderer), frame times are *relative only*: record them, but tier verdicts (§2.1) are **void** — say so and re-measure headed on a real GPU, or on the user's device via `references/real-browser-bridge.md`. CPU throttling under SwiftShader slows rendering too, so it does not simulate a slow phone.
- **GPU objects when `renderer.info` is unreachable** (module-bundled pages expose only `window.__THREE__`): add an init script that wraps `WebGLRenderingContext`/`WebGL2RenderingContext` `createTexture/deleteTexture`, `createBuffer/deleteBuffer`, `drawArrays/drawElements(Instanced)` and count per frame. Created-minus-deleted is the memory-trend proxy; GPU memory in bytes is not measurable from Playwright.
- **Context loss (§4.2):** get the extension handle **before** losing — `const ext = gl.getExtension('WEBGL_lose_context'); ext.loseContext(); …; ext.restoreContext();`. Asking for the extension after the loss returns `null` and produces a false "restore failed".
- **WebGL unavailable (§4.1):** launch Chromium with `--disable-webgl --disable-3d-apis`; capture console errors and a screenshot.
- **Tiers:** `navigator.deviceMemory` can't be emulated by Playwright options (headless reports the host); override with an init script (`Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 })`) when testing tier detection.
- **Hidden tab (§2.4):** headless page switching does not reliably change `visibilityState`; verify statically (rAF vs timer loop) plus the IntersectionObserver off-screen check by scrolling the canvas out of view and counting draw calls.
- **Node Playwright from ESM:** `createRequire('<package.json path>')` then `require('playwright')` — `NODE_PATH` does not apply to `import`.
- **Re-verify** any P0/P1 from a single run before writing it.
