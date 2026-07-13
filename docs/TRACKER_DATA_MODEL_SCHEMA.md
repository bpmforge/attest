# Tracker Data Model Schema (T29.6)

Canonical schema for the **normalized external-tracker snapshot** consumed
by `scripts/validators/validate-tracker-integrity.sh` /
`scripts/lib/tracker-model.mjs`. Distinct from `docs/TICKET_SCHEMA.md`'s
`ModuleTicket` (this repo's own `plan.json` ticket layer) — this schema
exists for the OPPOSITE case: a Mode-1 engagement whose backlog lives in a
client's real external tracker (Jira, Linear, GitHub Projects, ...), which
this repo has no live API client for and never will (every tracker's API is
different; a project supplies its own export).

Field-lesson grounding: `issues/field-report-mode1-sdlc-run-2026-07.md` §A-6
— see `references/tracker-data-model-template.md` for the design-step
template this schema pairs with.

## The two artifacts

| Artifact | Produced by | Consumed by |
|---|---|---|
| `docs/TRACKER_DATA_MODEL.md` | a project, filled from `references/tracker-data-model-template.md`, once, before backlog generation | `validate-tracker-integrity.sh` (spec-completeness + snapshot integrity) |
| `docs/work/tracker-snapshot.json` | a project's own export of its live external tracker (however it pulls one) | `validate-tracker-integrity.sh`, `scripts/tracker-link-sweep.mjs` |

Neither artifact existing is a gap by itself — a project not using an
external tracker at all has nothing to check here (see
`docs/TICKET_SCHEMA.md` for the internal `plan.json` path instead). A
snapshot existing with **no** spec doc **is** a gap — the whole point of
this design step is that the spec is recorded first.

## `tracker-snapshot.json` shape

```json
{
  "generatedAt": "2026-07-13T00:00:00Z",
  "sourceTracker": "jira",
  "items": [ <TrackerItem>, ... ]
}
```

`generatedAt` / `sourceTracker` are informational only — not read by the
validator today (freshness of a tracker snapshot is out of this ticket's
scope, unlike `docs/TICKET_SCHEMA.md`'s `STATUS.md` freshness check T29.3
built for the internal system).

### TrackerItem

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string, unique | yes | The tracker's own item key (e.g. `PROJ-142`) |
| `type` | string | recommended | Whatever vocabulary `docs/TRACKER_DATA_MODEL.md`'s Layer Map section declares (project-defined — `epic`/`phase`/`story`/`task`/`subtask` are examples, not a fixed enum). `type: "story"` is the one value the validator treats specially: every story must be linked (see below). |
| `title` | string | recommended | Human label — also what the stray-lookalike check scans (`example`/`sample`/`template`/`scaffold(ing)`/`TEMP`/`VOID`) |
| `parentId` | string \| null | no | The structural phase→work link `docs/TRACKER_DATA_MODEL.md`'s "Phase → Work Linkage" section names. Must reference another item's `id` in the same snapshot. |
| `labels` | string[] | no | Scope/completion labels, load-bearing only when the spec's "Source of Truth" section names labels as authoritative |
| `stray` | boolean | no | `true` marks a sample/template/scaffolding item as intentionally excluded from all scope math (§A-6.5). Default `false`/absent. |

## Integrity checks (`validateTrackerSnapshot`, `scripts/lib/tracker-model.mjs`)

Run for every non-stray item (a `stray: true` item is checked ONLY for the
first rule, then skipped — a stray item can't also be an unlabeled/unlinked
gap, that's what tagging it stray means):

1. **`stray-in-scope-math`** (error) — an item whose title looks like a
   template/sample/scaffolding item but is not tagged `stray: true`. Closes
   A-6.5: an untagged stray silently pollutes scope math.
2. **`unlabeled-item`** (error, only when the spec's Source of Truth names
   labels) — a non-stray item with zero labels. Closes A-6.4.
3. **`unlinked-story`** (error) — a `type: "story"` item with no `parentId`,
   or a `parentId` that doesn't resolve to any item in the snapshot
   (dangling link). Closes A-6.1/A-6.2.
4. **`undeclared-type`** (warning) — an item's `type` isn't one of the
   backtick-quoted tokens in the spec's Layer Map section. Advisory, not
   gate-blocking — a tracker's real type vocabulary can't be fully closed
   from a single markdown section's best-effort extraction.

## API (`scripts/lib/tracker-model.mjs`)

```
parseTrackerSpec(markdown)                    -> { complete, missing[], sections, sourceIsLabels, declaredTypes[] }
validateTrackerSnapshot(spec, snapshot)       -> { errors[], warnings[] }
```

CLI: `node scripts/lib/tracker-model.mjs validate <spec.md> [snapshot.json]`
· `... check-spec <spec.md>` (spec completeness only, no snapshot needed)

## Continuous linking (`scripts/tracker-link-sweep.mjs`)

The retrofit failure mode (A-6.2: 150+ links created by a one-off script,
after the fact) is closed by making linking **idempotent and re-runnable**
instead of a one-time rescue:

```
sweepLinks(items, labelPrefix = 'phase:')     -> { items[], linked: number }
```

Matches every unlinked `story` item carrying a `${labelPrefix}<phaseId>`
label to the phase item with that id and sets `parentId`. A story with no
matching label, or whose phase id doesn't resolve, is left untouched (still
surfaced by the validator's `unlinked-story` check — the sweep links what it
can, it does not manufacture a link). Running it twice in a row links 0
stragglers the second time — true idempotence.

CLI: `node scripts/tracker-link-sweep.mjs <snapshot.json> [--label-prefix
phase:] [--write]` (dry-run by default; `--write` rewrites the snapshot).
