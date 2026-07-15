#!/usr/bin/env bash
#
# validate-design-tokens.sh -- Figma-source ↔ tokens.json drift gate (offline).
#
# Active ONLY when a project pulled a Figma design snapshot
# (docs/design/figma-snapshot.json). A project authoring tokens.json from prose
# (no Figma) is skipped clean, so wiring this into the design-phase gate is safe
# for every project.
#
# Checks (via scripts/lib/design-tokens.mjs -- no live Figma):
#   - snapshot-without-tokens: a snapshot was pulled but tokens.json was never
#     derived ('figma.sh derive-tokens').
#   - dropped-token: a color the Figma snapshot provides is missing from
#     tokens.json -- a design token silently dropped on the way to code.
#   - value-drift (advisory [!]): a color present in both with a different value.
#
# Usage: validate-design-tokens.sh [project-root]
# Exit 0 clean/skipped / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-design-tokens"

ROOT="$(detect_project_root "${1:-}")"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/design-tokens.mjs"
SNAP="$ROOT/docs/design/figma-snapshot.json"
TOKENS="$ROOT/docs/design/tokens.json"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate design tokens"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "design-tokens.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi
if [[ ! -f "$SNAP" ]]; then
  note "no Figma snapshot (docs/design/figma-snapshot.json) -- tokens.json is authored, nothing to reconcile"
  validator_exit; exit $?
fi

while IFS= read -r line; do
  case "$line" in
    *"[x]"*)
      rest="${line#*\[x\] }"; cat="${rest%%$'\t'*}"; det="${rest#*$'\t'}"
      gap "$cat" "$det" ;;
    *"[!]"*)
      rest="${line#*\[!\] }"; det="${rest#*$'\t'}"
      note "drift: $det" ;;
  esac
done < <(node "$LIB" "$SNAP" "$TOKENS" 2>&1)

note "reconciled tokens.json against the Figma snapshot"
validator_exit
