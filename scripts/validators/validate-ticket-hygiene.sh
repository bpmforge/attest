#!/usr/bin/env bash
#
# validate-ticket-hygiene.sh -- ticket LIFECYCLE hygiene audit (T26.2).
#
# Root cause this closes: the 2026-07-07 incident where an executor worked
# tickets without claiming, commenting, or closing them and self-asserted
# "done" -- the audit trail was lost. Distinct from validate-tickets.sh
# (structural graph validity: schema shape, DAG, write-scope collisions --
# "is this plan.json shaped correctly"). This checks whether the lifecycle
# was actually FOLLOWED, via scripts/lib/ticket-hygiene.mjs:
#   - a 'done' module missing complete history/evidence/manifest
#   - one owner holding more than one open (claimed/in_progress) ticket
#   - a claim open (claimed/in_progress) for more than 7 days
#   - TICKETS.md/STATE.md's rendered status contradicting plan.json (drift)
#   - an evidence commit touching a file outside the ticket's write_scope,
#     or citing a commit that doesn't exist in this repo's history at all
#     (audit <-> code cross-check)
#
# Usage: validate-ticket-hygiene.sh [project-root] [plan.json] [tickets.md] [state.md]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-ticket-hygiene"

ROOT="$(detect_project_root "${1:-}")"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/ticket-hygiene.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate ticket hygiene"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "ticket-hygiene.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi

# Resolve the plan to check -- same fallback order as validate-tickets.sh /
# validate-close-receipt.sh, so all three ticket-layer validators agree on
# which plan.json a bare project-root argument means.
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

TICKETS_MD="${3:-$ROOT/docs/work/TICKETS.md}"
STATE_MD="${4:-$ROOT/docs/work/STATE.md}"
rel="${PLAN#"$ROOT"/}"

# ticket-hygiene.mjs prints "[x] <category>\t<detail>" per gap; only lines
# containing the "[x]" marker are trusted (same convention validate-tickets.sh
# uses for its own node helper), so stray stderr noise can't masquerade as a gap.
while IFS= read -r line; do
  case "$line" in
    *"[x]"*)
      rest="${line#*\[x\] }"
      cat="${rest%%$'\t'*}"
      det="${rest#*$'\t'}"
      gap "$cat" "${rel}: ${det}"
      ;;
  esac
done < <(node "$LIB" check "$PLAN" "$ROOT" "$TICKETS_MD" "$STATE_MD" 2>&1)

note "audited ticket lifecycle hygiene in $rel"
validator_exit
