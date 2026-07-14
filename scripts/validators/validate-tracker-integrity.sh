#!/usr/bin/env bash
#
# validate-tracker-integrity.sh -- External Tracker Data Model integrity
# (T29.6, M29 field lesson H5/A-6).
#
# Two things this validator enforces, both closing the field-report finding
# that a Mode-1 engagement's backlog drifted in a client's own issue tracker
# with no deliberate data model (issues/field-report-mode1-sdlc-run-2026-07.md
# A-6):
#
#   1. Spec-before-backlog: if a tracker snapshot exists (docs/work/
#      tracker-snapshot.json — a project's own normalized export of its live
#      external tracker's items) but docs/TRACKER_DATA_MODEL.md does not (or
#      is incomplete/placeholder), that is a hard gap. A backlog must never
#      be generated into an external tracker before the data model is
#      recorded (references/tracker-data-model-template.md).
#   2. Snapshot integrity (once both exist): every non-stray item has the
#      required scope labels (when the spec names labels as the source of
#      truth), every story-type item is structurally linked to its phase, no
#      template/sample/scaffolding item is silently counted in scope math
#      (looks-stray but untagged), and item types match the spec's declared
#      Layer Map (advisory).
#
# Neither artifact existing is NOT a gap -- a project that hasn't adopted an
# external tracker at all (e.g. builds entirely on this repo's own plan.json,
# see validate-tickets.sh) has nothing to check here.
#
# Usage: validate-tracker-integrity.sh [project-root] [spec.md] [snapshot.json]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-tracker-integrity"

ROOT="$(detect_project_root "${1:-}")"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/tracker-model.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate tracker data model"
  validator_exit
fi
if [[ ! -f "$LIB" ]]; then
  note "tracker-model.mjs helper not found at $LIB -- nothing to check"
  validator_exit
fi

SPEC="${2:-$ROOT/docs/TRACKER_DATA_MODEL.md}"
SNAPSHOT="${3:-$ROOT/docs/work/tracker-snapshot.json}"

SPEC_EXISTS=0; [[ -f "$SPEC" ]] && SPEC_EXISTS=1
SNAPSHOT_EXISTS=0; [[ -f "$SNAPSHOT" ]] && SNAPSHOT_EXISTS=1

if [[ "$SPEC_EXISTS" -eq 0 && "$SNAPSHOT_EXISTS" -eq 0 ]]; then
  note "no docs/TRACKER_DATA_MODEL.md and no docs/work/tracker-snapshot.json -- external tracker not in use, nothing to check"
  validator_exit
fi

if [[ "$SPEC_EXISTS" -eq 0 && "$SNAPSHOT_EXISTS" -eq 1 ]]; then
  gap "spec-missing-before-backlog" "a tracker snapshot exists (${SNAPSHOT#"$ROOT"/}) but docs/TRACKER_DATA_MODEL.md does not -- the Tracker Data Model spec must be recorded BEFORE any backlog is generated into an external tracker (references/tracker-data-model-template.md)"
  validator_exit
fi

# spec exists; run against the snapshot when there is one (validate-mode
# still catches an incomplete/placeholder spec with no snapshot arg at all).
NODE_ARGS=(validate "$SPEC")
[[ "$SNAPSHOT_EXISTS" -eq 1 ]] && NODE_ARGS+=("$SNAPSHOT")

while IFS= read -r line; do
  case "$line" in
    *"[x]"*) gap "tracker-integrity" "${line#*\[x\] }" ;;
    *"[!]"*) warn "${line#*\[\!\] }" ;;
  esac
done < <(node "$LIB" "${NODE_ARGS[@]}" 2>&1)

[[ "$GAP_COUNT" -eq 0 ]] && pass "tracker data model + snapshot clean (${SPEC#"$ROOT"/}$( [[ "$SNAPSHOT_EXISTS" -eq 1 ]] && echo ", ${SNAPSHOT#"$ROOT"/}" ))"

validator_exit
