# Exemplar: Completion Manifest

> Copy the STRUCTURE, not the content. Domain here is a fictional community
> tool-lending library. The four section headings are validator-enforced
> (`validate-completion-manifest.sh`): Files produced, Decisions made,
> Known issues / deferred, Verify result — plus the exact completion phrase.

# Completion Manifest — db-architect — 2026-06-11

## Files produced
| Path | Content | Lines |
|------|---------|-------|
| docs/DATABASE.md | ERD (5 entities), table specs for loans/deposits, index rationale, migration plan | 214 |
| docs/reviews/MANIFEST_database_2026-06-11.md | this manifest | 38 |

## Decisions made
- Partial unique index over app-layer lock for "one open loan per tool" — DB enforces the invariant even if a second code path inserts loans. Considered advisory locks; rejected as connection-pool-fragile.
- `amount_cents integer` over `numeric` for deposits — no fractional cents exist in this domain; integer math avoids float-comparison bugs in refund logic.

## Known issues / deferred
- Soft-delete strategy for members is unresolved — GDPR erasure vs loan-history audit conflict. Needs a decision from security-auditor; flagged in docs/DATABASE.md §7.
- No read-replica plan; revisit if reporting queries land (sre-engineer).

## Verify result
- Ran `npx prisma validate` against the proposed schema — clean.
- Checked every SRS data requirement (DR-1..DR-9) appears in a table spec — DR-7 (waitlists) intentionally out of scope per SCOPE.md, noted in Known issues of DATABASE.md.

Tracker updated: docs/sdlc/SDLC_TRACKER.md — Phase 3 DATABASE row → ✅ DONE (9/10)

db-architect done -- DATABASE.md with 5-entity ERD, loan invariants DB-enforced, 2 deferred items flagged
