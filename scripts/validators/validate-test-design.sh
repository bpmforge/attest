#!/usr/bin/env bash
#
# validate-test-design.sh -- validates TEST_DESIGN.md exists and covers:
#   - All P0 use cases (traceability)
#   - Mandatory test type sections (unit / integration / e2e / security)
#   - API endpoints from openapi.yaml
#   - Security test cases for HIGH/CRITICAL threats
#
# Phase 3.5 gate -- non-blocking style (used in coverage loop with escalation,
# not as a hard block). Gaps trigger gap-fill HANDOFFs, not immediate failure.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-test-design"

ROOT="$(detect_project_root "${1:-}")"

# -- Locate TEST_DESIGN.md ----------------------------------------------------
TD=""
for f in "$ROOT/docs/testing/TEST_DESIGN.md" "$ROOT/docs/TEST_DESIGN.md"; do
  [[ -f "$f" ]] && TD="$f" && break
done

if [[ -z "$TD" ]]; then
  gap "missing-test-design" "TEST_DESIGN.md not found (expected at docs/testing/TEST_DESIGN.md or docs/TEST_DESIGN.md)"
  validator_exit
fi
pass "TEST_DESIGN.md present: $TD"

# -- Mandatory sections -------------------------------------------------------
for section in "Unit" "Integration" "E2E" "Security"; do
  if grep -qi "$section" "$TD" 2>/dev/null; then
    pass "$section test section present"
  else
    gap "missing-section" "TEST_DESIGN.md missing $section test section"
  fi
done

# -- P0 use case coverage -----------------------------------------------------
UC=""
for f in "$ROOT/docs/USE_CASES.md" "$ROOT/docs/testing/USE_CASES.md"; do
  [[ -f "$f" ]] && UC="$f" && break
done

if [[ -n "$UC" ]]; then
  p0_ids=$(grep -iE '\|[[:space:]]*P0[[:space:]]*\|' "$UC" | grep -oE 'UC-[0-9]+' || true)
  if [[ -n "$p0_ids" ]]; then
    covered_uc=0
    missing_uc=0
    while IFS= read -r uc_id; do
      [[ -z "$uc_id" ]] && continue
      if grep -qi "$uc_id" "$TD" 2>/dev/null; then
        pass "$uc_id covered in TEST_DESIGN.md"
        covered_uc=$((covered_uc + 1))
      else
        gap "uncovered-p0" "P0 use case $uc_id not referenced in TEST_DESIGN.md"
        missing_uc=$((missing_uc + 1))
      fi
    done <<< "$p0_ids"
    note "P0 use case coverage: $covered_uc covered, $missing_uc missing"
  else
    warn "no P0 use cases found in $UC — skipping coverage check"
  fi
else
  warn "USE_CASES.md not found — skipping P0 coverage check"
fi

# -- API endpoint coverage (spot check) ----------------------------------------
OPENAPI="$ROOT/docs/api/openapi.yaml"
if file_exists_nonempty "$OPENAPI"; then
  # Count paths in openapi.yaml
  endpoint_count=$(grep -cE '^[[:space:]]+(get|post|put|patch|delete):' "$OPENAPI" || echo 0)
  # Count endpoint references in TEST_DESIGN.md
  td_endpoint_count=$(grep -cE '(GET|POST|PUT|PATCH|DELETE)[[:space:]]*/[a-zA-Z]' "$TD" || echo 0)
  if [[ "${endpoint_count:-0}" -gt 0 && "${td_endpoint_count:-0}" -eq 0 ]]; then
    gap "missing-api-coverage" "openapi.yaml has $endpoint_count endpoints but TEST_DESIGN.md has no integration test targets referencing HTTP methods — add integration test section per API endpoint"
  else
    pass "API endpoint references present ($td_endpoint_count test targets, $endpoint_count spec endpoints)"
  fi
fi

# -- Security test cases for HIGH/CRITICAL threats ----------------------------
TM="$ROOT/docs/THREAT_MODEL.md"
if file_exists_nonempty "$TM"; then
  has_high=$(grep -icE '(CRITICAL|HIGH)' "$TM" || echo 0)
  if [[ "${has_high:-0}" -gt 0 ]]; then
    if grep -qiE '(security[[:space:]]+test|threat[[:space:]]+test|injection[[:space:]]+test|auth[[:space:]]+(test|verif)|OWASP|penetrat)' "$TD" 2>/dev/null; then
      pass "security test cases present for HIGH/CRITICAL threats"
    else
      gap "missing-security-tests" "THREAT_MODEL.md has HIGH/CRITICAL threats but TEST_DESIGN.md has no security test cases — add a Security Tests section covering each HIGH/CRITICAL threat"
    fi
  fi
fi

# -- Performance benchmark targets (warn only if NFRs exist) ------------------
SRS="$ROOT/docs/SRS.md"
if file_exists_nonempty "$SRS"; then
  if grep -qiE 'NFR-[0-9]+' "$SRS"; then
    if ! grep -qiE '(performance[[:space:]]+test|benchmark|load[[:space:]]+test|NFR-[0-9]+)' "$TD" 2>/dev/null; then
      warn "SRS.md has NFR entries but TEST_DESIGN.md has no performance benchmark section (non-blocking)"
    else
      pass "performance test targets present"
    fi
  fi
fi

validator_exit
