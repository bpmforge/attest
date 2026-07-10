# Proof Ledger

The standing answer to "do we have proof for QA testing": one row per guardrail, its red
fixture/test path, and the date it was last proven to actually fire. Convention from
`docs/research/DENOMINATOR_INTEGRITY_AUDIT.md` (bpm-agent-amplifier) — every control here
demonstrably catches the defect it exists to catch, not just "looks correct on read."

This file is seeded, not comprehensive: it carries a row per guardrail as each one is proven
under this convention, not a backfilled row for every pre-existing validator. Add a row here
when a ticket plants a red fixture proving a new gate actually fires.

| Guardrail | Red fixture / test | Last proven |
|---|---|---|
| `validate-ticket-hygiene.sh` — ticket lifecycle hygiene (incomplete-evidence, wip-violation, stale-claim, tracker-drift, scope-violation, evidence-commit-not-found) | `evals/fixtures/validators/validate-ticket-hygiene/{red,green}` + `scripts/test-ticket-hygiene.ts` (Pass 25) | 2026-07-10 |
