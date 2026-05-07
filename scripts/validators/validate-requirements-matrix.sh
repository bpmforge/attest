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

for col_pattern in 'FR\|Requirement' 'UC\|Use.Case' 'Test\|Spec' 'Status\|Verified'; do
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

# -- Parse rows: look for P0 UC rows and verify test + status cells --------
# We scan for rows containing UC-NN IDs and check each cell
MATRIX_UC_IDS=""
while IFS= read -r row; do
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

  # Split row into cells by pipe — field 1=blank, 2=FR, 3=UC, 4=Test, 5=Status (approx)
  # We look for the Test and Status cells heuristically: non-empty, not just dashes
  # Extract all cells into an array
  IFS='|' read -ra cells <<< "$row"

  # Find Test cell: contains .spec, .test, test/, e2e/, or a hyphen-link
  test_cell=""
  status_cell=""
  for cell in "${cells[@]}"; do
    trimmed="${cell#"${cell%%[![:space:]]*}"}"  # ltrim
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"  # rtrim
    if printf '%s' "$trimmed" | grep -qiE '(\.spec|\.test|test/|e2e/|spec/|\.py|it\(|describe\()' 2>/dev/null; then
      test_cell="$trimmed"
    fi
    if printf '%s' "$trimmed" | grep -qiE '(PASS|FAIL|VERIFIED|OPEN|TODO|TBD|PENDING|BLOCKED|DONE)' 2>/dev/null; then
      status_cell="$trimmed"
    fi
  done

  # Check Test cell populated
  if [[ -z "$test_cell" ]]; then
    # Fallback: count non-empty non-dash cells — if ≥4, assume test cell exists
    non_empty=0
    for cell in "${cells[@]}"; do
      trimmed="${cell#"${cell%%[![:space:]]*}"}"
      trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
      [[ -n "$trimmed" && "$trimmed" != "-" && "$trimmed" != "—" ]] && non_empty=$((non_empty + 1))
    done
    if [[ "$non_empty" -lt 4 ]]; then
      gap "p0-missing-test" "$uc_id (P0): Test column is empty — add the test file path or test name that verifies this use case"
    else
      pass "$uc_id (P0): test cell appears populated"
    fi
  else
    pass "$uc_id (P0): test → $test_cell"
  fi

  # Check Status cell
  if [[ -z "$status_cell" ]]; then
    gap "p0-missing-status" "$uc_id (P0): Status column is empty or TBD — set to VERIFIED (tests pass), OPEN (not yet tested), or BLOCKED"
  elif printf '%s' "$status_cell" | grep -qiE '(TBD|TODO|PENDING|\?\?\?)'; then
    gap "p0-unresolved-status" "$uc_id (P0): Status is '${status_cell}' — must be resolved before phase gate passes"
  else
    pass "$uc_id (P0): status → $status_cell"
  fi

done < "$MATRIX"

# -- Cross-reference: matrix UCs exist in USE_CASES.md --------------------
if [[ -n "$UC_FILE" && -n "$MATRIX_UC_IDS" ]]; then
  for uc_id in $MATRIX_UC_IDS; do
    if ! grep -qE "\b${uc_id}\b" "$UC_FILE" 2>/dev/null; then
      gap "matrix-uc-not-in-use-cases" "$uc_id appears in REQUIREMENTS_MATRIX but not in USE_CASES.md — add use case or correct the ID"
    fi
  done
fi

validator_exit
