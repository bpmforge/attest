# Exemplar: Gap Report (coverage-loop REVISE)

> Copy the STRUCTURE, not the content. Domain here is a fictional community
> tool-lending library. Format notes: one row per gap; every gap names the
> exact missing item, where it should land, and the evidence it is missing —
> never "coverage incomplete". The REVISE block at the end is what gets sent
> back to the specialist verbatim.

# Gap Report — validate-erd-coverage.sh — iteration 1 of 3 — 2026-06-11

**Artifact under review:** docs/DATABASE.md (db-architect)
**Gate result:** FAIL — 3 gaps
**Source of truth:** docs/SRS.md data requirements DR-1..DR-9

## Gaps

| # | Missing item | Expected in | Evidence of absence |
|---|--------------|-------------|---------------------|
| 1 | DR-4 deposit forfeiture state transition | DATABASE.md deposits spec | `status` enum lists held/refunded only; SRS DR-4 requires forfeited after 60-day overdue |
| 2 | DR-8 tool condition history | DATABASE.md (new table or audit column) | grep "condition" shows current-state column only; SRS DR-8 requires change history with actor |
| 3 | Index rationale for members.email lookups | DATABASE.md members spec | UK constraint present but login-path lookup not mentioned in index section |

## Out of scope (not gaps)
- DR-7 waitlists — excluded by SCOPE.md §3, correctly noted in DATABASE.md Known issues.

## REVISE → db-architect
Address gaps 1–3 in docs/DATABASE.md only. Gap 1: add `forfeited` to the
deposits status enum and document the transition rule. Gap 2: add a
`tool_condition_log` table (tool_id, condition, changed_by, changed_at) or
justify an alternative. Gap 3: one sentence on whether the UK index serves the
login lookup or a separate index is needed. Do not restructure other sections.
Print the standard completion phrase when done.
