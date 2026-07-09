#!/usr/bin/env bash
#
# validate-close-receipt.sh -- a ticket module in `in_review`/`done` must have
# the close() receipt pasted verbatim into its Completion Manifest (T26.3).
#
# Root cause this closes: before T26.1, a ticket's completion was a
# self-asserted string ("<id> done -- ...") with no gate ever checking it was
# real. T26.1 fixed the STATUS side (close()'s own verify-gate re-run,
# manifest-must-exist check). This closes the COMPLETION-SIGNAL side: even
# with a real close() call behind it, nothing previously forced the
# resulting receipt to actually land anywhere durable -- an executor could
# run close(), see the receipt print to their terminal, and then still just
# write "<id> done -- ..." in the manifest without ever pasting the receipt.
# accept() (scripts/lib/tickets-lifecycle.mjs) now refuses in_review -> done
# without it; this validator is the same check exposed for the gate sweep /
# a standalone fixture-provable acceptance test, via `tickets.mjs
# check-receipt` (single source of truth: manifestHasCloseReceipt()).
#
# Deliberately NOT chained into validate-phase-gate.sh's GATE_VALIDATORS --
# the module-ticket layer (plan.json's modules[]) is an orthogonal axis to
# the 5-phase SDLC doc pipeline that GATE_VALIDATORS gates, and accept()
# itself is the load-bearing enforcement point (this script cannot be
# bypassed the way a phase-gate validator that's merely "run before merge"
# can -- accept() runs it every time, in-process). Kept as a standalone
# script (with red/green fixtures, T26.3's planted acceptance test) so the
# gate sweep and CI can still assert the rejection actually fires.
#
# Only checks modules already in_review or done -- a module still
# claimed/in_progress/ready/blocked has no receipt to check yet; that's not
# a gap, there is simply nothing to verify.
#
# Usage: validate-close-receipt.sh [project-root] [plan.json]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-close-receipt"

ROOT="$(detect_project_root "${1:-}")"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/tickets.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate close receipts"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "tickets.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi

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

if ! grep -q '"kind"[[:space:]]*:[[:space:]]*"module"' "$PLAN"; then
  note "plan $PLAN has no module tickets -- nothing to check"
  validator_exit; exit $?
fi

rel="${PLAN#"$ROOT"/}"

# One id per line, only modules whose status is in_review or done -- those
# are the only ones that should already have a close receipt to check.
ids="$(node -e '
  const fs = require("fs");
  const plan = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const m of (plan.modules || [])) {
    if (m.status === "in_review" || m.status === "done") console.log(m.id);
  }
' "$PLAN" 2>/dev/null || true)"

if [[ -z "$ids" ]]; then
  note "no in_review/done module tickets in $rel -- nothing to check"
  validator_exit; exit $?
fi

checked=0
while IFS= read -r id; do
  [[ -z "$id" ]] && continue
  checked=$((checked + 1))
  if out="$(node "$LIB" check-receipt "$PLAN" "$id" 2>&1)"; then
    pass "$id: close receipt verified in its Completion Manifest"
  else
    gap "close-receipt" "${rel}: ${id}: ${out#*\[x\] }"
  fi
done <<< "$ids"

note "checked ${checked} in_review/done ticket(s) in $rel for a pasted close receipt"
validator_exit
