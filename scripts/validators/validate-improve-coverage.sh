#!/usr/bin/env bash
#
# validate-improve-coverage.sh -- scoped Ralph Wiggum inventory for /sdlc improve.
#
# Inventory = the audit reports produced by the Step 2 fan-out
# (docs/improve/*_AUDIT.md). Coverage = the Step 3 synthesis
# (docs/improve/IMPROVEMENT_BACKLOG.md) exists and references every audit —
# an audit that the backlog never mentions was silently dropped from synthesis.
#
# Used by run-coverage-loop.sh with the `improve` phase (2-iteration cap).

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

ROOT="$(detect_project_root "${1:-}")"
validator_init "improve-coverage"

IMPROVE_DIR="$ROOT/docs/improve"
BACKLOG="$IMPROVE_DIR/IMPROVEMENT_BACKLOG.md"

if [[ ! -d "$IMPROVE_DIR" ]] || ! ls "$IMPROVE_DIR"/*_AUDIT.md >/dev/null 2>&1; then
  gap "no-audits" "docs/improve/ has no *_AUDIT.md files — run the Step 2 audit fan-out first"
  validator_exit
fi

if ! file_exists_nonempty "$BACKLOG"; then
  gap "no-backlog" "docs/improve/IMPROVEMENT_BACKLOG.md missing or empty — run Step 3 synthesis"
  validator_exit
fi

TOTAL=0
for audit in "$IMPROVE_DIR"/*_AUDIT.md; do
  TOTAL=$((TOTAL + 1))
  name=$(basename "$audit")
  if ! file_exists_nonempty "$audit"; then
    gap "empty-audit" "$name exists but is empty — its audit HANDOFF did not complete"
    continue
  fi
  if grep -qF "$name" "$BACKLOG" 2>/dev/null; then
    pass "synthesized: $name"
  else
    gap "unsynthesized-audit" "$name: audit completed but IMPROVEMENT_BACKLOG.md never references it — findings silently dropped"
  fi
done

# Backlog hygiene: every backlog item needs a severity and a source
if ! grep -qE 'CRITICAL|HIGH|MEDIUM|LOW' "$BACKLOG"; then
  gap "no-severities" "IMPROVEMENT_BACKLOG.md has no severity ratings on items"
fi

note "improve inventory: $TOTAL audit report(s) checked against IMPROVEMENT_BACKLOG.md"
validator_exit
