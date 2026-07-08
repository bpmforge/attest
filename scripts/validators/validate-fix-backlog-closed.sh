#!/usr/bin/env bash
#
# validate-fix-backlog-closed.sh -- before phase-5 release, every CRITICAL and
# HIGH row in any FIX_BACKLOG_*.md must have status VERIFIED, FIXED, or
# WAIVED-WITH-JUSTIFICATION (followed by a non-empty justification).
#
# Acceptable closed statuses (case-insensitive):
#   VERIFIED, FIXED, RESOLVED, CLOSED, WAIVED, WAIVED-WITH-JUSTIFICATION
#
# Open statuses that fail the gate:
#   OPEN, PENDING, IN-PROGRESS, REOPENED, NEW
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-fix-backlog-closed"

ROOT="$(detect_project_root "${1:-}")"

# Find all FIX_BACKLOG files
BACKLOGS=()
while IFS= read -r f; do
  [[ -n "$f" ]] && BACKLOGS+=( "$f" )
done < <(find "$ROOT/docs/reviews" -type f -name 'FIX_BACKLOG_*.md' 2>/dev/null)

if [[ "${#BACKLOGS[@]}" -eq 0 ]]; then
  warn "no FIX_BACKLOG_*.md files found — skipping (no review cycle has produced one)"
  validator_exit
fi

pass "found ${#BACKLOGS[@]} FIX_BACKLOG file(s)"

OPEN_PATTERNS='\b(OPEN|PENDING|IN-PROGRESS|IN_PROGRESS|REOPENED|NEW|TODO)\b'
SEVERITY_PATTERNS='\b(CRITICAL|HIGH)\b'

for backlog in "${BACKLOGS[@]}"; do
  # Find lines with both a CRITICAL/HIGH severity and an OPEN-style status
  while IFS= read -r line; do
    if echo "$line" | grep -qE "$SEVERITY_PATTERNS" && echo "$line" | grep -qE "$OPEN_PATTERNS"; then
      gap "open-critical" "$(basename "$backlog"): $line"
    fi
  done < "$backlog"

  # Check WAIVED rows have a justification (non-empty cell or paragraph after).
  # Process substitution, NOT a pipe: `cmd | while read; do gap ...; done`
  # runs the loop in a subshell, silently losing gap()'s GAP_COUNT increment
  # (the parent shell still reports exit 0 even though a real gap was
  # written to the gap file and shown in the JSON `items` array).
  while IFS= read -r line; do
    [[ -n "$line" ]] && gap "waived-no-justification" "$line"
  done < <(awk '
    /WAIVED/ && /\b(CRITICAL|HIGH)\b/ {
      # If cells are pipe-separated, find the column after status and check non-empty
      n = split($0, cells, "|")
      has_just = 0
      for (i = 1; i <= n; i++) {
        cell = cells[i]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", cell)
        if (cell ~ /^(WAIVED|WAIVED-WITH-JUSTIFICATION)$/i) {
          if (i+1 <= n) {
            next_cell = cells[i+1]
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", next_cell)
            if (next_cell != "" && next_cell != "TBD" && next_cell != "TODO") {
              has_just = 1
            }
          }
        }
      }
      # If line contains "WAIVED" but no following justification text on same line, flag
      if (!has_just && $0 !~ /:[[:space:]]*[a-zA-Z0-9]/) {
        print FILENAME ":" $0
      }
    }
  ' "$backlog")
done

if [[ "$GAP_COUNT" -eq 0 ]]; then
  pass "all CRITICAL/HIGH rows are closed (verified, fixed, or waived with justification)"
fi

validator_exit
