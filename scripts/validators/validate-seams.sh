#!/usr/bin/env bash
#
# validate-seams.sh -- seam-record integrity for module boards (P-A10/T1-09,
# program law L8).
#
# Root cause this closes: task-decomposer.md's interface-contract rule --
# "exactly one interface-contract module per shared contract, and every lane
# module that needs it lists it in depends_on" -- was a manual checklist item;
# nothing in tickets.mjs enforced it, so a board could ship with two modules
# both authoring the same API doc, a consumer that never depended on the
# contract it builds against, or a seam whose interface-contract module was
# simply never emitted. plan.seams[] (per shared contract: {contract,
# producer_module, consumer_modules, wiring_evidence}) makes the rule
# machine-checkable; this validator wraps validateSeams()
# (scripts/lib/tickets-seams.mjs via the tickets.mjs barrel).
#
# Skips cleanly when there is no plan, no modules[] layer, or no seams[]
# declared -- the seam layer is additive, same posture as validate-tickets.sh's
# own "no module tickets" skip. Backward compatible by construction.
#
# Usage: validate-seams.sh [project-root] [plan.json]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-seams"

ROOT="$(detect_project_root "${1:-}")"
# Absolute -- the inline node -e below imports via a specifier string built
# into the -e source; a relative path would resolve as a bare package
# specifier and fail (same trap validate-requirement-closure.sh documents).
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
LIB="$LIB_DIR/tickets.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate seams"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "tickets.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi

# Same plan.json resolution order as validate-tickets.sh.
PLAN="${2:-}"
if [[ -z "$PLAN" ]]; then
  if [[ -f "$ROOT/docs/work/plan.json" ]]; then PLAN="$ROOT/docs/work/plan.json"
  elif [[ -f "$ROOT/examples/tickets-plan.sample.json" ]]; then PLAN="$ROOT/examples/tickets-plan.sample.json"
  fi
fi

if [[ -z "$PLAN" || ! -f "$PLAN" ]]; then
  note "no plan.json found (checked docs/work/plan.json, examples/) -- nothing to check"
  validator_exit; exit $?
fi

# Only engage once the plan declares a seams[] layer at all. A modules[]-only
# board predates (or never adopted) seam records -- adding this validator to
# the gate chain must not retroactively fail it.
HAS_SEAMS=$(node -e '
  const fs = require("fs");
  try {
    const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(p.seams !== undefined ? "yes" : "no");
  } catch { process.stdout.write("unreadable"); }
' "$PLAN" 2>/dev/null || echo unreadable)

if [[ "$HAS_SEAMS" == "unreadable" ]]; then
  gap "seam-invariant" "${PLAN#"$ROOT"/}: not readable as JSON -- a board that cannot be parsed cannot be verified"
  validator_exit; exit $?
fi
if [[ "$HAS_SEAMS" == "no" ]]; then
  note "plan $PLAN declares no seams[] -- seam layer not adopted, nothing to check"
  validator_exit; exit $?
fi

rel="${PLAN#"$ROOT"/}"

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  gap "seam-invariant" "${rel}: ${line}"
done < <(node --input-type=module -e '
  import { readFileSync } from "fs";
  import { validateSeams } from "'"$LIB_DIR"'/tickets-seams.mjs";
  const plan = JSON.parse(readFileSync(process.argv[1], "utf8"));
  for (const e of validateSeams(plan)) console.log(e);
' "$PLAN" 2>&1)

note "validated seam records in $rel"
validator_exit
