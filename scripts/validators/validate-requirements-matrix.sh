#!/usr/bin/env bash
#
# validate-requirements-matrix.sh -- verifies the REQUIREMENTS_MATRIX.md (Phase 2)
# tracks every P0 use case through to a test reference and a resolved status.
#
# Checks:
#   1. REQUIREMENTS_MATRIX.md exists and is non-empty
#   2. Has the four required columns: Requirement/FR, Use Case/UC, Test, Status
#   3. Every row with a P0 UC has a non-empty Test cell
#   4. Every row with a P0 UC has a non-empty Status cell (not blank/TBD/TODO)
#   5. Cross-reference: every UC-ID in the matrix also appears in USE_CASES.md
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-requirements-matrix"

ROOT="$(detect_project_root "${1:-}")"

# -- Locate REQUIREMENTS_MATRIX.md -----------------------------------------
MATRIX=""
for candidate in \
  "$ROOT/docs/work/REQUIREMENTS_MATRIX.md" \
  "$ROOT/docs/REQUIREMENTS_MATRIX.md" \
  "$ROOT/docs/testing/REQUIREMENTS_MATRIX.md"; do
  [[ -f "$candidate" ]] && MATRIX="$candidate" && break
done

if [[ -z "$MATRIX" ]]; then
  gap "missing-matrix" "REQUIREMENTS_MATRIX.md not found (checked docs/work/, docs/, docs/testing/) — produce it in Phase 2 derivation pass"
  validator_exit
fi

pass "REQUIREMENTS_MATRIX.md found: ${MATRIX#"$ROOT/"}"

# -- Must be non-empty and have a table header -----------------------------
line_count=$(wc -l < "$MATRIX" | tr -d ' ')
if [[ "$line_count" -lt 5 ]]; then
  gap "matrix-too-short" "REQUIREMENTS_MATRIX.md has only $line_count lines — likely a stub"
  validator_exit
fi

# -- Required columns present in header -----------------------------------
header=$(grep -m1 '|' "$MATRIX" || true)
if [[ -z "$header" ]]; then
  gap "no-table" "REQUIREMENTS_MATRIX.md has no markdown table — expected pipe-delimited table"
  validator_exit
fi

# ERE alternation is a bare `|`, not `\|` -- POSIX ERE (grep -E) has no
# defined meaning for an escaped `\|`, and on this machine's grep it matches
# a literal pipe character instead of alternation, so these column checks
# always fired "missing" regardless of the actual header (found via the
# T22.5 green fixture: a header with every required column still produced 4
# missing-column gaps). Not a macOS/BSD-specific quirk -- independent review
# confirmed the same behavior is standard POSIX ERE, not a platform quirk.
for col_pattern in 'FR|Requirement' 'UC|Use.Case' 'Test|Spec' 'Status|Verified'; do
  if ! printf '%s' "$header" | grep -qiE "$col_pattern"; then
    gap "missing-column" "REQUIREMENTS_MATRIX.md header missing column matching '${col_pattern}' — required columns: Requirement/FR, Use Case/UC, Test, Status"
  fi
done

pass "table header present"

# -- Locate USE_CASES.md for cross-reference --------------------------------
UC_FILE=""
for f in "$ROOT/docs/testing/USE_CASES.md" "$ROOT/docs/USE_CASES.md"; do
  [[ -f "$f" ]] && UC_FILE="$f" && break
done

# -- Scope rows to the requirements-matrix table ONLY -----------------------
# A matrix document legitimately carries more than one table (e.g. a module
# traceability table whose own Status vocabulary is "Specified"). Scanning
# every row in the file that merely CONTAINS a UC-NN made each use case get
# judged twice: it passed on the real matrix and then failed on the unrelated
# table, producing a full set of false "Status column is empty" gaps that no
# edit to the real matrix could ever clear. Only rows under a header carrying
# BOTH a Test-ish and a Status-ish column are matrix rows.
MATRIX_TABLE_ROWS=$(awk '
  {
    if ($0 ~ /^[[:space:]]*\|[[:space:]]*:?-{2,}/) {
      hdr = prev
      in_matrix = (hdr ~ /[Ss]tatus|[Vv]erified/) && (hdr ~ /[Tt]est|[Ss]pec/)
    } else if (in_matrix && $0 ~ /^[[:space:]]*\|/) {
      print hdr "\t" $0
    }
    prev = $0
  }
' "$MATRIX")

# Never validate LESS than before: if no table advertises both columns, fall
# back to the whole file (the missing-column gap above already explains why).
if [[ -z "$(printf '%s' "$MATRIX_TABLE_ROWS" | tr -d '[:space:]')" ]]; then
  MATRIX_TABLE_ROWS=$(cat "$MATRIX")
fi

# -- Parse rows: look for P0 UC rows and verify test + status cells --------
# We scan for rows containing UC-NN IDs and check each cell
MATRIX_UC_IDS=""
while IFS=$'\t' read -r hdr row; do
  # Skip header and separator rows
  [[ "$row" =~ ^[[:space:]]*\|[-:] ]] && continue
  [[ "$row" =~ ^[[:space:]]*\|[[:space:]]*[\-:] ]] && continue

  # Extract UC-ID from row
  uc_id=$(printf '%s' "$row" | grep -oE 'UC-[0-9]+' | head -1 || true)
  [[ -z "$uc_id" ]] && continue

  MATRIX_UC_IDS="$MATRIX_UC_IDS $uc_id"

  # Determine if this is P0 (row contains P0 or the UC is flagged P0 in USE_CASES.md)
  is_p0=0
  if printf '%s' "$row" | grep -qiE '\bP0\b'; then
    is_p0=1
  elif [[ -n "$UC_FILE" ]]; then
    if grep -qE "$uc_id" "$UC_FILE" && grep -A5 "$uc_id" "$UC_FILE" 2>/dev/null | grep -qiE '\bP0\b'; then
      is_p0=1
    fi
  fi

  [[ "$is_p0" -eq 0 ]] && continue

  # Read the Test and Status cells from THEIR NAMED COLUMNS. The previous
  # version scanned every cell for a status-vocabulary word, so a status the
  # list did not happen to contain (e.g. "Specified") read as an EMPTY Status
  # column, and a Test cell containing the word "open" could be mistaken for
  # the status. Reading the header's own column index removes both.
  IFS='|' read -ra cells <<< "$row"
  idx_test=-1; idx_status=-1
  IFS='|' read -ra HC <<< "$hdr"
  for i in "${!HC[@]}"; do
    h=$(printf '%s' "${HC[$i]}" | sed 's/[*_`]//g; s/^ *//; s/ *$//')
    [[ -z "$h" ]] && continue
    shopt -s nocasematch
    if   [[ "$h" =~ (test|spec) ]];        then idx_test=$i
    elif [[ "$h" =~ (status|verified) ]];  then idx_status=$i
    fi
    shopt -u nocasematch
  done

  mcell() { local n="$1"; [[ "$n" -lt 0 ]] && return 0; printf '%s' "${cells[$n]:-}" | sed 's/^ *//; s/ *$//'; }
  test_cell=$(mcell "$idx_test")
  status_cell=$(mcell "$idx_status")

  # Check Test cell populated
  if [[ "$idx_test" -ge 0 ]]; then
    if [[ -z "$test_cell" || "$test_cell" == "-" || "$test_cell" == "—" ]]; then
      gap "p0-missing-test" "$uc_id (P0): Test column is empty — add the test file path or test name that verifies this use case"
    else
      pass "$uc_id (P0): test → $test_cell"
    fi
  fi

  # Check Status cell
  if [[ "$idx_status" -lt 0 ]]; then
    : # no Status column in this table's header — the missing-column gap covers it
  elif [[ -z "$status_cell" ]]; then
    gap "p0-missing-status" "$uc_id (P0): Status column is empty or TBD — set to VERIFIED (tests pass), OPEN (not yet tested), or BLOCKED"
  elif printf '%s' "$status_cell" | grep -qiE '(TBD|TODO|PENDING|\?\?\?)'; then
    gap "p0-unresolved-status" "$uc_id (P0): Status is '${status_cell}' — must be resolved before phase gate passes"
  else
    pass "$uc_id (P0): status → $status_cell"
  fi

done <<< "$MATRIX_TABLE_ROWS"

# -- Cross-reference: matrix UCs exist in USE_CASES.md --------------------
if [[ -n "$UC_FILE" && -n "$MATRIX_UC_IDS" ]]; then
  for uc_id in $MATRIX_UC_IDS; do
    if ! grep -qE "\b${uc_id}\b" "$UC_FILE" 2>/dev/null; then
      gap "matrix-uc-not-in-use-cases" "$uc_id appears in REQUIREMENTS_MATRIX but not in USE_CASES.md — add use case or correct the ID"
    fi
  done
fi

validator_exit
