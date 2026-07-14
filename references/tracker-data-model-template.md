# Tracker Data Model Template (External Trackers)

Blank template for the **Tracker Data Model** design step (T29.6, M29 field
lesson H5/A-6). Copy this file to `docs/TRACKER_DATA_MODEL.md` and fill in
every section — **before generating any backlog into an external tracker**
(Jira, Linear, GitHub Projects, or anything that isn't this repo's own
`plan.json`; see `docs/TICKET_SCHEMA.md` for that internal system, which
this template does not replace or duplicate).

**Why this exists:** a live Mode-1 engagement generated ~200 requirement-
stories plus phase items directly in a client's issue tracker with no
deliberate model for how the layers relate. Phases and stories ended up as
**siblings** under one umbrella epic — nothing structurally tied a phase to
its stories — so "what % of Phase 4 is done?" had no native answer, 150+
links had to be retrofitted mid-project by a one-off script, labels silently
undercounted scope because they were unenforced, and template/sample tickets
polluted totals. This template forces those four decisions to be made
**once, deliberately, up front** — see
`issues/field-report-mode1-sdlc-run-2026-07.md` §A-6 for the full incident.

---

```markdown
# Tracker Data Model — <project name>

**Tracker:** <Jira | Linear | GitHub Projects | ...>
**Recorded:** <YYYY-MM-DD>
**Author:** <agent or person>

## Layer Map

What maps to epic / story / task / sub-task in **this** tracker, and why. If
phases aren't epics, say so and pick the linkage mechanism deliberately —
don't let it fall out of however the first few items happened to get filed.
Quote every type your snapshot will actually use in backticks (the
integrity validator extracts them from here to check items are typed
consistently) — e.g. `epic`, `phase`, `story`, `task`, `subtask`.

- `epic` = <what this represents in the project, e.g. "the whole engagement">
- `phase` = <e.g. "one per SDLC phase, Phase 0 .. Phase N">
- `story` = <e.g. "one per requirement-story in USER_STORIES.md">
- `task` = <e.g. "one per build/wave task under a story">

## Phase → Work Linkage

**Structural is strongly preferred over label-only** — this is what makes
"% done for Phase 4" a native, first-class query instead of eyeballing
labels or running an external script. Name the mechanism:

- If the tracker's native parent/child field (epic-link) is free: use it
  directly, phase item as parent.
- If the tracker's native parent field is **already spent** (e.g. every item
  is epic-linked to one project-level umbrella epic, so that field can't
  also carry phase→story): **choose an explicit second link type up front**
  (a custom link type, a "belongs to phase" relationship field, or — only as
  a last resort, and say so explicitly — a well-enforced label convention).
  Never retrofit this after 150 stories already exist without one.

Mechanism chosen: <structural link type name, or the explicit label
convention if structure genuinely isn't available>

## Source of Truth

Name the **single** field that is authoritative for scope (is this
in-scope/MVP?) and completion (is this done?). If it's labels, say so
explicitly — the generator MUST apply the label to every item, and the
integrity validator fails on any unlabeled item. If it's a structural
field (e.g. a "Status" field with a fixed workflow), name that field
instead — labels are then decorative, not load-bearing, and the validator's
unlabeled-item check does not apply.

Source of truth: <"labels: `scope:mvp`, `scope:post-mvp`" | "Status field:
Backlog/In Progress/Done" | ...>

## Stray & Template Handling

The backlog generator should not leave sample/template/scaffolding items in
the live project. If any are kept intentionally (e.g. to prove the board was
scaffolded correctly), tag them `stray: true` in every snapshot from the
start — never let them enter scope math untagged, even briefly.

Handling: <"deleted immediately after tracker setup" | "kept as
`<label-or-flag>`, excluded from all scope/completion math">
```

---

## After filling this in

1. Save as `docs/TRACKER_DATA_MODEL.md` — `validate-tracker-integrity.sh`
   requires this file to exist (with all four sections filled, no
   placeholders) **before** `docs/work/tracker-snapshot.json` exists at all;
   a snapshot with no recorded spec is the exact drift this template exists
   to prevent.
2. However your project pulls a normalized export of the live tracker
   (API script, CSV-to-JSON, ...), write it to
   `docs/work/tracker-snapshot.json` — see `docs/TRACKER_DATA_MODEL_SCHEMA.md`
   for the item shape the validator reads.
3. Keep the phase→story link **continuous**, not a one-time retrofit: link
   each new story to its phase at creation time, and re-run
   `scripts/tracker-link-sweep.mjs docs/work/tracker-snapshot.json --write`
   as a re-runnable straggler sweep (idempotent — a clean second run links
   0 stragglers).
4. Run `scripts/validators/validate-tracker-integrity.sh` any session, or
   let it ride the Phase 3 / Phase 4 gates automatically.
