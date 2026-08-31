---
description: 'House conventions for scripts/validators/*.sh — _lib.sh lifecycle, exit codes, fixtures'
globs:
  - "scripts/validators/**/*.sh"
alwaysApply: false
---

# Validator house style

When creating or editing a validator under `scripts/validators/`:

- Source `_lib.sh` and follow its contract: `validator_init "<name>"` at the
  top, `gap "<category>" "<detail>"` per gap, `validator_exit` at the end.
- Exit codes are fixed: **0** clean, **1** gaps found, **2** validator error.
  Never invent other codes; orchestrators (`validate-phase-gate.sh`,
  `run-coverage-loop.sh`) branch on exactly these.
- Stay bash 3.2 compatible (macOS default): no associative arrays, no
  `readarray`, no `<<<` here-strings.
- A validator chained into `validate-phase-gate.sh` MUST ship a red fixture
  under `evals/fixtures/validators/<name>/red/` proving it can actually fail
  (`node scripts/check-validator-fixtures.mjs` enforces this — never add to
  the grandfather list).
- Self-skip cleanly (a `note`, not a `gap`) when the target project does not
  use the feature the validator checks.
