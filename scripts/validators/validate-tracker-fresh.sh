#!/usr/bin/env bash
#
# validate-tracker-fresh.sh -- tracking-as-gate (G-D).
#
# "Things get lost as we work through the steps." The fix: a step cannot finish
# with real work changed but NO tracker updated. This gate compares the git
# working tree against a known set of tracker files — if work files changed but
# none of the trackers did, the work is at risk of being lost between steps /
# sessions, so it FAILS until the tracker records it.
#
# Git-based, so it cannot be faked the way a manifest line can ("Tracker updated:
# yes" with no actual change). A step that genuinely touches no tracker-worthy
# work (e.g. a pure tracker edit) passes.
#
# Trackers (any one satisfies): SDLC_TRACKER.md, PROGRESS.md, DELEGATION_LOG.md,
# CHANGELOG.md, *_TRACKER.md, LESSONS.md.
#
# Usage: validate-tracker-fresh.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-tracker-fresh"

ROOT="$(detect_project_root "${1:-}")"

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  note "not a git work tree -- nothing to check"
  validator_exit
fi

is_tracker() {
  case "$1" in
    *SDLC_TRACKER.md|*PROGRESS.md|*DELEGATION_LOG.md|CHANGELOG.md|*/CHANGELOG.md|*_TRACKER.md|*TRACKER.md|*LESSONS.md) return 0 ;;
  esac
  return 1
}

is_trivial() {
  case "$1" in
    *-lock.*|*.lock|*.min.*|*.snap|node_modules/*|*/node_modules/*|dist/*|build/*|.filesizeignore) return 0 ;;
  esac
  return 1
}

# Modified-tracked + new untracked files (the step's footprint).
CHANGED=$( { git -C "$ROOT" diff --name-only HEAD 2>/dev/null; \
             git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null; } | sort -u )

WORK=0
TRACKER=0
FIRST_WORK=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if is_tracker "$f"; then TRACKER=$((TRACKER + 1)); continue; fi
  is_trivial "$f" && continue
  WORK=$((WORK + 1))
  [[ -z "$FIRST_WORK" ]] && FIRST_WORK="$f"
done <<EOF
$CHANGED
EOF

if [[ "$WORK" -eq 0 ]]; then
  note "no tracker-worthy work changed -- nothing to track"
elif [[ "$TRACKER" -gt 0 ]]; then
  pass "${WORK} work file(s) changed and a tracker was updated (${TRACKER})"
else
  gap "tracker-stale" "${WORK} work file(s) changed (e.g. ${FIRST_WORK}) but NO tracker updated -- record this step in SDLC_TRACKER.md / PROGRESS.md / DELEGATION_LOG.md / CHANGELOG.md so it isn't lost between steps"
fi

validator_exit
