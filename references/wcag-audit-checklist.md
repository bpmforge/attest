# WCAG 2.2 Manual Audit Checklist

Companion to the `a11y-compliance` agent. Run AFTER the automated pass —
automation (axe-core/pa11y/Lighthouse) catches ~40% of failures; everything
below is where the other 60% lives. Work top to bottom; cite the criterion
number + level in every finding.

---

## Applicability — which standard governs

| Market / context | Standard | Effective floor |
|---|---|---|
| EU consumers (e-commerce, banking, transport, ebooks, OS/devices) | European Accessibility Act (EAA, Directive 2019/882) → EN 301 549 | WCAG 2.1 AA (audit to 2.2 AA — superset, future-proof) |
| EU public sector | Web Accessibility Directive → EN 301 549 | WCAG 2.1 AA |
| US federal agencies + federal contracts | Section 508 (Revised) | WCAG 2.0 AA (audit to 2.2 AA) |
| US private sector | ADA Title III case law | WCAG 2.1/2.2 AA de facto |
| Authoring tools (CMS, editors, builders) | ATAG 2.0 (Part A: tool UI, Part B: output) | WCAG AA on both |
| No stated market | WCAG 2.2 AA | — |

EAA enforcement began 2025-06-28 — EU-facing products without conformance carry
active legal exposure, not theoretical.

---

## 1. Perceivable

| Criterion | How to test | Common component-library failures |
|---|---|---|
| **1.1.1 A** Non-text content | Tab through images/icons with a screen reader; every informative image has alt, every decorative one `alt=""`/`aria-hidden` | Icon-only buttons with no accessible name; SVG icons announced as "image" |
| **1.3.1 A** Info & relationships | Inspect DOM: headings are `<h1-h6>` not styled divs; tables use `<th scope>`; form fields have `<label for>` | Div-soup "cards" with visual-only hierarchy; placeholder used as the label |
| **1.3.4 AA** Orientation | Rotate device / resize to portrait+landscape — no lock | Mobile modals that assume portrait |
| **1.4.3 AA** Contrast (text) | Contrast tool (WebAIM checker, Polypane, browser devtools) on body text 4.5:1, large text 3:1 | Light-gray secondary text (#9ca3af on white = 2.5:1); disabled-look placeholder text carrying real info |
| **1.4.10 AA** Reflow | Zoom to 400% at 1280px (= 320px viewport) — no horizontal scroll, no clipped content | Fixed-width sidebars; data tables with no scroll container; sticky headers eating the viewport |
| **1.4.11 AA** Non-text contrast | Check UI component boundaries + states at 3:1: inputs, focus rings, toggle states, chart series | Hairline input borders (#e5e7eb); focus rings inheriting low-contrast brand color |
| **1.4.4 AA** Resize text | 200% browser text-only zoom — nothing truncated or overlapping | px-based line-height clipping; single-line truncation hiding controls |
| **1.4.13 AA** Content on hover/focus | Hover a tooltip, move pointer onto it (must persist), press Esc (must dismiss) | CSS-only tooltips that vanish on pointer-move; no Esc dismissal |
| **1.4.12 AA** Text spacing | Apply the text-spacing bookmarklet (1.5 line-height, 0.12em letter) — no clipping/overlap | Fixed-height buttons/cards clipping when spacing grows |
| **1.2.2 A / 1.2.5 AA** Captions & audio description | Play any video — captions present and accurate; AD where visuals carry meaning | Auto-generated captions shipped unreviewed; muted hero videos with text baked in |
| **1.3.5 AA** Identify input purpose | Inspect personal-data fields for `autocomplete` tokens (name, email, tel, address) | Custom form libraries stripping autocomplete attributes |

**Automation coverage:** axe catches 1.1.1 (missing alt), 1.4.3 (static contrast), 1.3.5 (autocomplete). Only manual finds: reflow, hover-content behavior, alt QUALITY (alt="image123.png" passes axe), heading meaningfulness, non-text contrast on states, caption accuracy.

## 2. Operable

| Criterion | How to test | Common component-library failures |
|---|---|---|
| **2.1.1 A** Keyboard | Unplug the mouse. Complete every core task with Tab/Shift-Tab/Enter/Space/arrows | Click-only div "buttons"; custom selects/date-pickers with no arrow-key support; drag-only reorder (also 2.5.7 AA) |
| **2.1.2 A** No keyboard trap | Tab through modals, embeds, rich-text editors — can you always get out? | Focus trapped in a widget with no Esc; third-party iframe swallowing Tab |
| **2.4.1 A** Bypass blocks | First Tab press → skip link appears and works | Skip link present but `display:none` (never focusable) or target lacks `tabindex="-1"` |
| **2.4.3 A** Focus order | Tab order matches visual/logical order; modal opens → focus moves in; modal closes → focus returns to trigger | Portal-rendered modals appending to `<body>` — focus stays behind; positive `tabindex` |
| **2.4.7 AA** Focus visible | Tab everywhere — visible indicator on EVERY interactive element | Global `outline: none` reset; focus style only on `:focus-visible` polyfill gaps |
| **2.4.11 AA** Focus not obscured (2.2 NEW) | Tab with sticky headers/footers/cookie banners present — focused element never fully hidden | Sticky bottom bars covering the focused field on mobile |
| **2.5.7 AA** Dragging movements (2.2 NEW) | Every drag interaction has a single-pointer alternative (buttons, menu) | Kanban/sortable lists with drag as the only mechanism |
| **2.5.8 AA** Target size minimum (2.2 NEW) | Measure interactive targets ≥24×24 CSS px (or spacing exception) | Icon buttons at 16px; tightly-packed pagination; table row action glyphs |
| **2.2.1 A** Timing adjustable | Session timeouts warn + extend; carousels pausable | Toast notifications that auto-dismiss with actions inside |
| **2.4.6 AA** Headings and labels | Read headings/labels out of context — do they describe the section/field? | Generic "Details", "More info", "Click here" everywhere |
| **2.5.3 A** Label in name | Voice-control check: visible button text must appear in the accessible name | `aria-label="submit-form-btn"` on a button that reads "Send" |
| **2.3.1 A** Three flashes | Watch animations/loaders — nothing flashes >3×/second | Skeleton shimmer effects tuned too fast |

**Automation coverage:** axe catches `tabindex>0`, label-in-name mismatches, and some name/role gaps. Only manual finds: the actual keyboard walk, trap detection, focus-return-on-close, focus obscured, drag alternatives, target size, heading quality.

## 3. Understandable

| Criterion | How to test | Common component-library failures |
|---|---|---|
| **3.1.1 A** Language of page | Check `<html lang>` present and correct | SPA scaffolds shipping `lang="en"` on localized apps |
| **3.2.2 A** On input | Change selects/radios — no context change (navigation, submit) without explicit action | Auto-submitting filter selects; country select reloading the form |
| **3.3.1 A** Error identification | Submit invalid form — error in TEXT, associated to the field (`aria-describedby`), announced | Red-border-only errors; toast errors disconnected from fields |
| **3.3.2 A** Labels or instructions | Every input has a visible persistent label | Placeholder-as-label (vanishes on type); floating labels with contrast failures |
| **3.3.7 A** Redundant entry (2.2 NEW) | Multi-step flows don't re-ask for already-given info | Checkout asking shipping address twice with no copy option |
| **3.3.8 AA** Accessible authentication (2.2 NEW) | Login has no cognitive test: paste allowed in password fields, no transcription puzzles; CAPTCHA has alternative | `onpaste="return false"`; image-only CAPTCHA |
| **3.2.3 AA** Consistent navigation | Compare nav/header/footer order across pages — identical | Marketing pages and app shell with different nav orders |
| **3.3.3 AA** Error suggestion | Trigger validation errors — message says HOW to fix, not just "invalid" | "Invalid input" with no format hint; regex error dumps |

**Automation coverage:** axe catches missing `lang` and unlabeled fields. Only manual finds: error-message quality and announcement, context-change-on-input, redundant entry, auth flow, cross-page consistency.

## 4. Robust

| Criterion | How to test | Common component-library failures |
|---|---|---|
| **4.1.2 A** Name, role, value | Screen-reader smoke: every control announces name + role + state (expanded/checked/selected) | Custom dropdowns announced as plain text; toggle state not conveyed; `aria-expanded` never updated |
| **4.1.3 AA** Status messages | Trigger async results/toasts/cart updates — announced without focus move (`role="status"`/`aria-live="polite"`) | Search "N results" updating silently; loading spinners with no live region |

**Screen-reader smoke (15 min minimum):** VoiceOver (Cmd-F5, Safari) or NVDA (Firefox). Walk one core task end-to-end. Then sweep landmarks (VO: VO-U → Landmarks): exactly one `main`, labeled `nav`s, no orphan content outside landmarks. Sweep headings: logical h1→h2→h3 outline, no level skips.

---

## Automated-tool coverage map

| Layer | Tool | Catches | Misses |
|---|---|---|---|
| Automated | axe-core (devtools / `@axe-core/cli` / Playwright) | Missing alt/labels/lang, static contrast, duplicate IDs, invalid ARIA attribute USAGE, `tabindex>0` | Everything behavioral |
| Automated | Lighthouse a11y | axe subset + page-level checks; the 0-100 score | Score of 100 ≠ conformant — say so in reports |
| Automated | pa11y (CI) | HTML_CodeSniffer/axe rules headlessly per URL | Auth'd flows unless scripted; interaction states |
| Manual only | — | Keyboard walk, focus order/return/visibility/obscured, traps, reflow behavior, alt/label/error QUALITY, hover-content, drag alternatives, target size, redundant entry, auth cognition, SR announcement, reading order | — |

Rule of thumb: automation proves NON-conformance cheaply; only the manual pass
can support a conformance claim.

---

## Audit pass order (60-90 min per major flow)

1. **Automated** (10 min) — axe devtools on each page state (default, error, modal open); Lighthouse a11y for the score baseline; dedupe.
2. **Keyboard walk** (15 min) — mouse unplugged, complete the core task; log every stall (2.1.1, 2.4.3, 2.4.7, 2.4.11, 2.1.2).
3. **Zoom/reflow** (10 min) — 200% text-only zoom, then 400% page zoom at 1280px (1.4.4, 1.4.10, 1.4.12).
4. **Contrast sweep** (10 min) — WebAIM checker / devtools picker on text tokens, input borders, focus rings, chart series (1.4.3, 1.4.11).
5. **Screen-reader smoke** (15 min) — VoiceOver or NVDA: one task end-to-end, landmark sweep, heading outline, live-region check (4.1.2, 4.1.3, 1.3.1).
6. **Forms & auth** (10 min) — invalid submits, error association + announcement, paste in password, redundant entry (3.3.1, 3.3.2, 3.3.7, 3.3.8).
7. **Targets & pointers** (5 min) — measure smallest interactive targets; find every drag interaction and its alternative (2.5.8, 2.5.7).

Contrast tooling: WebAIM Contrast Checker (spot), browser devtools color picker
(inline APCA/WCAG ratios), Polypane/axe full-page scans (bulk). For design-time
(`--spec`) audits, run the sweep against STYLE_GUIDE color tokens directly —
every text/background token pair gets a ratio.
