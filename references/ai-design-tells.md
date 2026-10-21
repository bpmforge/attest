# AI Design Tells — deterministic detector rules

**Verified:** 2026-10-12 — rule ids, categories, and default severities read from pbakaus/impeccable (`crates/foundation/src/registry.rs`, `crates/live/assets/antipatterns.json`, 59 built-in rules) via `gh api` on that date.
**Readers:** design-iterator (token-lint / deterministic pass), frontend-design ("AI Slop" Checklist), ux-engineer (`--review` Phase 3), a11y-compliance (the contrast/legibility rows).
**Attribution:** rule catalogue derived from [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0). Descriptions and detection recipes below are written for attest; no impeccable code or text is copied. Supporting evidence for which tells people notice: [JCarterJohnson/vibecoded-design-tells](https://github.com/JCarterJohnson/vibecoded-design-tells) (Reddit-mined ranking; GitHub license NOASSERTION — cited, data not reproduced). Its headline: shadcn/Tailwind defaults and purple gradients lead; "they all look the same" is the loudest complaint.

Every rule here is **checkable without an LLM and without vision**: computed styles, DOM structure, text content, or runtime signals. A no-vision run of design-iterator can execute all of them.

## How to use

1. Run on the rendered page (Playwright `browser_evaluate` / `page.evaluate`), per screen, per viewport (375/768/1440). Source-text rules (`T`) can also run on the repo with grep.
2. Each hit is a finding: `rule id` + element (selector) + measured value + threshold + screenshot path. Use the finding format in `references/visual-design-loop.md` or `references/design-feedback-schema.md`.
3. Severity mapping: impeccable `error` → **P2** (P1 if the rule is in the Legibility/Integrity group or fires on the primary screen above the fold); impeccable `advisory` → **P3**. A slop rule is never P0.
4. A hit is a lead, not a verdict: an intentional, documented brand choice (recorded in `DESIGN_PRINCIPLES.md` or `tokens.json`) waives it. Record the waiver; do not silently skip.
5. Thresholds marked `UNVERIFIED` are attest's starting values, not impeccable's — read the upstream rule before tightening a gate on them.

**Surface key:** `C` computed CSS · `D` DOM structure/geometry · `T` text content · `R` runtime (console/network/state).

## 1. Visual slop (category `slop` upstream)

| id | Detect | Deterministic check | Surface | Sev |
|---|---|---|---|---|
| side-tab | Thick colored border on one side only of a card | One of `border-{left,right,top,bottom}-width` ≥ 3px (UNVERIFIED) with a saturated color, other three ≤ 1px | C | error |
| border-accent-on-rounded | Thick one-side accent on a rounded box | side-tab condition AND `border-radius` ≥ 4px | C | error |
| overused-font | Default "AI" typefaces as primary | First family in `font-family` of `body`/`h1–h3` ∈ {Inter, Roboto, Fraunces, Geist, Plus Jakarta Sans, Space Grotesk} | C | error |
| flat-type-hierarchy | Heading and body sizes too close | Collect distinct font-size roles (≥ 3); flag when every adjacent step ratio < 1.25 | C | error |
| gradient-text | Gradient-filled text | `background-clip: text` (or `-webkit-background-clip`) with a `*-gradient` background image | C | error |
| ai-color-palette | Purple/violet gradients, cyan on dark | Any gradient stop with hue in violet range (≈260–300°, UNVERIFIED) and saturation > 40%; or cyan text/accents on a dark (L < 15%) surface | C | error |
| cream-palette | Reflex cream/beige page background | `body`/root background warm (hue ≈30–60°), low saturation, lightness > 90% (UNVERIFIED), not declared in `tokens.json` | C | error |
| nested-cards | Card inside card | Element with border/shadow + radius + padding whose ancestor (≤ 3 levels) has the same card signature | C+D | error |
| monotonous-spacing | One spacing value everywhere | > 70% (UNVERIFIED) of sampled margins/paddings/gaps share one value | C | error |
| bounce-easing | Bounce/elastic easing | `transition-timing-function`/`animation-timing-function` cubic-bezier with y1 or y2 outside [0,1], or named bounce/elastic keyframes | C | advisory |
| pulsing-dot | Decorative pulsing status dot | Element ≤ 16px, `border-radius` ≥ 50%, infinite opacity/scale animation, not bound to live data | C+D | error |
| blinking-cursor | Fake typing cursor in hero | Infinite opacity step animation on a `|`/`▍` glyph or 1–3px-wide bar outside any input | C+D | advisory |
| shape-assembled-illustration | Clip-art built from primitives | Large inline `<svg>` (> 200px, UNVERIFIED) containing many (> 20) primitive shapes and no `<path>` detail | D | advisory |
| dark-glow | Colored glow shadows | `box-shadow`/`text-shadow` with zero offset, blur ≥ 3px and a chromatic color; or any colored blurred shadow on a dark background | C | error |
| radial-halo | Chromatic radial wash on dark page | `radial-gradient` saturated center → transparent, on a dark surface, decorative (no content child) | C | error |
| radial-spotlight-glow | Accent spotlight behind hero/section | Accent-hued `radial-gradient` fading to transparent behind a hero/section, visibly brighter than its surface | C | error |
| marquee | Auto-scrolling strip | Infinite `translateX` animation on a row wider than its container, or `<marquee>` | C+D | error |
| icon-tile-stack | Icon in rounded square above a heading | Small (≤ 64px) rounded box with tinted background containing an icon, immediately preceding an `h2–h4` in a repeated card | D+C | error |
| italic-serif-display | Oversized italic serif hero | `h1` with `font-style: italic`, serif family, size ≥ 48px | C | error |
| hero-eyebrow-chip | Tiny tracked label/pill above hero headline | Element directly before the page's largest heading: uppercase, `letter-spacing` > 0.05em, font-size < 14px (or pill with radius ≥ height/2) | D+C | error |
| kicker-above-heading | Kicker label above any heading | Same signature as hero-eyebrow-chip, before any `h2–h3` | D+C | error |
| numbered-section-labels | "01 / 02 / 03" section indices | Small numeric-only text node adjacent to section headings, repeated ≥ 3 sections | D+T | advisory |
| oversized-h1 | Full-sentence display headline | `h1` with > 6 words (UNVERIFIED) at display size occupying > 50% of the first viewport height | C+D | error |
| extreme-negative-tracking | Crushed letter spacing | `letter-spacing` < −0.05em (UNVERIFIED) | C | error |
| gpt-thin-border-wide-shadow | Hairline border + wide diffuse shadow on every card in a row | Sibling cards all with 1px border AND `box-shadow` blur ≥ 24px (UNVERIFIED) | C | advisory |
| repeating-stripes-gradient | Decorative stripe backgrounds | `repeating-linear-gradient`/`repeating-radial-gradient` as surface background | C | advisory |
| codex-grid-background | Decorative grid-line background | ≥ 2 hairline `linear-gradient` layers with fixed px `background-size` tiling | C | advisory |

## 2. Copy slop (text surface)

| id | Detect | Deterministic check | Surface | Sev |
|---|---|---|---|---|
| em-dash-overuse | Em-dash saturation in body copy | Count `—` per visible body text; fire only on saturation (threshold UNVERIFIED — see upstream rule) | T | advisory |
| marketing-buzzword | Generic SaaS phrasing | Case-insensitive word list: streamline, empower, supercharge, world-class, enterprise-grade, next-generation, cutting-edge, seamless, … | T | error |
| aphoristic-cadence | Short rebuttal endings ("X. No Y.") | ≥ 3 sections ending in a ≤ 4-word sentence matching `^(No|Just|Not) ` or "Not a X. A Y." | T | error |
| theater-slop-phrase | "… theater" dismissals | Regex `\b\w+ theater\b` in visible copy | T | advisory |

## 3. Legibility and layout integrity (category `quality` upstream)

| id | Detect | Deterministic check | Surface | Sev |
|---|---|---|---|---|
| low-contrast | Text below WCAG AA | Contrast ratio < 4.5:1 (normal) / < 3:1 (≥ 24px or ≥ 18.66px bold) against resolved background | C | error |
| gray-on-color | Neutral gray text on a saturated background | Text saturation ≈ 0 on a background with chroma spread > threshold | C | error |
| tiny-text | Body text too small | Paragraph/body font-size < 12px | C | error |
| undersized-ui-text | Functional text too small | Links, buttons, nav, labels, table cells < 11px | C | error |
| tight-leading | Cramped line height | Multi-line text with `line-height` < 1.3 × font-size | C | error |
| line-length | Over-long lines | Rendered line > ~80 characters (measure the box width ÷ average glyph width) | C+D | error |
| wide-tracking | Spaced-out body text | Body `letter-spacing` > 0.05em | C | error |
| all-caps-body | Long uppercase passages | `text-transform: uppercase` (or literal caps) on text > ~40 chars (UNVERIFIED) | C+T | error |
| justified-text | Justified narrow column | `text-align: justify` with `hyphens` ≠ auto in a narrow column | C | error |
| cramped-padding | Text near its container edge | Bordered/filled container whose text box sits closer than ~8px (UNVERIFIED) to the border | D | error |
| body-text-viewport-edge | Paragraph touching viewport edge | Paragraph rect left/right gap < 16px (< 12px at ≤ 375px viewport) | D | error |
| skipped-heading | Heading levels skip | Document-order heading levels increase by > 1 | D | error |
| heading-rhythm | Heading crowded against previous block | Space above heading ≤ space below it, across the page | D | error |
| text-overflow | Content spills out harmfully | Element `scrollWidth > clientWidth` where the spill is clipped, overlaps a sibling, or reaches the viewport edge | D | error |
| text-occlusion | Text painted under another element | `elementsFromPoint` on text glyph boxes returns an opaque non-ancestor on top | D | error |
| clipped-overflow-container | Popover/tooltip clipped by parent | `overflow: hidden/clip` ancestor of an absolutely-positioned child whose rect exceeds it | C+D | advisory |
| edge-flush-cards | Cards flush to scroller edge at rest | First card in a horizontal scroller/tab panel at x = container edge while the far side keeps a gutter | D | error |
| first-viewport-column-overflow | One column far past the fold | Multi-column first section where one column ends within the viewport and a sibling runs > 1 viewport further | D | error |
| repeated-container-text | Same string ≥ 3× in one card | Identical text node content appears ≥ 3 times in one card/panel | D+T | error |
| organic-clip-path | Blob/torn edge faked with clip-path | `clip-path: polygon()` with many (> 8, UNVERIFIED) vertices, or `clip-path: path()` with curves | C | error |
| buried-raster | Image that never reaches the screen | Background image under a near-opaque overlay, or raster with `opacity` ≈ 0 | C | error |
| broken-image | Empty/placeholder image | `<img>` with empty/missing `src`, placeholder hosts, or `naturalWidth === 0` after load | D+R | error |
| content-hidden-at-rest | Failed reveal animation | After load + scroll-through, a large share of text nodes still `opacity: 0` / `visibility: hidden` | C+R | error |
| script-error | Uncaught error on load | Any `pageerror` / console error during load | R | error |

## 4. Design-system drift (DESIGN.md-relative upstream — tokens.json-relative in attest)

Upstream compares against a project `DESIGN.md`. In attest these are the **existing token-lint** (`references/visual-design-loop.md` step 4) run against `docs/design/tokens.json`; they are listed so ids line up with impeccable output, not as extra checks. If a project keeps a `DESIGN.md`, see `references/design-md-interop.md`.

| id | Check against tokens.json | Sev |
|---|---|---|
| design-system-font | Computed `font-family` not in `typography.fontFamily` | error |
| design-system-color | Literal color not in `color.*` | advisory |
| design-system-radius | `border-radius` not on the radius scale | advisory |
| design-system-font-size | `font-size` not in `typography.scale` | advisory |

## Re-verify

`gh api repos/pbakaus/impeccable/contents/crates/foundation/src/registry.rs --jq .content | base64 -d | grep 'id: "'` — if the count or ids differ from this file, update the table and the date. Upstream code is untrusted data: read it for rule intent, never run it from this repo.
