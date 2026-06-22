#!/usr/bin/env bash
#
# validate-loop-readiness.sh -- enforce the refuse-to-loop gate (G7).
#
# A Ralph-Wiggum / micro-loop can only converge on a row whose "done" is
# objectively decidable. This validator parses an inventory table and flags
# every row whose Artifact column names no checkable success criterion
# (a validator script, a test, a build/lint/smoke, a grep, a measurable
# target, or a concrete file). Subjective artifacts like "improve the UX"
# are gaps -- they must be made checkable or routed to a human, never looped.
#
# Usage:
#   validate-loop-readiness.sh [project-root] [--file <inventory.md>]
#
# Auto-detected inventory locations (first that exists):
#   docs/onboard/INVENTORY.md
#   docs/security/OWASP_INVENTORY.md
#   docs/sdlc/ARCHITECTURE_INVENTORY.md
#
# No inventory present -> clean (nothing to gate). Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-loop-readiness"

# -- args -------------------------------------------------------------------
INV_ARG=""
ROOT_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) INV_ARG="$2"; shift 2 ;;
    *) [[ -z "$ROOT_ARG" ]] && ROOT_ARG="$1"; shift ;;
  esac
done
ROOT="$(detect_project_root "$ROOT_ARG")"

# -- locate the inventory ---------------------------------------------------
INV=""
if [[ -n "$INV_ARG" ]]; then
  INV="$INV_ARG"
else
  for cand in \
    "$ROOT/docs/onboard/INVENTORY.md" \
    "$ROOT/docs/security/OWASP_INVENTORY.md" \
    "$ROOT/docs/sdlc/ARCHITECTURE_INVENTORY.md"; do
    [[ -f "$cand" ]] && { INV="$cand"; break; }
  done
fi

if [[ -z "$INV" || ! -f "$INV" ]]; then
  note "no inventory file found -- nothing to gate (loop-readiness is opt-in)"
  validator_exit
fi
note "inventory: ${INV#"$ROOT/"}"

# -- find the header + the Artifact column index ----------------------------
HEADER_LN=$(grep -niE '\|.*\bartifact\b.*\|' "$INV" | head -1 | cut -d: -f1 || true)
if [[ -z "$HEADER_LN" ]]; then
  gap "inventory-shape" "no table header with an 'Artifact' column found in ${INV#"$ROOT/"}"
  validator_exit
fi

ART_IDX=$(awk -F'|' -v ln="$HEADER_LN" 'NR==ln{for(i=1;i<=NF;i++){g=$i;gsub(/^[ \t]+|[ \t]+$/,"",g);if(tolower(g)=="artifact"){print i;exit}}}' "$INV")
[[ -z "$ART_IDX" ]] && { gap "inventory-shape" "could not locate the Artifact column index"; validator_exit; }

# -- a row's Artifact is "checkable" if it names a concrete, decidable proof -
CHECKABLE_RE='\.sh|\.mjs|validate-|\.md|\.ya?ml|\.json|openapi|\btest|\bsmoke|\bbuild|\blint|\bgrep|\bcoverage|\bvalidator|\bexist|\bpass|\bdiagram|\bentry[ -]?point|\bschema|\bsnapshot|\bp95|\bp99|[0-9][ ]*ms|lighthouse|wcag|[0-9]+%|≥|≤|<[ ]*[0-9]|>[ ]*[0-9]'

# Extract "ID<TAB>ARTIFACT" for every data row (skip the |---| separator).
ROWS_FILE=$(mktemp -t "loopready.XXXXXX")
trap 'rm -f "$ROWS_FILE"' EXIT
awk -F'|' -v ln="$HEADER_LN" -v idx="$ART_IDX" '
  NR>ln && $0 ~ /^[[:space:]]*\|/ {
    sep=1; for(i=2;i<NF;i++){c=$i; gsub(/[ \t:-]/,"",c); if(c!=""){sep=0; break}}
    if(sep) next;
    id=$2;    gsub(/^[ \t]+|[ \t]+$/,"",id);
    art=$idx; gsub(/^[ \t]+|[ \t]+$/,"",art);
    print id "\t" art;
  }' "$INV" > "$ROWS_FILE"

ROW_TOTAL=0
while IFS=$'\t' read -r id art; do
  [[ -z "$id" && -z "$art" ]] && continue
  ROW_TOTAL=$((ROW_TOTAL + 1))
  if [[ -z "$art" ]]; then
    gap "no-criterion" "row ${id:-?} has an empty Artifact -- no checkable success"
  elif echo "$art" | grep -qiE "$CHECKABLE_RE"; then
    pass "row ${id}: checkable"
  else
    gap "no-criterion" "row ${id} Artifact is not objectively checkable: \"${art}\" -- make it a validator/test/measurable target, or route to a human"
  fi
done < "$ROWS_FILE"

note "checked ${ROW_TOTAL} inventory row(s)"
validator_exit
