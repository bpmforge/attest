#!/usr/bin/env bash
#
# recover-phase-state.sh -- commit a specialist's phase files to git and
# print a resume packet (BOUNDED_TASK_CONTRACT Rule 8 / backlog D2).
#
# Multi-phase specialists checkpoint to docs/work/<agent>/<task-slug>/phaseN.md.
# When a session dies mid-task, this script preserves that state in git and
# tells the user exactly how to resume without redoing completed phases.
#
# Usage: bash scripts/recover-phase-state.sh <agent> <task-slug>
#        bash scripts/recover-phase-state.sh --list        # show recoverable state
#
# Exit: 0 = state committed + resume packet printed / 1 = no state found / 2 = usage

set -euo pipefail

# Minute-resolution mtime. GNU first: GNU `stat -f` is --file-system, which
# prints a filesystem report to stdout before failing on the format, so a
# BSD-first chain leaked that report into the listing on Linux. BSD stat
# rejects -c with no stdout, so the fallback stays clean on macOS.
phase_mtime() {
  stat -c '%y' "$1" 2>/dev/null | cut -c1-16 ||
    stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$1" 2>/dev/null
}

if [[ "${1:-}" == "--list" ]]; then
  found=0
  for d in docs/work/*/*/; do
    [[ -d "$d" ]] || continue
    phases=$(find "$d" -maxdepth 1 -name "phase*.md" 2>/dev/null | wc -l | tr -d ' ')
    [[ "$phases" -gt 0 ]] || continue
    found=1
    printf '%s — %s phase file(s), last modified %s\n' \
      "$d" "$phases" "$(find "$d" -maxdepth 1 -name 'phase*.md' -print0 2>/dev/null |
        while IFS= read -r -d '' f; do phase_mtime "$f"; done | sort | tail -1)"
  done
  [[ "$found" -eq 1 ]] || echo "No recoverable phase state under docs/work/"
  exit 0
fi

AGENT="${1:-}"
SLUG="${2:-}"
if [[ -z "$AGENT" || -z "$SLUG" ]]; then
  echo "usage: recover-phase-state.sh <agent> <task-slug>  (or --list)" >&2
  exit 2
fi

DIR="docs/work/$AGENT/$SLUG"
if [[ ! -d "$DIR" ]]; then
  echo "recover-phase-state: no state at $DIR" >&2
  echo "Run --list to see recoverable directories." >&2
  exit 1
fi

PHASES=$(find "$DIR" -maxdepth 1 -name "phase*.md" | sort)
if [[ -z "$PHASES" ]]; then
  echo "recover-phase-state: $DIR exists but holds no phase*.md files" >&2
  exit 1
fi

LAST=$(basename "$(echo "$PHASES" | tail -1)" .md)
COUNT=$(echo "$PHASES" | wc -l | tr -d ' ')

# Preserve in git (no-op outside a repo; never fails the recovery).
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git add "$DIR" 2>/dev/null || true
  if ! git diff --cached --quiet 2>/dev/null; then
    git commit -q -m "wip: preserve $AGENT/$SLUG phase state ($COUNT phases, through $LAST)" || true
    echo "Committed $COUNT phase file(s) to git."
  else
    echo "Phase files already committed — nothing new to preserve."
  fi
else
  echo "Not a git repository — phase files preserved on disk only."
fi

cat <<RESUME

── Resume packet ─────────────────────────────────────────────
Completed through: $LAST ($COUNT phase files)
$(echo "$PHASES" | sed 's/^/  - /')

Paste into a new session (or dispatch via Task tool):

SDLC-TASK for $AGENT:
RESUME from: $DIR/
Read the phase files above (highest number = latest state), then continue
from the next phase. Do NOT redo completed phases. Original HANDOFF rules
(BOUNDED_TASK_CONTRACT.md) still apply.
──────────────────────────────────────────────────────────────
RESUME
