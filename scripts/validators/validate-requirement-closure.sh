#!/usr/bin/env bash
#
# validate-requirement-closure.sh -- Phase 4->5 REQUIREMENT closure gate (T29.2,
# H1/A-6.3).
#
# Root cause this closes: task closure (every module ticket status "done")
# was silently standing in for requirement closure (every user story actually
# delivered) -- ModuleTicket had no requirement/story field at all, so
# story<->ticket linkage was structurally impossible and a plan could show
# 100% modules done while a real story was never claimed by anything. This
# validator computes requirement closure INDEPENDENTLY of task closure via
# two checks:
#   1. requirementClosure() (scripts/lib/tickets-graph.mjs): a story is
#      closed only when >=1 module references it (stories[]) AND every
#      referencing module is "done". An unmapped story fails this even when
#      every module in the plan is done -- the ticket's red-fixture scenario.
#   2. The mandatory reconciliation matrix (docs/work/REQUIREMENT_RECONCILIATION.md,
#      Template 11 in agents/shared/HANDOFF_TEMPLATES.md): a human/agent looks
#      at the actual code (not the ticket's self-reported status) and records
#      DONE/PARTIAL/OUTSTANDING per story. Required as Phase-5 input -- a
#      missing row or an OUTSTANDING verdict fails the gate; PARTIAL does not
#      (disclosed-partial is not the defect this closes; silently-unreconciled
#      is).
#
# Skips cleanly (nothing to check) when the stories[] layer isn't adopted at
# all -- this is an additive layer, same posture as validate-tickets.sh's own
# "no module tickets" skip.
#
# Usage: validate-requirement-closure.sh [project-root] [plan.json]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-requirement-closure"

ROOT="$(detect_project_root "${1:-}")"
# Resolved to an absolute path -- the inline `node -e` below imports from
# "$LIB_DIR/*.mjs" via a bare (non "./"-prefixed) specifier string built into
# the -e source; ESM resolution treats an unprefixed relative path as a bare
# package specifier and fails, so this must never be left relative (it is
# whenever this validator itself is invoked with a relative path, e.g. from
# validate-phase-gate.sh's chain or check-validator-fixtures.mjs).
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
LIB="$LIB_DIR/tickets.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate requirement closure"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "tickets.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi

# Same plan.json resolution order as validate-tickets.sh / validate-close-receipt.sh.
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

US="$ROOT/docs/USER_STORIES.md"
if [[ ! -f "$US" ]]; then
  note "no docs/USER_STORIES.md found -- requirement layer not in use, nothing to check"
  validator_exit; exit $?
fi

# Only engage when at least one module actually declares stories[] -- a plan
# that hasn't adopted the requirement layer yet has nothing for this gate to
# compute (backward compatible: adding docs/USER_STORIES.md alone does not
# retroactively fail every project's phase-5).
if ! grep -q '"stories"[[:space:]]*:' "$PLAN"; then
  note "no module in $PLAN declares stories[] -- requirement layer not adopted, nothing to check"
  validator_exit; exit $?
fi

rel="${PLAN#"$ROOT"/}"

# -- Check 1: requirementClosure() -- independent of task (module) closure ---
while IFS= read -r line; do
  case "$line" in
    *"[x]"*) gap "requirement-open" "${rel}: ${line#*\[x\] }" ;;
  esac
done < <(node "$LIB" requirement-status "$PLAN" "$US" 2>&1)

# -- Check 2: mandatory reconciliation matrix, required as Phase-5 input ----
MATRIX="$ROOT/docs/work/REQUIREMENT_RECONCILIATION.md"
if [[ ! -f "$MATRIX" ]]; then
  gap "reconciliation-missing" "docs/work/REQUIREMENT_RECONCILIATION.md not found -- Template 11's mandatory code<->requirement reconciliation HANDOFF has not run"
else
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    gap "reconciliation-gap" "$line"
  done < <(node --input-type=module -e '
    import { readFileSync } from "fs";
    import { extractStoryIds } from "'"$LIB_DIR"'/user-stories.mjs";
    import { reconciliationGaps } from "'"$LIB_DIR"'/reconciliation-matrix.mjs";
    const storyIds = extractStoryIds(readFileSync(process.argv[1], "utf8")).map((s) => s.id);
    const matrix = readFileSync(process.argv[2], "utf8");
    for (const g of reconciliationGaps(matrix, storyIds)) console.log(`story ${g.id}: ${g.reason}`);
  ' "$US" "$MATRIX" 2>&1)
fi

note "checked requirement closure for $rel against $(basename "$US")"
validator_exit
