#!/usr/bin/env bash
#
# validate-spec-traceability.sh -- founding-brief coverage gate (phase-3).
#
# Requires docs/TRACEABILITY.md: every concrete requirement from the user's
# ORIGINAL brief + Discovery Interview answers, graded against the finished
# doc set and ticket board. SRS-internal traceability (requirements<->stories)
# cannot catch what never made it into the SRS — this gate can.
#
# Checks:
#   1. docs/TRACEABILITY.md exists and is non-empty
#   2. At least 20 graded rows (| ... COVERED/PARTIAL/MISSING ...)
#   3. Zero MISSING rows, OR a Gap-resolution section asserting "0 MISSING"
#      (gaps found by the audit must be closed or explicitly deferred)
#   4. PARTIAL rows require a Gap register / Gap resolution section
#   5. No placeholder text ([TODO], [TBD], PLACEHOLDER)
#
# Origin: RetroForge 2026-07-06 — a fully-gated doc set shipped without a
# frontend design doc because nothing compared the docs to the original brief.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-spec-traceability"

ROOT="$(detect_project_root "${1:-}")"

TRACE="$ROOT/docs/TRACEABILITY.md"

# -- 1. exists -----------------------------------------------------------------
if ! file_exists_nonempty "$TRACE"; then
  gap "missing-traceability" "docs/TRACEABILITY.md not found or empty — run the Spec Traceability Audit (founding brief + Discovery answers → every doc/ticket, graded COVERED/PARTIAL/MISSING) before the phase-3 gate"
  validator_exit
fi
pass "TRACEABILITY.md present"

# -- 2. enough graded rows -------------------------------------------------------
ROW_COUNT=$(grep -icE '\|[[:space:]]*(COVERED|PARTIAL|MISSING)' "$TRACE" || true)
if [[ "$ROW_COUNT" -lt 20 ]]; then
  gap "too-thin" "only $ROW_COUNT graded rows found (need >= 20) — the audit must enumerate every concrete requirement in the founding brief, not a summary"
else
  pass "$ROW_COUNT graded rows"
fi

# -- 3. MISSING rows must be resolved --------------------------------------------
MISSING_COUNT=$(grep -icE '\|[[:space:]]*MISSING[[:space:]]*\|' "$TRACE" || true)
HAS_RESOLUTION=false
if grep -qiE '^#+[[:space:]].*(gap resolution|resolution)' "$TRACE" && grep -qiE '0[[:space:]]+MISSING' "$TRACE"; then
  HAS_RESOLUTION=true
fi
if [[ "$MISSING_COUNT" -gt 0 && "$HAS_RESOLUTION" != "true" ]]; then
  gap "unresolved-missing" "$MISSING_COUNT MISSING row(s) with no Gap-resolution section asserting '0 MISSING' — close every gap (or record an explicit user-approved deferral) and append the resolution section"
elif [[ "$MISSING_COUNT" -gt 0 ]]; then
  pass "$MISSING_COUNT MISSING row(s) in audit tables, resolved per Gap-resolution section"
else
  pass "0 MISSING rows"
fi

# -- 4. PARTIAL rows need a gap register ------------------------------------------
PARTIAL_COUNT=$(grep -icE '\|[[:space:]]*PARTIAL' "$TRACE" || true)
if [[ "$PARTIAL_COUNT" -gt 0 ]] && ! grep -qiE '^#+[[:space:]].*(gap register|gap resolution)' "$TRACE"; then
  gap "partial-without-register" "$PARTIAL_COUNT PARTIAL row(s) but no Gap register/resolution section — every PARTIAL needs a proposed fix or explicit deferral"
elif [[ "$PARTIAL_COUNT" -gt 0 ]]; then
  pass "$PARTIAL_COUNT PARTIAL row(s), gap register present"
fi

# -- 5. placeholders --------------------------------------------------------------
if grep -qE '\[(TODO|TBD)\]|PLACEHOLDER' "$TRACE"; then
  gap "placeholder-text" "TRACEABILITY.md contains placeholder text ([TODO]/[TBD]/PLACEHOLDER)"
else
  pass "no placeholder text"
fi

validator_exit
