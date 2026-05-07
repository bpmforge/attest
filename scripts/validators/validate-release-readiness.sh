#!/usr/bin/env bash
#
# validate-release-readiness.sh -- Phase 5 release gate. Checks all 10
# conditions that must be true before cutting a release.
#
# Conditions checked:
#   1. FIX_BACKLOG_RELEASE exists with 0 open CRITICAL/HIGH rows
#   2. VERIFY_RELEASE (latest) shows all merge-blocking rows = PASS OR signed waiver exists
#   3. SECURITY_FINAL verdict = READY / APPROVED
#   4. PERF_FINAL verdict = RELEASE-READY / APPROVED
#   5. CODE_REVIEW_FINAL verdict = APPROVED / APPROVED WITH SUGGESTIONS
#   6. UX_AUDIT verdict = RELEASE-READY / APPROVED (if docs/design/UX_SPEC.md exists)
#   7. COVERAGE report exists with no critical-path coverage gaps flagged
#   8. CONTAINER_AUDIT has no CRITICAL CVE
#   9. TECH_DEBT report exists (tech debt catalogued before release)
#  10. All RUNTIME_*.md files have PASS verdict
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-release-readiness"

ROOT="$(detect_project_root "${1:-}")"
REVIEWS_DIR="$ROOT/docs/reviews"

# -- Helper: find latest file matching a glob pattern -------------------------
latest_matching() {
  local pattern="$1"
  find "$REVIEWS_DIR" -type f -name "$pattern" 2>/dev/null \
    | sort -r | head -1 || true
}

# -- 1. FIX_BACKLOG_RELEASE exists and is clean --------------------------------
backlog=$(latest_matching "FIX_BACKLOG_RELEASE*" || latest_matching "FIX_BACKLOG_FINAL*")

if [[ -z "$backlog" ]]; then
  gap "missing-fix-backlog" "No FIX_BACKLOG_RELEASE_*.md or FIX_BACKLOG_FINAL_*.md found in docs/reviews/ — run Phase 5 Fix-Verify loop before release"
else
  pass "FIX_BACKLOG_RELEASE found: ${backlog#"$ROOT/"}"

  # Check for open CRITICAL/HIGH rows (rows with CRITICAL or HIGH AND Open/Pending/In-Progress status)
  open_critical=$(grep -iE '\|(CRITICAL|HIGH)\|' "$backlog" \
    | grep -iE '\|(OPEN|PENDING|IN.PROGRESS)\|' || true)

  if [[ -n "$open_critical" ]]; then
    gap "open-critical-high" "FIX_BACKLOG_RELEASE has open CRITICAL/HIGH rows — all must be PASS, FIXED, or WAIVED before release: $(printf '%s' "$open_critical" | head -3)"
  else
    pass "FIX_BACKLOG_RELEASE: no open CRITICAL/HIGH rows"
  fi

  # Check WAIVED rows have justification
  waived_no_reason=$(grep -iE '\|WAIVED?\|' "$backlog" \
    | grep -iE '\|\s*\|' || true)
  if [[ -n "$waived_no_reason" ]]; then
    gap "waiver-no-justification" "WAIVED row(s) in FIX_BACKLOG missing compensating control justification"
  fi
fi

# -- 2. Latest VERIFY_RELEASE shows merge-blocking rows PASS ------------------
verify=$(latest_matching "VERIFY_RELEASE*" || latest_matching "VERIFY_FINAL*")

if [[ -z "$verify" ]]; then
  # Only a gap if there were merge-blocking rows in the backlog
  if [[ -n "$backlog" ]]; then
    has_blocking=$(grep -iE '\|(CRITICAL|HIGH)\|' "$backlog" | head -1 || true)
    if [[ -n "$has_blocking" ]]; then
      gap "missing-verify" "FIX_BACKLOG has CRITICAL/HIGH rows but no VERIFY_RELEASE_*.md found — targeted re-verification required"
    else
      pass "No VERIFY report needed (no CRITICAL/HIGH in backlog)"
    fi
  fi
else
  pass "VERIFY_RELEASE found: ${verify#"$ROOT/"}"
  # Check for remaining FAIL rows
  fail_rows=$(grep -iE '\|[[:space:]]*FAIL[[:space:]]*\|' "$verify" | head -3 || true)
  if [[ -n "$fail_rows" ]]; then
    gap "verify-fail-rows" "VERIFY_RELEASE has FAIL rows — all must be PASS or waived: $fail_rows"
  else
    pass "VERIFY_RELEASE: no FAIL rows"
  fi
fi

# -- 3. SECURITY_FINAL verdict = READY/APPROVED -------------------------------
sec_final=$(latest_matching "SECURITY_FINAL*")

if [[ -z "$sec_final" ]]; then
  gap "missing-security-final" "docs/reviews/SECURITY_FINAL_*.md not found — full security audit required before release"
else
  pass "SECURITY_FINAL found: ${sec_final#"$ROOT/"}"
  if grep -qiE '(verdict|status)[[:space:]]*[:=][[:space:]]*(READY|APPROVED|RELEASE.READY)' "$sec_final" 2>/dev/null \
    || grep -qiE '^(READY|APPROVED|RELEASE.READY)$' "$sec_final" 2>/dev/null; then
    pass "SECURITY_FINAL verdict: READY/APPROVED"
  elif grep -qiE '\bBLOCKED\b' "$sec_final" 2>/dev/null; then
    gap "security-blocked" "SECURITY_FINAL shows BLOCKED verdict — resolve security findings before release"
  else
    gap "security-verdict-unclear" "SECURITY_FINAL verdict is not clearly READY/APPROVED — check ${sec_final#"$ROOT/"}"
  fi
fi

# -- 4. PERF_FINAL verdict = RELEASE-READY/APPROVED ---------------------------
perf_final=$(latest_matching "PERF_FINAL*")

if [[ -z "$perf_final" ]]; then
  gap "missing-perf-final" "docs/reviews/PERF_FINAL_*.md not found — performance audit required before release (or explicitly waived if no NFRs)"
else
  pass "PERF_FINAL found: ${perf_final#"$ROOT/"}"
  if grep -qiE '(RELEASE.READY|APPROVED)' "$perf_final" 2>/dev/null; then
    pass "PERF_FINAL verdict: RELEASE-READY/APPROVED"
  elif grep -qiE '\bBLOCKED\b' "$perf_final" 2>/dev/null; then
    gap "perf-blocked" "PERF_FINAL shows BLOCKED verdict — NFR targets not met"
  else
    gap "perf-verdict-unclear" "PERF_FINAL verdict is not clearly RELEASE-READY — check ${perf_final#"$ROOT/"}"
  fi
fi

# -- 5. CODE_REVIEW_FINAL verdict = APPROVED -----------------------------------
review_final=$(latest_matching "CODE_REVIEW_FINAL*")

if [[ -z "$review_final" ]]; then
  gap "missing-review-final" "docs/reviews/CODE_REVIEW_FINAL_*.md not found — final code review required before release"
else
  pass "CODE_REVIEW_FINAL found: ${review_final#"$ROOT/"}"
  if grep -qiE 'APPROVED' "$review_final" 2>/dev/null; then
    pass "CODE_REVIEW_FINAL verdict: APPROVED"
  elif grep -qiE '(REJECT|NEEDS[[:space:]]+REVISION)' "$review_final" 2>/dev/null; then
    gap "review-rejected" "CODE_REVIEW_FINAL shows REJECT or NEEDS REVISION verdict"
  else
    gap "review-verdict-unclear" "CODE_REVIEW_FINAL verdict not clearly APPROVED — check ${review_final#"$ROOT/"}"
  fi
fi

# -- 6. UX_AUDIT verdict = RELEASE-READY (if UI-bearing) ----------------------
if [[ -f "$ROOT/docs/design/UX_SPEC.md" ]]; then
  ux_audit=$(latest_matching "UX_AUDIT*")
  if [[ -z "$ux_audit" ]]; then
    gap "missing-ux-audit" "UI-bearing project but docs/reviews/UX_AUDIT_*.md not found — WCAG accessibility audit required"
  else
    pass "UX_AUDIT found: ${ux_audit#"$ROOT/"}"
    if grep -qiE '(RELEASE.READY|APPROVED)' "$ux_audit" 2>/dev/null; then
      pass "UX_AUDIT verdict: RELEASE-READY/APPROVED"
    elif grep -qiE '\bBLOCKED\b' "$ux_audit" 2>/dev/null; then
      gap "ux-blocked" "UX_AUDIT shows BLOCKED verdict — WCAG violations must be resolved"
    else
      gap "ux-verdict-unclear" "UX_AUDIT verdict not clearly RELEASE-READY — check ${ux_audit#"$ROOT/"}"
    fi
  fi
else
  note "Not UI-bearing (no docs/design/UX_SPEC.md) — UX_AUDIT skipped"
fi

# -- 7. COVERAGE report exists with no critical-path gap ----------------------
coverage=$(latest_matching "COVERAGE*")

if [[ -z "$coverage" ]]; then
  gap "missing-coverage" "docs/reviews/COVERAGE_*.md not found — test coverage analysis required before release"
else
  pass "COVERAGE found: ${coverage#"$ROOT/"}"
  # Check for critical-path coverage gaps
  critical_gap=$(grep -iE '(critical.*uncovered|0%.*critical|critical.*0%|auth.*not tested|payment.*not tested)' \
    "$coverage" 2>/dev/null | head -2 || true)
  if [[ -n "$critical_gap" ]]; then
    gap "coverage-critical-gap" "COVERAGE report shows critical-path gaps: $critical_gap"
  else
    pass "COVERAGE: no critical-path gaps detected"
  fi
fi

# -- 8. CONTAINER_AUDIT has no CRITICAL CVE ------------------------------------
container=$(latest_matching "CONTAINER_AUDIT*")

if [[ -z "$container" ]]; then
  warn "docs/reviews/CONTAINER_AUDIT_*.md not found — container security audit recommended (non-blocking if no containers used)"
else
  pass "CONTAINER_AUDIT found: ${container#"$ROOT/"}"
  critical_cve=$(grep -iE 'CRITICAL.*CVE|CVE.*CRITICAL' "$container" 2>/dev/null | head -3 || true)
  if [[ -n "$critical_cve" ]]; then
    gap "critical-cve" "CONTAINER_AUDIT has CRITICAL CVE(s) in base images — update base image or apply patch: $critical_cve"
  else
    pass "CONTAINER_AUDIT: no CRITICAL CVEs"
  fi
fi

# -- 9. TECH_DEBT report exists -----------------------------------------------
tech_debt=$(latest_matching "TECH_DEBT*")

if [[ -z "$tech_debt" ]]; then
  gap "missing-tech-debt" "docs/reviews/TECH_DEBT_*.md not found — tech debt must be catalogued before release (even if all items are deferred)"
else
  pass "TECH_DEBT found: ${tech_debt#"$ROOT/"}"
fi

# -- 10. All RUNTIME_*.md files have PASS verdict -----------------------------
runtime_files_found=0
runtime_fail_count=0

while IFS= read -r runtime_file; do
  [[ -z "$runtime_file" ]] && continue
  runtime_files_found=$((runtime_files_found + 1))
  if ! grep -qiE '\bPASS\b' "$runtime_file" 2>/dev/null; then
    gap "runtime-not-pass" "RUNTIME report does not show PASS verdict: ${runtime_file#"$ROOT/"}"
    runtime_fail_count=$((runtime_fail_count + 1))
  fi
done < <(find "$REVIEWS_DIR" -name "RUNTIME_*.md" 2>/dev/null || true)

if [[ "$runtime_files_found" -eq 0 ]]; then
  gap "no-runtime-reports" "No RUNTIME_*.md files found in docs/reviews/ — runtime validation required before release"
else
  pass "RUNTIME reports: $runtime_files_found found, $runtime_fail_count failing"
fi

validator_exit
