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
  #
  # NOTE (T22.19): \b is a no-op on stock macOS /usr/bin/awk (onetrueawk),
  # so /\b(CRITICAL|HIGH)\b/ never fired on this machine (confirmed live:
  # it silently matched neither a false-positive "HIGHLIGHTED" line nor a
  # genuine "| HIGH |" row). has_word() tokenizes on runs of non-word
  # characters ([^[:alnum:]_]+ -- underscore counts as a word char, same
  # as \b) and compares tokens exactly, replicating \b's whole-word
  # semantics without relying on unsupported regex escapes.
  #
  # Also fixed incidentally, found live while verifying the above: the
  # trailing `i` on `/^(WAIVED|WAIVED-WITH-JUSTIFICATION)$/i` was presumably
  # meant as a case-insensitive flag, but onetrueawk has no such regex-literal
  # suffix syntax -- it silently parses as string concatenation of the match
  # result (0/1) with the enclosing for-loop's `i` counter, producing an
  # always-non-empty (hence always-true) string. That made `has_just` almost
  # always 1, so this check could never actually fire regardless of the \b
  # fix above (confirmed live: an empty WAIVED-status cell "matched" the
  # regex before this fix). Dropped the stray `i`; every other status/severity
  # literal in this validator (and this repo's FIX_BACKLOG fixtures) is
  # already upper-case-only, so exact-case matching here is consistent, not
  # a regression.
  while IFS= read -r line; do
    [[ -n "$line" ]] && gap "waived-no-justification" "$line"
  done < <(awk '
    function has_word(line, list,    n, i, toks, nk, k, kws) {
      n = split(line, toks, /[^[:alnum:]_]+/)
      nk = split(list, kws, "|")
      for (i = 1; i <= n; i++)
        for (k = 1; k <= nk; k++)
          if (toks[i] == kws[k]) return 1
      return 0
    }
    /WAIVED/ && has_word($0, "CRITICAL|HIGH") {
      # If cells are pipe-separated, find the column after status and check non-empty
      n = split($0, cells, "|")
      has_just = 0
      for (i = 1; i <= n; i++) {
        cell = cells[i]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", cell)
        if (cell ~ /^(WAIVED|WAIVED-WITH-JUSTIFICATION)$/) {
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
