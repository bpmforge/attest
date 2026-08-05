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

# --base <ref>  -> merge-gate mode: compare the branch against <ref> (e.g. main).
# --since <ref> -> handoff mode: commits in <ref>..HEAD UNION the working tree.
# default       -> per-step mode: compare the working tree against HEAD.
#
# Why --since exists. Per-step mode assumes the working tree IS one step's
# footprint. That holds for a single agent working alone; it breaks in an SDLC
# run, where handoffs share docs/work/ and docs/reviews/ and a git-expert
# checkpoint commits the tracker while other steps' deliverables stay dirty.
# The tracker then disappears from `git diff HEAD` while the work does not, so
# the gate reports "work changed but NO tracker updated" about a tracker that
# WAS updated -- and no edit can clear it, because the dirty files belong to
# other steps. Worse, handoff-done.sh requires a step to COMMIT what it owns,
# so obeying that contract is what makes this gate unsatisfiable.
# --since restores the intended meaning by counting the branch's commits too:
# a tracker committed during this run still counts as updated.
BASE=""
SINCE=""
ROOT_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    *) [[ -z "$ROOT_ARG" ]] && ROOT_ARG="$1"; shift ;;
  esac
done
ROOT="$(detect_project_root "$ROOT_ARG")"

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

# The step's (or branch's) footprint of changed files.
if [[ -n "$BASE" ]]; then
  note "merge-gate mode: comparing branch vs ${BASE}"
  CHANGED=$(git -C "$ROOT" diff --name-only "${BASE}...HEAD" 2>/dev/null | sort -u)
elif [[ -n "$SINCE" ]]; then
  # ASYMMETRIC on purpose. Work is still counted from the working tree only --
  # counting the branch's committed work too would newly demand a tracker from
  # flows that legitimately have none per step (the conductor lands a ticket
  # per branch and records the board, not a tracker), turning a fix for one
  # caller into a regression for another. Only the TRACKER side widens: a
  # tracker committed earlier in this run still counts as updated. That is the
  # asymmetry the bug needs, because the failure was a committed tracker
  # disappearing from `git diff HEAD` while other steps' dirty files remained.
  note "handoff mode: work from the working tree; tracker from the tree or commits since ${SINCE}"
  CHANGED=$( { git -C "$ROOT" diff --name-only HEAD 2>/dev/null; \
               git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null; } | sort -u )
  COMMITTED_IN_RUN=$(git -C "$ROOT" diff --name-only "${SINCE}..HEAD" 2>/dev/null | sort -u)
else
  CHANGED=$( { git -C "$ROOT" diff --name-only HEAD 2>/dev/null; \
               git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null; } | sort -u )
fi

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

# A tracker committed earlier in this run counts (handoff mode only).
if [[ -n "${COMMITTED_IN_RUN:-}" && "$TRACKER" -eq 0 ]]; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if is_tracker "$f"; then TRACKER=$((TRACKER + 1)); fi
  done <<EOF
$COMMITTED_IN_RUN
EOF
  [[ "$TRACKER" -gt 0 ]] && note "tracker updated in a commit since ${SINCE} (not in the working tree)"
fi

if [[ "$WORK" -eq 0 ]]; then
  note "no tracker-worthy work changed -- nothing to track"
elif [[ "$TRACKER" -gt 0 ]]; then
  pass "${WORK} work file(s) changed and a tracker was updated (${TRACKER})"
else
  gap "tracker-stale" "${WORK} work file(s) changed (e.g. ${FIRST_WORK}) but NO tracker updated -- record this step in SDLC_TRACKER.md / PROGRESS.md / DELEGATION_LOG.md / CHANGELOG.md so it isn't lost between steps"
fi

validator_exit
