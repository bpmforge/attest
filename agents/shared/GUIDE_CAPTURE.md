---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Guide Capture Protocol

Load when you produce or execute a `docs/guide/` capture — `app-cartographer` (element-discovery clicks), `guide-scribe` (the capture engine, every step it captures), and `manual-writer` (checking a figure is gate-clean before citing it). Sibling to `agents/shared/BROWSER_TESTING.md`: that doc is the general playwright-mcp surface; this doc is the guide-specific discipline layered on top of it — pinned capture conditions, a replayable spec, three quality gates, and the error-vs-bug triage that keeps a broken screenshot or a rendering bug from silently becoming "documentation."

**Why this exists:** a field run (Gemini 3.1 Pro, 2026-07-06) shipped ~10 arbitrary screenshots as a "done" user guide, including blank pages and pages showing runtime errors, with no exhaustive-state discipline and no error-vs-bug reasoning. See `docs/research/USER_GUIDE_EXPERT_DESIGN.md` (bpm-agent-amplifier) for the full failure-mode traceability. Nothing in this protocol is a suggestion — a gate-failed image is never captured-and-shipped, and `validate-guide-coverage.sh` (T21.4) enforces it at the repo level.

---

## 1. The replayable step spec

Every capture happens inside a **spec**, never as an ad hoc screenshot. A spec is a JSON file at `docs/guide/specs/<task>.json` — one per STORIES.md story or per APP_MAP reference pane — that is itself the source of truth for regeneration: replaying the spec re-derives the guide's figures, so the manual can never silently rot (Doc Detective's docs-as-tests model). `--refresh` mode (T21.3) replays specs and pixel-diffs against committed baselines instead of re-deriving them from prose.

### Schema

```json
{
  "task": "create-price-alert",
  "sourceStory": "STORIES.md#create-a-price-alert",
  "env": "GUIDE_ENV",
  "steps": [
    {
      "n": 1,
      "action": "goTo",
      "target": { "url": "https://app.example.com/alerts" },
      "caption": "Open the Alerts page",
      "capture": {
        "file": "docs/guide/screenshots/create-price-alert/step-01.png",
        "annotated": null,
        "viewport": { "width": 1280, "height": 800, "deviceScaleFactor": 2 },
        "gates": { "A": "PASS", "B": "PASS", "C": "PASS", "attempts": 1 }
      }
    },
    {
      "n": 2,
      "action": "click",
      "target": { "elementId": "E-alerts-list-3", "role": "button", "name": "New Alert" },
      "value": null,
      "caption": "Click **New Alert**",
      "capture": {
        "file": "docs/guide/screenshots/create-price-alert/step-02.png",
        "annotated": "docs/guide/screenshots/create-price-alert/step-02-annotated.png",
        "boundingBox": { "x": 120, "y": 240, "w": 96, "h": 32 },
        "viewport": { "width": 1280, "height": 800, "deviceScaleFactor": 2 },
        "gates": { "A": "PASS", "B": "PASS", "C": "PASS", "attempts": 1 }
      }
    },
    {
      "n": 3,
      "action": "fill",
      "target": { "elementId": "E-alert-form-1", "role": "textbox", "name": "Symbol" },
      "value": "AAPL",
      "caption": "Fill **Symbol** with \"AAPL\"",
      "capture": { "file": "docs/guide/screenshots/create-price-alert/step-03.png", "gates": { "A": "PASS", "B": "PASS", "C": "PASS", "attempts": 1 } }
    }
  ]
}
```

- **`action`**: `goTo` | `click` | `fill` | `select` | `find` | `screenshot` | `wait`. One action per step — a step that both fills and clicks two fields is two steps.
- **`target`**: prefer `elementId` (the `E-<state>-<n>` from `docs/guide/APP_MAP.md`) so a spec traces back to the cartographer's inventory; `role`/`name` accompany it for readability and as the accessible-name source for `caption`.
- **`value`**: the exact fill/select value entered — this is what makes a step replayable and what `validate-guide-coverage.sh` checks a story's steps actually name.
- **`caption`**: derived from the target's accessible name, never invented — see §2.
- **`capture.gates`**: the gate manifest for this step (§3); a step spec with no `gates` block for a step whose `capture.file` exists on disk is invalid — captures aren't linkable back to the doc that reasons about them otherwise.
- **`boundingBox`**: recorded by whoever executes the step (guide-scribe); the actual pixel compositing of a highlight box + numbered badge onto a copy is `skills/user-guide/scripts/annotate.mjs` (T21.2) — this protocol defines the contract that script implements, not the script itself.

---

## 2. Capture hygiene (every capture, no exceptions)

- **Pinned viewport**: 1280×800, `deviceScaleFactor: 2`. Never capture at whatever size the browser happened to open.
- **Animations disabled**: use the driver's animation-disable option (Playwright: `animations: 'disabled'`); never rely on a CSS override alone.
- **Fonts awaited**: wait for web fonts to finish loading before capturing — a mid-swap capture looks broken and can false-trip Gate A.
- **Mask dynamic data**: timestamps, avatars, live counters, or anything that changes between runs get masked (selector list) or the demo data is seeded deterministically (see §6 `GUIDE_ENV`) — a diff-breaking capture isn't a hygiene problem to fix later, it's a setup problem to fix now.
- **Wait for the result content to be visible — never `networkidle`.** Spinner-gone alone is insufficient; wait for the specific expected-result selector named in the step (the thing the caption describes as now true), not a generic network-quiet heuristic. This is Gate C's precondition, not a separate step — see §3.
- **Element-or-clipped shots per step; full-page only for chapter openers.** A step screenshot shows the interaction target and enough surrounding context to orient the reader — not the whole page by default.

---

## 3. Quality gates (deterministic, no exceptions)

Gate outcomes are machine facts, not model opinions — every gate below is a script's job (`skills/user-guide/scripts/img-gate.mjs`, T21.2), not a judgment call by the capturing agent. This protocol defines what each gate checks and the retry policy; the script is the enforcement.

### Gate A — blank / near-blank
Per-channel pixel stddev, dominant-color ratio against a per-app baseline (calibrated once on a human-confirmed good screenshot, stored next to `APP_MAP.md`), a PNG file-size floor, and content-region entropy below the header band. Some valid apps are legitimately mostly-white — the baseline calibration exists precisely so Gate A doesn't false-positive a sparse-but-real UI.

### Gate B — error state
Trips on any of: console `error`/`pageerror` events during the step, any 4xx/5xx document or XHR response, a navigation status ≥400, `role=alert` content, or visible text matching `/error|exception|went wrong|not found|forbidden/i` — checked against a per-route whitelist so a page whose actual feature is showing error logs doesn't false-positive.

### Gate C — premature capture
Trips unless: loader/skeleton selectors (`[aria-busy=true]`, `[class*=spinner|skeleton]`) are absent, the expected-result element from the step is visible, AND a two-shot stability check passes (capture, wait ~800ms, capture again, pixel-diff under threshold — a large diff means the page was still settling).

### Retry → BLOCKED policy
1. Gate fails → retry with backoff, max 3 attempts.
2. Still failing after 3 → the step is **BLOCKED in the coverage ledger with the gate evidence attached** (which gate, what it measured, the attempt count). Never captured-and-shipped, never silently dropped.
3. A guide (T21.4's `validate-guide-coverage.sh`) cannot pass if it cites a figure whose gate manifest shows anything other than all-PASS.

---

## 4. Error-vs-bug triage (when Gate B trips)

| Signal | Classification | Action |
|---|---|---|
| 5xx / uncaught exception / blank Gate-A fail / console error on ordinary navigation (not a deliberate bad input) | **BUG (app defect)** | Row in `docs/guide/BUG_LOG.md` (route, repro steps taken straight from the spec, evidence screenshot saved to `docs/guide/screenshots/bugs/`); the state is marked `BLOCKED:bug` in the coverage ledger; **excluded from the manual entirely**; handoff → ui-verifier (confirm) + coding-agent (ticket) |
| Designed validation/error message reached via a deliberate wrong input (styled, `role=alert`, form-level) | **DOCUMENTED ERROR STATE** | Captured deliberately and written into the Troubleshooting chapter (symptom → cause → fix) — this is free, real troubleshooting content, not noise |
| Ambiguous (error text present but the page is otherwise functional) | **SUSPECT** | Document it in the manual, but also add a `⚠ suspect` row to `BUG_LOG.md` for human triage — never resolve ambiguity silently in either direction |

Triage happens before the step is allowed to proceed to the next one — a Gate-B trip is not "capture and figure it out later."

---

## 5. Naming conventions

| Artifact | Path |
|---|---|
| Step spec | `docs/guide/specs/<task>.json` |
| Clean screenshot | `docs/guide/screenshots/<task>/step-NN.png` |
| Annotated screenshot | `docs/guide/screenshots/<task>/step-NN-annotated.png` (composited onto a copy — the clean original is always kept for re-annotation) |
| Bug evidence | `docs/guide/screenshots/bugs/<route-slug>-<n>.png` |
| Bug ledger | `docs/guide/BUG_LOG.md` |

`step-NN` is zero-padded, 1-indexed, matching the spec's `n` field exactly — a renumbered step without a matching spec edit is a broken cross-reference.

---

## 6. `GUIDE_ENV` convention

A guide run against a real app needs a base URL, credentials (if auth-gated), and deterministic seed data (so masked/dynamic content stays stable across runs). Define these once per app, not per agent invocation:

```
GUIDE_ENV = {
  baseUrl:    string   // e.g. "https://staging.app.example.com"
  credsPath:  string   // path to a LOCAL, gitignored creds file — never commit secrets,
                        // never inline a password in a spec, HANDOFF, or ledger row
  seedScript: string   // command that resets/seeds deterministic demo data before a capture run
                        // (same data every run ⇒ captures are diffable and dynamic fields are maskable, §2)
}
```

Any HANDOFF into `app-cartographer` or `guide-scribe` for an auth-gated app names `GUIDE_ENV` in its CONTEXT — a run with a missing or unreachable `baseUrl` is `BLOCKED`, not worked around with invented credentials.

---

## 7. Destructive-edge firewall (shared convention, enforced by app-cartographer)

Any action that opens a confirm dialog, fires a mutating request (POST/DELETE/PUT to a non-allowlisted endpoint), or matches a mutation verb (delete, remove, cancel, pay, logout, and similar) is **default-deny**: skipped unless explicitly allowlisted. `app-cartographer` owns firewalling these at discovery time; `guide-scribe` never attempts a step APP_MAP/STORIES already marked SKIPPED for this reason — see `agents/app-cartographer.md` Hard rule 3.

---

## 8. Deterministic tooling (forward reference — T21.2, not this protocol)

`skills/user-guide/scripts/img-gate.mjs` (Gate A + the Gate C two-shot diff; deps `sharp`, `pixelmatch`) and `annotate.mjs` (composites one rounded highlight box + a numbered badge onto a copy at the recorded bounding box, dep `sharp`) implement §3's gates and the annotation half of §1's spec. This document is their contract; it does not itself ship the scripts.
