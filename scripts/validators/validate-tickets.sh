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
if ! grep -q '"kind"[[:space:]]*:[[:space:]]*"module"' "$PLAN"; then
  note "plan $PLAN has no module tickets -- nothing to check"
  validator_exit; exit $?
fi

rel="${PLAN#"$ROOT"/}"
# tickets.mjs prints "  [x] <reason>" per problem and exits non-zero on any.
while IFS= read -r line; do
  case "$line" in
    *"[x]"*) gap "ticket-invariant" "${rel}: ${line#*\[x\] }" ;;
  esac
done < <(node "$LIB" validate "$PLAN" 2>&1)

note "validated ticket graph in $rel"
validator_exit
