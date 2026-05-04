#!/usr/bin/env bash
#
# validate-tests-mapping.sh -- bidirectional coverage between use cases and tests.
#
# Forward: every P0 and P1 use case in USE_CASES.md must have at least one test
# file that references its UC-ID (in filename or describe block / test name).
#
# Reverse: every test file in tests/ or __tests__/ or e2e/ should reference at
# least one UC-ID. Tests without a UC reference are warned, not failed.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-tests-mapping"

ROOT="$(detect_project_root "${1:-}")"

UC=""
for f in "$ROOT/docs/USE_CASES.md" "$ROOT/docs/testing/USE_CASES.md"; do
  [[ -f "$f" ]] && UC="$f" && break
done

if [[ -z "$UC" ]]; then
  warn "no USE_CASES.md found — skipping"
  validator_exit
fi

# Collect P0 + P1 use case IDs
P_CASES=$(grep -E 'UC-[0-9]+' "$UC" | grep -E '\b[Pp][01]\b' | grep -oE 'UC-[0-9]+' | sort -u)

P_COUNT=$(printf '%s\n' "$P_CASES" | grep -c . || true)
if [[ "$P_COUNT" -eq 0 ]]; then
  warn "no P0 or P1 use cases found — skipping"
  validator_exit
fi

pass "found $P_COUNT P0/P1 use case(s)"

# Find test directories
TEST_DIRS=()
for d in tests test __tests__ e2e cypress playwright spec; do
  [[ -d "$ROOT/$d" ]] && TEST_DIRS+=( "$ROOT/$d" )
done

if [[ "${#TEST_DIRS[@]}" -eq 0 ]]; then
  gap "no-tests-dir" "no test directory found (tests/, __tests__/, e2e/, etc.)"
  validator_exit
fi

# Forward check: every P0/P1 has a test reference
while IFS= read -r uc; do
  [[ -z "$uc" ]] && continue
  found=0
  for d in "${TEST_DIRS[@]}"; do
    # Filename match
    if find "$d" -type f \( -name "*${uc}*" -o -name "*$(echo "$uc" | tr A-Z a-z)*" \) 2>/dev/null | head -1 | grep -q .; then
      found=1
      break
    fi
    # Content reference
    if grep -rqE "\b${uc}\b" "$d" 2>/dev/null; then
      found=1
      break
    fi
  done
  [[ "$found" -eq 0 ]] && gap "uncovered-uc" "$uc has no test referencing it"
done <<< "$P_CASES"

# Reverse check (warning only): tests without UC references
ORPHAN_COUNT=0
for d in "${TEST_DIRS[@]}"; do
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if ! grep -qE 'UC-[0-9]+' "$f" 2>/dev/null; then
      ORPHAN_COUNT=$((ORPHAN_COUNT + 1))
    fi
  done < <(find "$d" -type f \( -name '*.test.*' -o -name '*.spec.*' -o -name 'test_*.py' \) 2>/dev/null)
done

if [[ "$ORPHAN_COUNT" -gt 0 ]]; then
  warn "$ORPHAN_COUNT test file(s) do not reference any UC-ID (informational — consider adding for traceability)"
fi

validator_exit
