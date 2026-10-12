# Interaction Patterns — contracts, gates, and audit rubric

**Verified:** 2026-10-12. Standards cited: WCAG 2.2 (2.1.1 Keyboard, 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 2.3.3 Animation from Interactions, 4.1.3 Status Messages), WAI-ARIA APG.
**Readers:** interaction-engineer (all modes), ux-engineer `--review`, a11y-compliance.

An interaction is not done when it works with a mouse. It is done when it has a keyboard path, an announced outcome, a cancel path, a persisted result, and a reduced-motion variant. Each pattern below lists its **gates** — the checkable lines that `interaction-engineer` writes into `docs/design/INTERACTIONS.md` and verifies in the browser.

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

Two layers needed? Keep the **visual component separate from its interactive wrapper** (`MetricCard` vs `SortableWidget(MetricCard)`) so the same widget renders in a static page, a Puck block, and a generated-UI catalog.

## 1. Drag and drop / sortable

**Gates (every one must be true):**
- [ ] **Keyboard path exists** for every drag — focus the handle, Space/Enter to pick up, arrows to move, Space/Enter to drop, Escape to cancel (WCAG 2.1.1). dnd-kit ships a keyboard sensor; it must be enabled, not just installed.
- [ ] **Single-pointer alternative** exists — a "Move to…" menu or up/down buttons (WCAG 2.5.7 Dragging Movements). Keyboard support alone does not satisfy 2.5.7.
- [ ] **Live-region announcements** for pick-up, move-over, drop, cancel (WCAG 4.1.3), with item names, not IDs.
- [ ] **Visible drag preview / overlay** and **visible valid drop targets** while dragging; invalid targets look invalid.
- [ ] **Click vs drag disambiguated** — activation distance or delay so a click on a card does not start a drag, and a drag does not fire the card's click.
- [ ] **Escape restores the exact prior order**; a failed save rolls back optimistic state and says so.
- [ ] **Touch works** — pointer sensor with a touch-friendly activation constraint; scrolling a list on mobile does not grab items.
- [ ] **Handle target ≥ 24×24 CSS px** (WCAG 2.5.8).
- [ ] **Auto-scroll** near container edges for long lists.

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

**Gates:**
- [ ] Stable widget IDs (never array index) — reorder must not remount/lose widget state.
- [ ] Schema-validated on load (zod/valibot/JSON Schema); invalid or unknown `type` → fallback widget + logged error, not a crash.
- [ ] `version` field present and a migration path for N-1.
- [ ] **Round-trip test:** serialize → load → serialize is byte-identical.
- [ ] Concurrent edits (two tabs / agent + user) resolve by a stated rule (last-write-wins with notice, or version check and refuse).
- [ ] "Reset to default layout" exists.

## 3. Undo / redo

- [ ] Every destructive or layout-changing action is undoable, or confirmed *before* it happens — never both silent and irreversible.
- [ ] Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (Ctrl+Y on Windows) wired, and *not* hijacked inside text inputs.
- [ ] Undo of a persisted change re-persists (undo is a new write, not a local-only revert).
- [ ] Toast-style undo ("Card deleted · Undo") stays ≥ 5 s and is reachable by keyboard.

## 4. Resizable panels and collapsible regions

- [ ] Separator is focusable with `role="separator"`, `aria-valuenow/min/max`, arrow-key resize.
- [ ] Min/max sizes stated; a collapsed panel has a visible way back.
- [ ] Sizes persist per user (same rules as §2).
- [ ] Narrow viewports: panels stack or become sheets — never a 120 px-wide unusable column.

## 5. Command palette and keyboard shortcuts

- [ ] Opens with Cmd/Ctrl+K (or the project's documented key), traps focus, Escape closes and returns focus to the trigger.
- [ ] Every palette action is also reachable without the palette (discoverability).
- [ ] Shortcuts listed in a help surface (`?`) and never shadow browser/screen-reader keys; single-key shortcuts can be turned off or remapped (WCAG 2.1.4).

## 6. Motion tied to interaction

Motion durations/easings come from `docs/design/tokens.json` `motion` — frontend-design owns the aesthetic, this file owns *when motion is functionally required*.

- [ ] Motion explains a state change (where did the card go, what opened) — decorative-only motion is optional and removable.
- [ ] `prefers-reduced-motion: reduce` → transforms/parallax replaced by opacity or instant change (WCAG 2.3.3). Verify with Playwright `page.emulateMedia({ reducedMotion: 'reduce' })`.
- [ ] Layout animation does not shift focus or cause reflow under the pointer mid-drag.
- [ ] Only `transform`/`opacity` animated on hot paths; no animation blocks input.

## 7. Async states every interactive surface needs

| State | Required behavior |
|---|---|
| Loading | Skeleton matching final layout (no layout shift), or progress with a label |
| Empty | Explains why and offers the next action |
| Error | Says what failed, keeps user input, offers retry |
| Partial / stale | Marks stale data; does not silently show old numbers as current |
| Saving / saved / save-failed | Visible and announced (WCAG 4.1.3) |
| Offline / conflict | Stated rule from §2 |

## 8. Canvas / node editors (React Flow, tldraw)

- [ ] Keyboard: Tab through nodes, arrows to nudge, Delete to remove (with undo), Escape to deselect.
- [ ] Pan/zoom controls exist as buttons, not only gestures; "fit view" exists.
- [ ] Large graphs (≥ 500 nodes) measured — virtualization/`onlyRenderVisibleElements` decision recorded with a frame-time number.
- [ ] Graph state is serializable JSON (same rules as §2).

## Audit severity (for `--audit` findings)

| Severity | Meaning | Examples |
|---|---|---|
| P0 | Task impossible for some users / data loss | Drag-only reorder with no keyboard or button path; failed save silently discards layout |
| P1 | Task possible but broken or misleading | Click starts a drag; Escape doesn't restore order; no reduced-motion variant on large transforms |
| P2 | Friction | No auto-scroll; tiny handles; no undo toast |
| P3 | Polish | Drop animation snaps instead of settling |

Every finding cites: the screen, the element, the gate number from this file (e.g. `§1.2`), and evidence (screenshot path, Playwright trace, or file:line).
