# Visual Design Loop — render → screenshot → critique → fix → re-verify

The protocol behind `/design-iterate`. It replicates the property that makes Claude-Design-style
tools work: **code changes and rendered visual output live in ONE feedback loop.** The agent edits
code, looks at the actual pixels the change produced, judges them against the project's design
system, fixes, and looks again — instead of shipping a change and hoping a later review catches
the drift.

Three ingredients, all mandatory:

1. **Design-system grounding** — every judgment cites `docs/design/tokens.json` or a named
   principle. No spec → extract one first (see Token Sync below). A loop without a spec is taste,
   not verification.
2. **Grounded findings** — every finding is pinned to a screenshot file, a viewport, and a specific
   element. "This feels cramped" is not a finding; "16px gap where the spacing scale says 24px,
   see login-375.png, element `form > .actions`" is.
3. **Re-capture after every fix wave** — a fix is not done when the code is edited; it is done when
   a fresh screenshot shows it closed.

## Doctrine note: vision-first, with a deterministic floor

This repo's browser doctrine is "snapshot first, screenshot second" (vision-optional). **This loop
is the sanctioned exception**: visual quality lives in pixels, so on a vision-capable model the
screenshot critique is the primary signal. On a model without vision, degrade honestly — run only
the deterministic token-lint + accessibility-snapshot checks below, write
`**Method: token-lint only — visual critique not performed (no vision)**` at the top of the log,
and lower confidence accordingly. Never describe a screenshot you cannot see.

## Preconditions

| Requirement | How |
|---|---|
| Running app | Dev server started (detect `npm run dev` / `vite` / project skill) or a URL supplied by the caller |
| `docs/design/tokens.json` | From `design-system-lead` (greenfield) or `/design-iterate --sync` (existing codebase) |
| Design principles (optional, strengthens critique) | `docs/design/DESIGN_PRINCIPLES.md`, `docs/design/STYLE_GUIDE.md` if they exist |
| Rubrics | `references/design-review-checklist.md` |

## Tool surface (verified against @playwright/mcp 0.0.79)

Current names are **snapshot-ref based** — interaction tools take an element ref from the latest
`browser_snapshot()`, not a bare CSS selector. Older docs in this repo
(`browser_screenshot`, `browser_fill`, selector-based `browser_click`) are stale; if a call returns
tool-not-found, list the live server's tools and adapt rather than retrying.

| Tool | Use in this loop |
|---|---|
| `browser_navigate(url)` | Open the target screen |
| `browser_resize(width, height)` | Set the viewport for each matrix row |
| `browser_snapshot()` | Accessibility tree + element refs (also the no-vision fallback signal) |
| `browser_take_screenshot()` | The primary visual evidence; supports full-page and element shots |
| `browser_evaluate(fn)` | Deterministic token-lint via computed styles |
| `browser_console_messages()` | Errors only — a visually-fine screen with console errors is not clean |
| `browser_click` / `browser_type` / `browser_fill_form` | Reach interaction states (menus open, forms errored) |
| `browser_wait_for` | Stabilize before capture — never screenshot a loading state by accident |
| `browser_verify_element_visible` / `browser_verify_text_visible` | Cheap assertions during re-verify |
| `browser_highlight` / `browser_hide_highlight` | Pin a finding to an element for an annotated capture |
| `browser_start_video` / `browser_stop_video` | Optional: record an iteration for the report |
| `browser_close()` | Always, at the end |

## Viewport matrix

Match the repo standard (ux-engineer / playwright-config): **375×667 mobile, 768×1024 tablet,
1440×900 desktop.** Every iteration captures every matrix row for the target screen. Beyond the
default state, capture the states that exist and matter: one key interaction state (menu open,
modal shown), and empty / loading / error where reachable. States are the coverage denominator,
not screen names.

## The loop (per target screen — hard cap 3 iterations)

1. **Ground.** Read `tokens.json`, principles docs, and the checklist. Build the critique rubric
   from them — the rubric is project-specific, not generic.
2. **Render.** Navigate; `browser_wait_for` on a selector that proves the screen is settled.
3. **Capture.** For each viewport: resize → wait → screenshot → snapshot. Pull console errors once
   per screen. Save screenshots to `docs/screenshots/design-iterate/iter-<N>/<screen>-<viewport>.png`.
4. **Token-lint (deterministic).** Sample computed styles of the screen's key elements and diff
   against `tokens.json` (snippet below). Off-scale values are findings even if they look fine.
5. **Critique (vision).** Judge each screenshot against the rubric: hierarchy, spacing rhythm,
   alignment, contrast and legibility, token conformance, interaction-state completeness, and the
   AI-slop signals from `references/design-review-checklist.md`. Emit findings in the format below.
6. **Fix.** Apply the smallest code change that closes each P0/P1. Existing framework and component
   library only; never introduce a new one. Max 5 fixes per wave before re-capturing.
7. **Re-verify.** Re-capture the SAME viewports and states. Mark each finding closed only when the
   new screenshot shows it closed. New findings join the next iteration.
8. **Exit.** Stop when no P0/P1 remains open, or the 3-iteration cap hits — remaining findings go
   to the log as residuals with a one-line reason each. A finding that survives 2 fix attempts is
   marked `BLOCKED` with evidence, not retried a third time.

## Finding format (grounded — no vibes)

```
[P1] checkout / 375×667 / iter-1
Screenshot: docs/screenshots/design-iterate/iter-1/checkout-375.png
Element: "Place order" button (accessible name; snapshot ref e42)
Expected: color.primary from tokens.json (#0F4C81); tap target ≥ 44px
Observed: #7B61FF — not in the token scale; height 36px
Fix: use the primary token (via the project's token variable), pad to 44px
Closed: iter-2, checkout-375.png — matches token, 44px measured
```

Severity: **P0** broken/unusable/illegible · **P1** violates a token, the spec, or blocks
accessibility · **P2** polish (rhythm, alignment, motion) · **P3** nit. Fixes are applied for
P0/P1 always, P2 within the iteration cap, P3 logged only.

## Token-lint snippet

Run via `browser_evaluate` per viewport; compare the result against `tokens.json` in-context:

```javascript
() => {
  const pick = el => {
    const s = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className, font: s.fontFamily, size: s.fontSize,
             color: s.color, bg: s.backgroundColor, radius: s.borderRadius,
             mt: s.marginTop, mb: s.marginBottom, pt: s.paddingTop, gap: s.gap };
  };
  const targets = [...document.querySelectorAll(
    'h1,h2,h3,button,a.btn,[role=button],input,select,.card,nav,main')].slice(0, 40);
  return targets.map(pick);
}
```

Flag: any font-family not in `typography.fontFamily`; any color not in the `color` scale (allow
browser-normalized rgb() of a scale hex); any spacing value off the `spacing` scale by more than
1px; radius/shadow values not derivable from the tokens.

## Iteration log — `docs/design/ITERATION_LOG.md`

One section per iteration: captures taken (paths), findings opened (full format), fixes applied
(`file:line` per fix), findings closed (with closing screenshot), residuals. Head the file with
the target screens, tokens.json provenance (authored vs extracted), and the method line
(vision vs token-lint-only).

## Anti-loop rules

Hard cap 3 iterations per target; max 5 fixes per wave before re-capture; 2 fix attempts per
finding then `BLOCKED`; never re-screenshot an unchanged app state hoping for a different
impression. `agents/shared/LOOP_PREVENTION.md` governs as usual.

## Boundaries

- **Not `/ui-verify`** — that is functional/spec conformance (does the flow work), vision-optional
  by design. This loop judges visual quality and *changes code*.
- **Not `/ux --review`** — that is a one-pass 7-phase review producing triaged findings for someone
  else to fix ("problems over prescriptions"). This loop applies and re-verifies fixes itself.
- **Not `/frontend --polish`** — that elevates code without a render loop. This loop is the
  render-verified version; prefer it when a dev server can run.
- **Not `qa-vnv-engineer`** — that owns pixelmatch regression baselines over time. This loop is
  point-in-time iteration toward the spec.

Composition: run after `frontend-design --implement`/`--polish` waves, before `a11y-compliance`
certification. For real logged-in environments, see `references/real-browser-bridge.md`.
