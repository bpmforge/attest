#!/usr/bin/env bash
#
# detect-sdlc-state.sh -- scan an existing project to determine SDLC phase
# completion status. Produces docs/work/SDLC_AUDIT.md.
#
# T27.1: this script is READ-ONLY with respect to gate state -- it reports
# which phases have a real receipt (docs/work/gates/<phase>-receipt.json,
# written only by a genuine validate-phase-gate.sh run or an explicit
# scripts/waive-gate.sh) and which phases merely have their files present but
# no receipt. It never mints a receipt from file existence — that retroactive-
# minting behavior was removed; it was the exact mechanism behind the
# 2026-07-07 ticket-hygiene incident (a phase counted as "passed" because its
# docs happened to exist, not because any validator ever ran against them).
#
# Usage:
#   ./scripts/detect-sdlc-state.sh [project-root]
#
# Exit codes:
#   0 -- fresh project (no artifacts, no src/) -- run /sdlc init from Phase 0
#   1 -- partial SDLC work -- some phases complete, run from lowest incomplete
#   2 -- brownfield (src/ has code, no SDLC docs) -- run /sdlc onboard first
#   3 -- all phases complete -- nothing to do
#
# Output:
#   docs/work/SDLC_AUDIT.md  -- human-readable phase status report (files
#     present vs. missing, AND receipted vs. needs-a-real-gate-run)
#   stdout: JSON summary {"status":"partial","lowest_incomplete":"phase-2",...}
#

set -euo pipefail

# -- Resolve project root -----------------------------------------------------
if [[ -n "${PROJECT_ROOT:-}" ]]; then
  ROOT="$PROJECT_ROOT"
elif [[ -n "${1:-}" && -d "${1:-}" ]]; then
  ROOT="$(cd "$1" && pwd)"
else
  ROOT="$(pwd)"
fi

WORK_DIR="$ROOT/docs/work"
GATES_DIR="$WORK_DIR/gates"
AUDIT_FILE="$WORK_DIR/SDLC_AUDIT.md"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

mkdir -p "$WORK_DIR" "$GATES_DIR"

# -- Phase artifact definitions -----------------------------------------------
# Each phase: space-separated list of required files (relative to ROOT)

PHASE_0_FILES="docs/VISION.md docs/COMPETITIVE_ANALYSIS.md"
PHASE_1_FILES="docs/SCOPE.md docs/RISKS.md docs/CONSTRAINTS.md docs/USER_PERSONAS.md"
PHASE_2_FILES="docs/SRS.md docs/USER_STORIES.md docs/USE_CASES.md"
PHASE_3_FILES="docs/MODULE_DESIGN.md docs/ARCHITECTURE.md docs/API_DESIGN.md docs/TECH_STACK.md docs/THREAT_MODEL.md docs/SECURITY_CONTROLS.md docs/INFRASTRUCTURE.md"
PHASE_35_FILES="docs/testing/TEST_DESIGN.md"
PHASE_4_FILES="src"  # Phase 4 = code exists; check for src/ or app/ directory
PHASE_5_FILES="docs/reviews/FIX_BACKLOG_RELEASE"  # Phase 5 = release backlog closed

declare -a PHASE_NAMES=("phase-0" "phase-1" "phase-2" "phase-3" "phase-3.5" "phase-4" "phase-5")
declare -a PHASE_LABELS=("Phase 0 (Ideation)" "Phase 1 (Planning)" "Phase 2 (Requirements)" "Phase 3 (Design)" "Phase 3.5 (Test Design)" "Phase 4 (Implementation)" "Phase 5 (Release)")

# -- Check function: returns "COMPLETE", "INCOMPLETE", or "NOT_STARTED" -------
check_phase() {
  local phase="$1"
  local file_list="$2"

  local found=0
  local missing=0
  local missing_list=""

  for f in $file_list; do
    local full="$ROOT/$f"
    # For directories (like src/), just check existence
    if [[ "$f" == "src" ]]; then
      if [[ -d "$ROOT/src" || -d "$ROOT/app" || -d "$ROOT/lib" ]]; then
        found=$((found + 1))
      else
        missing=$((missing + 1))
        missing_list="$missing_list src/"
      fi
    elif [[ -f "$full" && -s "$full" ]]; then
      found=$((found + 1))
    else
      # For phase 5, use a pattern check
      if [[ "$f" == *"FIX_BACKLOG_RELEASE"* ]]; then
        if find "$ROOT/docs/reviews" -name "FIX_BACKLOG_RELEASE*" 2>/dev/null | grep -q .; then
          found=$((found + 1))
        else
          missing=$((missing + 1))
          missing_list="$missing_list FIX_BACKLOG_RELEASE"
        fi
      else
        missing=$((missing + 1))
        missing_list="$missing_list $(basename "$f")"
      fi
    fi
  done

  local total=$((found + missing))

  if [[ "$missing" -eq 0 ]]; then
    echo "COMPLETE"
  elif [[ "$found" -eq 0 ]]; then
    echo "NOT_STARTED"
  else
    echo "INCOMPLETE:$missing_list"
  fi
}

# -- Scan all phases ----------------------------------------------------------
# bash 3.2 (macOS stock) has no associative arrays -- PHASE_STATUS_VALS is a
# parallel indexed array aligned to PHASE_NAMES by position; phase_status()
# below does the by-name lookup with a linear scan (7 phases, negligible).
declare -a PHASE_STATUS_VALS=(
  "$(check_phase "phase-0" "$PHASE_0_FILES")"
  "$(check_phase "phase-1" "$PHASE_1_FILES")"
  "$(check_phase "phase-2" "$PHASE_2_FILES")"
  "$(check_phase "phase-3" "$PHASE_3_FILES")"
  "$(check_phase "phase-3.5" "$PHASE_35_FILES")"
  "$(check_phase "phase-4" "$PHASE_4_FILES")"
  "$(check_phase "phase-5" "$PHASE_5_FILES")"
)

phase_status() {
  local want="$1" i
  for i in "${!PHASE_NAMES[@]}"; do
    [[ "${PHASE_NAMES[$i]}" == "$want" ]] && { printf '%s' "${PHASE_STATUS_VALS[$i]}"; return; }
  done
}

# -- Detect brownfield --------------------------------------------------------
# Brownfield: src/ exists but no SDLC docs at all
HAS_CODE=false
HAS_ANY_SDLC=false

[[ -d "$ROOT/src" || -d "$ROOT/app" || -d "$ROOT/lib" ]] && HAS_CODE=true
[[ -f "$ROOT/docs/VISION.md" || -f "$ROOT/docs/SRS.md" || -f "$ROOT/docs/ARCHITECTURE.md" ]] && HAS_ANY_SDLC=true

# -- Report which phases have a real gate receipt (T27.1) -------------------
# This script SCANS and REPORTS only — it never mints a lock/receipt from
# file existence. That retroactive-minting path was the exact mechanism
# behind the 2026-07-07 ticket-hygiene incident (a phase "passing" because
# its docs happened to exist, not because its validators ever ran). Existing-
# project adoption goes through a real `validate-phase-gate.sh <phase>` run,
# or an explicit, visible `scripts/waive-gate.sh <phase> "<reason>" --signed-by
# <you>` — never silently, and never as a side effect of this scan.
RECEIPTED=""
FILES_COMPLETE_NO_RECEIPT=""
for phase in "${PHASE_NAMES[@]}"; do
  status="$(phase_status "$phase")"
  receipt_file="$GATES_DIR/${phase}-receipt.json"
  if [[ -f "$receipt_file" ]]; then
    RECEIPTED="$RECEIPTED $phase"
  elif [[ "$status" == "COMPLETE" ]]; then
    FILES_COMPLETE_NO_RECEIPT="$FILES_COMPLETE_NO_RECEIPT $phase"
  fi
done

# -- Find lowest incomplete phase ---------------------------------------------
LOWEST_INCOMPLETE=""
ALL_COMPLETE=true

for phase in "phase-0" "phase-1" "phase-2" "phase-3" "phase-3.5" "phase-4" "phase-5"; do
  status="$(phase_status "$phase")"
  if [[ "$status" != "COMPLETE" ]]; then
    ALL_COMPLETE=false
    if [[ -z "$LOWEST_INCOMPLETE" ]]; then
      LOWEST_INCOMPLETE="$phase"
    fi
  fi
done

# -- Determine overall status -------------------------------------------------
OVERALL_STATUS=""
RECOMMENDATION=""

if [[ "$ALL_COMPLETE" == "true" ]]; then
  OVERALL_STATUS="complete"
  RECOMMENDATION="All phases appear complete. Run /sdlc gate to verify the final gate."

elif [[ "$HAS_CODE" == "true" && "$HAS_ANY_SDLC" == "false" ]]; then
  OVERALL_STATUS="brownfield"
  RECOMMENDATION="Existing codebase detected with no SDLC documentation. Run /sdlc onboard to document the existing system and fill the SDLC gaps."

elif [[ "$(phase_status phase-0)" == "NOT_STARTED" && "$(phase_status phase-1)" == "NOT_STARTED" ]]; then
  OVERALL_STATUS="fresh"
  RECOMMENDATION="No SDLC work found. Run /sdlc init to start from Phase 0."

else
  OVERALL_STATUS="partial"
  RECOMMENDATION="Partial SDLC work found. Lowest incomplete phase: $LOWEST_INCOMPLETE. Proceeding from there."
fi

# -- Write SDLC_AUDIT.md ------------------------------------------------------
{
  printf '# SDLC State Audit\n\n'
  printf '**Scanned:** %s\n' "$TIMESTAMP"
  printf '**Project root:** %s\n' "$ROOT"
  printf '**Status:** %s\n\n' "$OVERALL_STATUS"
  printf '## Phase Status\n\n'
  printf '| Phase | Status | Missing Artifacts |\n'
  printf '|-------|--------|------------------|\n'

  idx=0
  for phase in "${PHASE_NAMES[@]}"; do
    label="${PHASE_LABELS[$idx]}"
    status="$(phase_status "$phase")"

    if [[ "$status" == "COMPLETE" ]]; then
      printf '| %s | ✅ COMPLETE | — |\n' "$label"
    elif [[ "$status" == "NOT_STARTED" ]]; then
      printf '| %s | ❌ NOT STARTED | all |\n' "$label"
    else
      missing="${status#INCOMPLETE:}"
      printf '| %s | ⏳ INCOMPLETE | %s |\n' "$label" "$missing"
    fi
    idx=$((idx + 1))
  done

  printf '\n## Gate Receipts (T27.1)\n\n'
  printf 'This scan never creates a receipt — a receipt only exists if a real gate\n'
  printf 'run happened, or an explicit waiver was signed. It reports what it finds.\n\n'
  if [[ -n "$RECEIPTED" ]]; then
    printf -- '- Phases with a real receipt (real run or signed waiver):%s\n' "$RECEIPTED"
  fi
  if [[ -n "$FILES_COMPLETE_NO_RECEIPT" ]]; then
    printf -- '- Phases whose files look complete but have NO receipt (run the real gate, or waive explicitly):%s\n' "$FILES_COMPLETE_NO_RECEIPT"
    printf '  `validate-phase-gate.sh <phase>` or `scripts/waive-gate.sh <phase> "<reason>" --signed-by <you>`\n'
  fi
  if [[ -z "$RECEIPTED" && -z "$FILES_COMPLETE_NO_RECEIPT" ]]; then
    printf 'No phases complete yet.\n'
  fi

  printf '\n## Recommendation\n\n'
  printf '%s\n\n' "$RECOMMENDATION"

  if [[ "$OVERALL_STATUS" == "partial" ]]; then
    printf '### Skip list (phases to skip — already complete)\n\n'
    for phase in "${PHASE_NAMES[@]}"; do
      if [[ "$(phase_status "$phase")" == "COMPLETE" ]]; then
        printf -- '- %s\n' "$phase"
      fi
    done
    printf '\n### Resume point\n\nStart from: **%s**\n' "$LOWEST_INCOMPLETE"
  fi

  if [[ "$OVERALL_STATUS" == "brownfield" ]]; then
    printf '### Brownfield gap list\n\n'
    printf 'The following SDLC artifacts need to be produced (reverse-engineered from existing code):\n\n'
    for phase in "${PHASE_NAMES[@]}"; do
      if [[ "$(phase_status "$phase")" != "COMPLETE" ]]; then
        printf -- '- %s\n' "$phase"
      fi
    done
  fi
} > "$AUDIT_FILE"

# -- Emit JSON summary to stdout ----------------------------------------------
lowest_json="${LOWEST_INCOMPLETE:-none}"
receipted_json=$(printf '%s' "$RECEIPTED" | tr ' ' ',' | sed 's/^,//')
needs_receipt_json=$(printf '%s' "$FILES_COMPLETE_NO_RECEIPT" | tr ' ' ',' | sed 's/^,//')

printf '{"status":"%s","lowest_incomplete":"%s","brownfield":%s,"receipted_phases":"%s","complete_no_receipt":"%s","audit_file":"docs/work/SDLC_AUDIT.md"}\n' \
  "$OVERALL_STATUS" \
  "$lowest_json" \
  "$([ "$HAS_CODE" == "true" ] && echo true || echo false)" \
  "$receipted_json" \
  "$needs_receipt_json"

# -- Exit with appropriate code -----------------------------------------------
case "$OVERALL_STATUS" in
  fresh)      exit 0 ;;
  partial)    exit 1 ;;
  brownfield) exit 2 ;;
  complete)   exit 3 ;;
esac
