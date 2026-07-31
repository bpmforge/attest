#!/usr/bin/env bash
#
# validate-tickets.sh -- module-contract ticket graph integrity (T6).
#
# Wraps scripts/lib/tickets.mjs to fail on the invariants that would break
# parallel, collision-free module ownership:
#   - malformed module tickets (missing id/title/write_scope/acceptance/status)
#   - depends_on referencing a non-module / cyclic module DAG
#   - module.nodes referencing non-existent plan.json nodes
#   - overlapping write-scopes among active modules (two contributors clobbering)
#
# Targets, in order: an explicit path arg, else docs/work/plan.json, else the
# reference sample examples/tickets-plan.sample.json (so the framework repo's own
# CI still exercises the checker). No plan.json anywhere -> nothing to check.
#
# Usage: validate-tickets.sh [project-root] [plan.json]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-tickets"

ROOT="$(detect_project_root "${1:-}")"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/tickets.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate tickets"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "tickets.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi

# Resolve the plan to check.
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

# Only check plans that actually carry a modules[] layer.
#
# GROUND TRUTH IS `modules[]`, NOT the `kind` string. This grepped for
# `"kind": "module"` and skipped the whole check when it found none -- so a
# board whose entries are MISSING `kind` (itself a schema violation, and the
# single most common one an agent produces) registered as "no module tickets"
# and passed clean. The malformation hid the tickets from the validator whose
# job is to catch that malformation, and run-until-done.sh's completion gate
# consequently green-lit a board the conductor cannot execute. Observed
# 2026-07-31: a 4-module board, 16 real schema errors, "nothing to check".
#
# So: a non-empty `modules[]` means this plan HAS module tickets, whatever
# shape they are in. Only a plan with no modules layer at all is out of scope.
# (jq is not assumed -- node is already a hard dependency of tickets.mjs,
# which this script shells to below.)
HAS_MODULES=$(node -e '
  const fs = require("fs");
  try {
    const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(Array.isArray(p.modules) && p.modules.length ? "yes" : "no");
  } catch { process.stdout.write("unreadable"); }
' "$PLAN" 2>/dev/null || echo unreadable)

if [[ "$HAS_MODULES" == "unreadable" ]]; then
  gap "ticket-invariant" "${PLAN#"$ROOT"/}: not readable as JSON -- a board that cannot be parsed cannot be verified"
  validator_exit; exit $?
fi
if [[ "$HAS_MODULES" == "no" ]]; then
  note "plan $PLAN has no modules[] layer -- nothing to check"
  validator_exit; exit $?
fi

rel="${PLAN#"$ROOT"/}"

# T29.2: story-coverage check (a story in USER_STORIES.md mapped to no
# module) rides the same `validate` invocation -- passed as an optional 3rd
# arg. Empty string when the doc doesn't exist: tickets.mjs's CLI treats a
# falsy 3rd arg as "story layer not in use here", so this never gates a
# project that hasn't adopted docs/USER_STORIES.md + stories[]. Advisory
# ([!]) by default; STORY_COVERAGE_STRICT=1 (set by the caller's environment,
# not this script) promotes it to [x] via tickets.mjs itself -- see
# docs/TICKET_SCHEMA.md's "Requirement (story) coverage & closure".
US_DOC=""
[[ -f "$ROOT/docs/USER_STORIES.md" ]] && US_DOC="$ROOT/docs/USER_STORIES.md"

# tickets.mjs prints "  [x] <reason>" per problem and "  [!] <reason>" per
# advisory warning, exits non-zero on any [x].
while IFS= read -r line; do
  case "$line" in
    *"[x]"*) gap "ticket-invariant" "${rel}: ${line#*\[x\] }" ;;
    *"[!]"*) warn "${rel}: ${line#*\[\!\] }" ;;
  esac
done < <(node "$LIB" validate "$PLAN" "$US_DOC" 2>&1)

note "validated ticket graph in $rel"
validator_exit
