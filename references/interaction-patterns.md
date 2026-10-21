# Interaction Patterns — contracts, gates, and audit rubric

**Verified:** 2026-10-12 (gates revised after a live smoke-test audit of dnd-kit's multiple-lists demo). Standards cited: WCAG 2.2 (2.1.1 Keyboard, 2.1.4 Character Key Shortcuts, 2.3.3 Animation from Interactions, 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 4.1.2 Name, Role, Value, 4.1.3 Status Messages), WAI-ARIA APG.
**Readers:** interaction-engineer (all modes), ux-engineer `--review`, a11y-compliance.
**Paths:** `references/<x>.md` resolves to `~/.config/opencode/references/<x>.md` (opencode) or `~/.claude/agents/<x>.md` (Claude Code).

An interaction is not done when it works with a mouse. It is done when it has a keyboard path, a single-pointer path, an accessible name, an announced outcome, a cancel path, a persisted result, and a reduced-motion variant. Every gate below has an id (`§1.1`). Findings cite the id; `--spec` copies the gate lines into `docs/design/INTERACTIONS.md` unchecked.

## 0. Pick the right layer first

| The user needs to… | Use | Not |
|---|---|---|
| Reorder items / move cards between columns inside *your* app | dnd-kit (`@dnd-kit/react`) | Puck (too much), HTML5 DnD API (no touch, poor a11y) |
| Arrange *their own* pages/dashboards from a block palette | Puck (`@puckeditor/core`) | hand-rolled dnd-kit editor |
| Build a bespoke editor whose internals you control | Craft.js (low-maintenance — see ecosystem map) or dnd-kit + your own tree | Puck if its field model fights you |
| Connect nodes with edges (pipelines, agent graphs) | React Flow (`@xyflow/react`) | tldraw |
| Free-form spatial whiteboard | tldraw (license key) / Excalidraw (MIT) | React Flow |
| Resize split panes | shadcn `resizable` / `react-resizable-panels` | CSS `resize` |
| Find-and-run any action | shadcn `command` / `cmdk` | a custom search input |

Two layers needed? Keep the **visual component separate from its interactive wrapper** (`MetricCard` vs `SortableWidget(MetricCard)`) so the same widget renders in a static page, a Puck block, and a generated-UI catalog. Before adding any library: `references/stack-coherence.md` pre-flight.

## 1. Drag and drop / sortable

- **§1.1** Keyboard drag path for every draggable — focus the handle, Space/Enter picks up, arrows move, Space/Enter drops, Escape cancels (WCAG 2.1.1). dnd-kit ships a keyboard sensor; it must be enabled, not just installed.
- **§1.2** Single-pointer alternative — a "Move to…" menu or up/down buttons (WCAG 2.5.7). Keyboard support alone does not satisfy 2.5.7.
- **§1.3** Live-region announcements for pick-up, move-over, drop, cancel (WCAG 4.1.3), using item **names** (not ids), and the drop announcement states the **destination** ("Task 3 moved to Done, position 2 of 5").
- **§1.4** Visible drag preview/overlay; visible valid drop targets while dragging; invalid targets look invalid.
- **§1.5** Click vs drag disambiguated — activation distance or delay so a click on a card doesn't start a drag and a drag doesn't fire the card's click.
- **§1.6** Escape restores the exact prior order; a failed save rolls back optimistic state and says so.
- **§1.7** Touch works — pointer sensor with a touch-friendly activation constraint; scrolling a list on mobile does not grab items.
- **§1.8** Handle and in-card control targets ≥ 24×24 CSS px (WCAG 2.5.8).
- **§1.9** Auto-scroll near container edges for long lists.
- **§1.10** Every handle and every in-card button has an accessible name (`aria-label` or visible text — "Drag Task 3", "Delete Task 3"), not an icon-only unnamed button (WCAG 4.1.2).
- **§1.11** Controls inside a draggable card (delete, edit, menu) are keyboard-reachable and visible on focus — never `visibility:hidden`/`display:none` until hover (WCAG 2.1.1). Hover-reveal must also be focus-reveal (`:focus-within`).
- **§1.12** Narrow viewports: a multi-column board stays usable at 375 px — columns stack, scroll horizontally with a visible affordance, or switch to a column picker; columns are never clipped out of reach.

## 2. Layout state and persistence

Layouts are **data**, not code. Agents and users both edit the same JSON; an agent changing a layout rewrites JSON, never JSX.

```json
{
  "version": 1,
  "layoutId": "operations",
  "widgets": [
    { "id": "agent-runs", "type": "metric-card", "region": "primary", "order": 0,
      "size": { "w": 1, "h": 1 }, "config": { "title": "Agent runs", "metric": "agent_runs_24h" } }
  ]
}
```

- **§2.1** Stable widget ids (never array index) — reorder must not remount/lose widget state.
- **§2.2** Schema-validated on load (zod/valibot/JSON Schema); invalid or unknown `type` → fallback widget + logged error, not a crash.
- **§2.3** `version` field present and a migration path for N-1.
- **§2.4** Round-trip test: serialize → load → serialize is byte-identical.
- **§2.5** Concurrent edits (two tabs / agent + user) resolve by a stated rule (last-write-wins with notice, or version check and refuse).
- **§2.6** "Reset to default layout" exists.

## 3. Undo / redo and destructive actions

- **§3.1** Every destructive or layout-changing action is undoable, or confirmed *before* it happens — never both silent and irreversible.
- **§3.2** Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (Ctrl+Y on Windows) wired, and not hijacked inside text inputs.
- **§3.3** Undo of a persisted change re-persists (undo is a new write, not a local-only revert).
- **§3.4** Toast-style undo ("Card deleted · Undo") stays ≥ 5 s, is keyboard-reachable, and the deletion is announced (WCAG 4.1.3).

## 4. Resizable panels and collapsible regions

- **§4.1** Separator is focusable with `role="separator"`, `aria-valuenow/min/max`, arrow-key resize.
- **§4.2** Min/max sizes stated; a collapsed panel has a visible way back.
- **§4.3** Sizes persist per user (same rules as §2).
- **§4.4** Narrow viewports: panels stack or become sheets — never a 120 px-wide unusable column.

## 5. Command palette and keyboard shortcuts

- **§5.1** Opens with Cmd/Ctrl+K (or the project's documented key), traps focus; Escape closes and returns focus to the trigger.
- **§5.2** Every palette action is also reachable without the palette.
- **§5.3** Shortcuts listed in a help surface (`?`); never shadow browser/screen-reader keys; single-key shortcuts can be turned off or remapped (WCAG 2.1.4).

## 6. Motion tied to interaction

Durations/easings come from `docs/design/tokens.json` `motion` — frontend-design owns the aesthetic, this file owns *when motion is functionally required*.

- **§6.1** Motion explains a state change (where did the card go, what opened); decorative-only motion is optional and removable.
- **§6.2** `prefers-reduced-motion: reduce` → transforms/parallax/background loops replaced by opacity or instant change (WCAG 2.3.3).
- **§6.3** Layout animation does not shift focus or reflow under the pointer mid-drag.
- **§6.4** Only `transform`/`opacity` animated on hot paths; no animation blocks input.

## 7. Async states every interactive surface needs

- **§7.1** Loading — skeleton matching final layout (no layout shift), or progress with a label.
- **§7.2** Empty — explains why and offers the next action.
- **§7.3** Error — says what failed, keeps user input, offers retry.
- **§7.4** Partial/stale — marks stale data; never shows old numbers as current.
- **§7.5** Saving / saved / save-failed — visible and announced (WCAG 4.1.3).
- **§7.6** Offline / conflict — follows the rule stated in §2.5.

## 8. Canvas / node editors (React Flow, tldraw)

- **§8.1** Keyboard: Tab through nodes, arrows to nudge, Delete to remove (with undo), Escape to deselect.
- **§8.2** Pan/zoom controls exist as buttons, not only gestures; "fit view" exists.
- **§8.3** Large graphs (≥ 500 nodes) measured — virtualization/`onlyRenderVisibleElements` decision recorded with a frame-time number.
- **§8.4** Graph state is serializable JSON (same rules as §2).

## Audit severity

| Severity | Meaning | Examples |
|---|---|---|
| P0 | Task impossible for some users, or data loss | No keyboard path at all for a drag (§1.1); in-card controls unreachable by keyboard (§1.11); failed save silently discards the layout (§1.6/§7.5) |
| P1 | Task possible but broken, misleading, or failing a WCAG AA criterion | Keyboard path exists but no single-pointer alternative (§1.2, WCAG 2.5.7); silent + un-undoable delete (§3.1); unnamed buttons (§1.10); Escape doesn't restore (§1.6); click starts a drag (§1.5) with data side-effects; no reduced-motion variant for large transforms (§6.2) |
| P2 | Friction | No destination in announcements (§1.3); immediate pick-up without activation constraint (§1.5) when harmless; no auto-scroll (§1.9); clipped columns with a workaround (§1.12); decorative loops under reduced motion (§6.2) |
| P3 | Polish | Drop animation snaps instead of settling |

"Drag-only" in the agent definition means **no keyboard path and no pointer alternative** — that is P0. A keyboard path without a pointer alternative is P1.

## Audit method (recipes and rules)

- **Re-verify before writing:** any P0/P1 that rests on a single run is re-run (fresh page load, slower key sequence) before it goes in the report. Retract and say so if it doesn't reproduce.
- **Evidence or no finding:** screenshot, trace, captured announcement text, or file:line.
- **Pages you don't own** (public demos, competitor teardowns): persistence (§2), undo-persistence (§3.3), save states (§7.5/§7.6) and canvas sizing are `N/A — not observable` unless the page visibly persists. N/A rows are listed in the report but excluded from the pass/fail denominator. Library versions are `UNVERIFIED` (read from the page bundle only if exposed).
- **Embedded demos (iframes/Storybook):** drive the iframe URL directly for interaction checks, but run viewport checks (§1.12, §4.4) on the host page — an iframe without its own viewport meta makes a 375 px test misleading.
- **Touch drag:** Playwright has no touch-move helper; use CDP `Input.dispatchTouchEvent` (touchStart → several touchMove → touchEnd) on a page created with `hasTouch: true`.
- **Live regions:** capture announcements by snapshotting `[aria-live]`/`role=status` text *after each action* (clear your buffer between actions); a MutationObserver alone re-reports stale text.
- **Reduced motion:** `page.emulateMedia({ reducedMotion: 'reduce' })`, then compare computed `transition`/`animation` on the moving elements.
- **Node Playwright from an ESM script:** `import { createRequire } from 'node:module'; const require = createRequire('<path-to-a-package.json-whose-node_modules-has-playwright>'); const { chromium } = require('playwright');` — `NODE_PATH` does not apply to ESM `import`.
