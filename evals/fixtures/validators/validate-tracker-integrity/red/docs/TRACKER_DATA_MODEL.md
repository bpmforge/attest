# Tracker Data Model — Fixture Project (red)

**Tracker:** Jira
**Recorded:** 2026-07-13
**Author:** fixture

## Layer Map

- `epic` = the whole engagement, one umbrella epic
- `phase` = one per SDLC phase, Phase 0 .. Phase N
- `story` = one per requirement-story in USER_STORIES.md
- `task` = one per build/wave task under a story

## Phase → Work Linkage

Mechanism chosen: explicit "belongs to phase" relationship field
(`parentId` in the exported snapshot).

## Source of Truth

Source of truth: labels. The generator applies a `scope:mvp` or
`scope:post-mvp` label to every item; unlabeled items are a gap.

## Stray & Template Handling

Handling: sample/scaffolding items are tagged `stray: true` from the
start, excluded from all scope math.
