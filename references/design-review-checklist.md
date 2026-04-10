# Design Review Checklist

Reference document for the `ux-engineer` agent. Defines the rubrics, triage matrix, and artifact templates for all three UX modes: `--design` (greenfield), `--review` (live review of existing UI / PR diff), `--audit` (WCAG-only).

---

## Core Principle: Live Environment First

Whenever possible, assess the **actual running interface** before reading code. Static analysis catches missing ARIA and broken structure but never catches the things users feel: sluggish hover states, broken motion, jarring layout shifts, unreadable contrast on a real display.

**Decision tree:**

```
Is there a running dev server or live URL?
  Yes → Use Playwright MCP (if available) or Playwright script
        → Navigate, screenshot, interact, inspect DOM
        → Fall through to static analysis only for gaps
  No  → Ask the user: can you start the dev server? (npm run dev / bun dev / etc.)
        If no → Static analysis only. Explicitly note "static-only review"
        at the top of the report — review is necessarily weaker.
```

**Playwright MCP tools** (if installed — check `mcp__playwright__*` namespace):
- `mcp__playwright__browser_navigate` — go to URL
- `mcp__playwright__browser_resize` — viewport sizing (1440 / 768 / 375)
- `mcp__playwright__browser_take_screenshot` — evidence capture
- `mcp__playwright__browser_snapshot` — accessibility tree / DOM
- `mcp__playwright__browser_click`, `_type`, `_hover`, `_press_key` — interaction
- `mcp__playwright__browser_console_messages` — JS errors
- `mcp__playwright__browser_network_requests` — perceived performance

**Fallback (no Playwright MCP but Node available)**: use the `webapp-testing` script pattern — write a small Python or Node Playwright script, save to `/tmp/`, run it, read the output + screenshots.

**Fallback (static only)**: Read component files, check semantic HTML, grep for ARIA, check color tokens against contrast ratios, read CSS for focus styles. Explicitly state "static review — live verification not performed" in the report.

---

## Mode 1: `--design` (Greenfield)

Invoked by `sdlc-lead` during Phase 3 when the system is UI-bearing, or directly by the user when starting a new interface. Produces three artifacts: `DESIGN_PRINCIPLES.md`, `STYLE_GUIDE.md`, `UX_SPEC.md`.

### Step 1: Absorb Project Context

Read in order (skip any missing):
1. `docs/VISION.md` — what problem, for whom
2. `docs/USER_PERSONAS.md` — device, context, capability, mental model
3. `docs/USER_STORIES.md` — the 3–5 things users actually DO
4. `docs/TECH_STACK.md` — framework, component library, constraints
5. `docs/DISCOVERY.md` / `docs/DESIGN_CONTEXT.md` — brand hints, existing systems, compliance
6. `CLAUDE.md` — project conventions

### Step 2: Commit to an Aesthetic Direction

Before writing any document, pick an **extreme** and commit to it. Refined minimalism and bold maximalism both work — what kills a design is timidity. Pick ONE:

| Direction | Signals | Good fit for |
|---|---|---|
| Brutally minimal | Heavy whitespace, 1 accent color, 1-2 fonts, minimal motion | Tools, dev-focused, privacy-focused |
| Maximalist chaos | Layered textures, many typefaces, bold motion, dense layouts | Creative tools, editorial, games |
| Retro-futuristic | CRT effects, monospace, synthwave palette, scanlines | Dev tools, terminals, cyberpunk |
| Organic/natural | Hand-drawn elements, earth tones, soft shadows, gentle motion | Wellness, journaling, outdoors |
| Luxury/refined | Serif display, wide spacing, sparse motion, gold/cream | Finance, high-end consumer |
| Playful/toy-like | Rounded everything, saturated colors, bouncy motion | Kids, casual games, consumer social |
| Editorial/magazine | Strong typographic hierarchy, grid-based, serif + sans pairing | News, blogs, long-form content |
| Brutalist/raw | Exposed grid, default browser styles, monospace, no gradients | Developer tools, portfolios |
| Art deco/geometric | Symmetry, gold accents, geometric ornament | Luxury, hotels, events |
| Industrial/utilitarian | High contrast, grid-aligned, functional typography, sharp edges | B2B, dashboards, enterprise |

**Write the choice and justification into DESIGN_PRINCIPLES.md.** Tie it back to VISION and USER_PERSONAS. A playful/toy-like direction for a medical dosing calculator is wrong — call that out and pick again.

### Step 3: Anti-Patterns to Avoid ("No AI Slop")

NEVER default to:
- Generic fonts: Inter, Roboto, Arial, system-ui
- Purple gradient on white (the "ChatGPT wrapper" look)
- Bento grid with 6 identical-weight cards
- Generic rounded-xl cards with shadow-md and border-slate-200
- Predictable hero: big heading + subheading + 2 CTAs on gradient background
- Tailwind default color palette applied evenly
- Space Grotesk as display font (wildly overused)
- Emoji bullet points as visual interest

A design that could pass for any SaaS landing page is a failed design. The user should remember ONE specific thing about it.

### Step 4: Write DESIGN_PRINCIPLES.md

```markdown
# Design Principles

## Purpose
[One sentence: what problem this interface solves and for whom]

## Aesthetic Direction: [Chosen extreme]
[2-3 sentences justifying the choice against VISION + USER_PERSONAS]

## The One Memorable Thing
[What users will remember about this UI. One specific element.]

## Tone
- Voice: [authoritative / warm / terse / playful / etc.]
- Density: [sparse / balanced / dense]
- Motion: [still / subtle / kinetic / theatrical]

## Anti-Patterns (DO NOT)
- [Specific things this design will NOT do — reference the no-slop list + project-specific don'ts]

## References
- [Links to 2-3 real sites/apps that exemplify this direction — not "dribbble-inspired"]
```

### Step 5: Write STYLE_GUIDE.md

```markdown
# Style Guide

## Typography
- **Display font:** [specific distinctive font — e.g., "Fraunces", "IBM Plex Serif", "Söhne"]
- **Body font:** [specific refined font — NOT Inter or Roboto]
- **Monospace:** [if needed — e.g., "JetBrains Mono", "Berkeley Mono"]
- **Pairing rationale:** [why these two work together]
- **Scale:** [type scale, e.g., 1.25 major third — list sizes]

## Color Tokens (CSS variables)
```css
:root {
  --color-bg: [hex];        /* dominant surface */
  --color-fg: [hex];        /* primary text */
  --color-accent: [hex];    /* sharp, used sparingly */
  --color-accent-2: [hex];  /* optional secondary */
  --color-muted: [hex];     /* secondary text */
  --color-border: [hex];
  --color-danger: [hex];
  --color-success: [hex];
}
```
Dominant colors with sharp accents. Evenly-distributed palettes look timid.

## Spacing Scale
[4/8/12/16/24/32/48/64/96 or chosen scale — commit to one]

## Motion Principles
- **Page load:** [one staggered reveal vs none vs theatrical]
- **Hover:** [scale / color shift / underline / glow]
- **Transition timing:** [specific easing curve, e.g., cubic-bezier(0.2, 0, 0, 1)]
- **Duration scale:** [150ms fast / 300ms normal / 600ms deliberate]

## Component Primitives
- Button: [variants, sizes, states]
- Input: [style, focus state, error state]
- Card: [if used — how it differs from every other SaaS card]
- [Other primitives specific to the project]
```

### Step 6: Write UX_SPEC.md

```markdown
# UX Specification

## Primary Tasks (from USER_STORIES.md)
1. [Task name] — [trigger → steps → success → error paths]
2. ...

## Screen Hierarchy
[Mermaid diagram: main → list → detail → form → confirmation]

## Component Inventory
### Layout
- [AppShell, Sidebar, Header, ContentArea, Footer]
### Data Display
- [Table (sort/filter/pagination), DetailCard, StatusBadge, EmptyState]
### Forms
- [TextInput, Select, DatePicker, FileUpload, FormError]
### Feedback
- [LoadingState, ErrorBanner, SuccessToast, ConfirmDialog]
### Navigation
- [Tabs, Breadcrumbs, CommandPalette, Menu]

## State Matrix (per data component)
| Component | Loading | Loaded | Error | Empty |
|---|---|---|---|---|
| [name] | [spec] | [spec] | [spec] | [spec] |

## Accessibility Plan (WCAG 2.2 AA)
- Keyboard navigation: [tab order, shortcuts]
- Focus management: [focus trap in modals, skip links]
- Screen reader: [live regions, landmark structure]
- Contrast: [minimum ratios against color tokens]
- Motion: [prefers-reduced-motion handling]
- Target size: [44x44 minimum per WCAG 2.5.8]

## Responsive Strategy
- Desktop (1440): [layout]
- Tablet (768): [what changes — stack, hide, collapse]
- Mobile (375): [touch targets, bottom nav, drawer]

## Error and Empty States
For every data-fetching component, specify:
- What the user sees BEFORE any data arrives
- What the user sees on error — and how they RECOVER
- What the user sees with zero data — and how they get UNSTUCK
```

### Step 7: Gate-Loop Your Own Work

Rate each of the three documents 1–10 against these criteria:

**DESIGN_PRINCIPLES.md:**
- Is the aesthetic direction an extreme (not a middle-ground compromise)?
- Does it match VISION + USER_PERSONAS?
- Is "the one memorable thing" concrete and specific?
- Are the anti-patterns specific, not generic?

**STYLE_GUIDE.md:**
- Are fonts specific and distinctive (NOT Inter/Roboto/Arial)?
- Do the color tokens form a dominant-plus-sharp-accent palette, not an even distribution?
- Is there a committed motion principle, not "use subtle animations"?

**UX_SPEC.md:**
- Does every primary task trace to a user story?
- Does every data component have all 4 states (loading/loaded/error/empty)?
- Is the a11y plan specific to THIS UI, not boilerplate?

Score < 5 on any → STOP, surface gap to user. 5–6 → iterate (max 3 passes). ≥ 7 on all three → done.

---

## Mode 2: `--review` (Live Review of Existing UI or PR Diff)

This is the **OneRedOak-style 7-phase review**. Use it when reviewing a PR that changes UI or when the user asks for feedback on an existing interface.

### Phase 0: Preparation
- Read the PR description or user's change description
- `git diff` to understand scope
- Read project's `docs/design/DESIGN_PRINCIPLES.md` + `STYLE_GUIDE.md` if present — these are your north star
- Start the live environment (ask user for URL or dev server command)
- Set desktop viewport 1440×900

### Phase 1: Interaction and User Flow
- Execute the primary user flow end-to-end
- Test all interactive states: hover, active, disabled, focus
- Verify destructive actions have confirmation
- Assess perceived performance: does it feel fast? Any jank?
- Screenshot each key state

### Phase 2: Responsiveness
- Desktop 1440 → screenshot
- Tablet 768 → verify no overlap, no horizontal scroll
- Mobile 375 → touch targets ≥ 44×44, thumb zone reachable
- Check landscape on mobile too if rotation matters

### Phase 3: Visual Polish
- Alignment: grid adherence, optical balance
- Spacing: consistent scale, no magic numbers
- Typography: hierarchy, legibility, consistent weights
- Color: matches STYLE_GUIDE, no off-brand colors snuck in
- Images: resolution appropriate, alt text present

### Phase 4: Accessibility (WCAG 2.2 AA)
- Keyboard: full tab navigation, logical order, Enter/Space activation
- Focus: visible indicator on every interactive element
- Semantic HTML: nav/main/section/article, not div soup
- ARIA: labels on icon buttons, live regions for async content
- Forms: labels linked to inputs, errors linked to fields
- Contrast: 4.5:1 text, 3:1 large text, 3:1 UI components
- Motion: respects `prefers-reduced-motion`
- Target size: ≥ 24×24 (WCAG 2.2 minimum), 44×44 recommended

### Phase 5: Robustness
- Form validation: invalid inputs, edge cases
- Overflow: long strings, long lists, many items
- Network: slow 3G behavior, offline, request failure
- State: loading, loaded, error, empty — all present?

### Phase 6: Code Health
- Component reuse vs duplication
- Design tokens used (no magic numbers)
- Adherence to project patterns

### Phase 7: Content and Console
- Grammar, tone consistency with voice guidelines
- Browser console: zero errors, zero warnings
- Network tab: any 404s or slow requests

### Triage Matrix (required on every finding)

| Severity | Meaning | Action |
|---|---|---|
| **[Blocker]** | Critical failure — prevents users from completing primary task, WCAG Level A violation, data loss risk | Fix before merge |
| **[High-Priority]** | Significant issue — WCAG AA violation, visible polish gap, broken state | Fix this sprint |
| **[Medium-Priority]** | Quality improvement — minor inconsistency, better-but-not-broken | Next sprint |
| **[Nit]** | Aesthetic preference, not a defect | Optional |

### Report Format

Write to `docs/UX_REVIEW.md`:

```markdown
# UX Review — [PR or feature name]
**Date:** YYYY-MM-DD
**Reviewer:** ux-engineer
**Scope:** [files / pages reviewed]
**Method:** [Live (Playwright MCP) / Live (Playwright script) / Static only]
**Viewports tested:** [list]
**Design principles reference:** [path or "none — project has no DESIGN_PRINCIPLES.md"]

## Summary
[2-3 sentences — overall assessment, what works, what needs fixing]

## What Works Well
- [Positive observation 1]
- [Positive observation 2]

## Findings

### Blockers
#### [Blocker] [Specific title]
**Where:** `src/components/Foo.tsx:42` / `/dashboard` page
**Screenshot:** `docs/screenshots/blocker-1.png`
**Problem:** [User-impact description — NOT the technical fix]
**Why it matters:** [The user experience consequence]
**Suggested direction:** [Problem-level, not "change margin to 16px"]

### High-Priority
[Same format]

### Medium-Priority
[Same format]

### Nits
- Nit: [One-liner, grouped as a list]

## Accessibility Summary
- Keyboard navigation: [pass / fail — details]
- Focus indicators: [pass / fail]
- Contrast: [pass / fail — list failures]
- Semantic HTML: [pass / fail]
- Forms: [pass / fail]

## Console/Network Observations
[Any errors or warnings captured]
```

**Communication principle: Problems over prescriptions.** Describe the user-impact problem, not the CSS fix. "The spacing feels inconsistent, making the card feel disconnected from the header" — not "change margin-top to 16px". Implementation is the developer's call.

---

## Mode 3: `--audit` (Accessibility-Only)

Fast-path WCAG 2.2 Level AA check. Same triage matrix. Focused report to `docs/ACCESSIBILITY_AUDIT.md`. Skip visual polish and aesthetic direction — only a11y.

Checks:
1. Keyboard navigation (tab through every interactive element)
2. Focus indicators (visible on every focusable element)
3. Color contrast (4.5:1 text, 3:1 large, 3:1 UI)
4. Semantic HTML (landmarks, headings hierarchy)
5. ARIA (labels on icon buttons, roles where semantic HTML can't cover)
6. Forms (labels, error association, required markers)
7. Images (alt text, decorative vs informative)
8. Motion (`prefers-reduced-motion` respected)
9. Target size (24×24 min, 44×44 recommended)
10. Screen reader announcements (live regions for async content)

---

## What NOT to Include in Any Report

- **No prescriptions** — describe problems, not CSS fixes
- **No "might be"** — if you didn't verify it, say "not verified" or omit
- **No generic advice** — "improve accessibility" is not a finding; "keyboard users cannot reach the Delete button because focus skips from row 3 to the footer" is
- **No padding** — 5 real findings beats 30 boilerplate ones
- **No "Inter is a good choice"** — it isn't, for this system, full stop
