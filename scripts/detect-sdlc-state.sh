#!/usr/bin/env bash
#
# detect-sdlc-state.sh -- scan an existing project to determine SDLC phase
# completion status. Produces docs/work/SDLC_AUDIT.md and retroactively
# creates phase gate lock files for fully-complete phases.
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
#   docs/work/SDLC_AUDIT.md  -- human-readable phase status report
#   docs/work/gates/phase-N-passed.lock  -- created for each complete phase
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
declare -A PHASE_STATUS
declare -A PHASE_MISSING

PHASE_STATUS["phase-0"]=$(check_phase "phase-0" "$PHASE_0_FILES")
PHASE_STATUS["phase-1"]=$(check_phase "phase-1" "$PHASE_1_FILES")
PHASE_STATUS["phase-2"]=$(check_phase "phase-2" "$PHASE_2_FILES")
PHASE_STATUS["phase-3"]=$(check_phase "phase-3" "$PHASE_3_FILES")
PHASE_STATUS["phase-3.5"]=$(check_phase "phase-3.5" "$PHASE_35_FILES")
PHASE_STATUS["phase-4"]=$(check_phase "phase-4" "$PHASE_4_FILES")
PHASE_STATUS["phase-5"]=$(check_phase "phase-5" "$PHASE_5_FILES")

# -- Detect brownfield --------------------------------------------------------
# Brownfield: src/ exists but no SDLC docs at all
HAS_CODE=false
HAS_ANY_SDLC=false

[[ -d "$ROOT/src" || -d "$ROOT/app" || -d "$ROOT/lib" ]] && HAS_CODE=true
[[ -f "$ROOT/docs/VISION.md" || -f "$ROOT/docs/SRS.md" || -f "$ROOT/docs/ARCHITECTURE.md" ]] && HAS_ANY_SDLC=true

# -- Retroactively create lock files for complete phases ----------------------
LOCKS_CREATED=""
for phase in "${PHASE_NAMES[@]}"; do
  status="${PHASE_STATUS[$phase]}"
  lock_file="$GATES_DIR/${phase}-passed.lock"
  if [[ "$status" == "COMPLETE" && ! -f "$lock_file" ]]; then
    echo "$TIMESTAMP (retroactive)" > "$lock_file"
    LOCKS_CREATED="$LOCKS_CREATED $phase"
  fi
done

# -- Find lowest incomplete phase ---------------------------------------------
LOWEST_INCOMPLETE=""
ALL_COMPLETE=true

for phase in "phase-0" "phase-1" "phase-2" "phase-3" "phase-3.5" "phase-4" "phase-5"; do
  status="${PHASE_STATUS[$phase]}"
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

elif [[ "${PHASE_STATUS[phase-0]}" == "NOT_STARTED" && "${PHASE_STATUS[phase-1]}" == "NOT_STARTED" ]]; then
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
    status="${PHASE_STATUS[$phase]}"

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

  printf '\n## Lock Files\n\n'
  if [[ -n "$LOCKS_CREATED" ]]; then
    printf 'Retroactively created locks for complete phases:%s\n' "$LOCKS_CREATED"
  else
    printf 'No new locks created (all complete phases already had locks, or none are complete).\n'
  fi

  printf '\n## Recommendation\n\n'
  printf '%s\n\n' "$RECOMMENDATION"

  if [[ "$OVERALL_STATUS" == "partial" ]]; then
    printf '### Skip list (phases to skip — already complete)\n\n'
    for phase in "${PHASE_NAMES[@]}"; do
      if [[ "${PHASE_STATUS[$phase]}" == "COMPLETE" ]]; then
        printf '- %s\n' "$phase"
      fi
    done
    printf '\n### Resume point\n\nStart from: **%s**\n' "$LOWEST_INCOMPLETE"
  fi

  if [[ "$OVERALL_STATUS" == "brownfield" ]]; then
    printf '### Brownfield gap list\n\n'
    printf 'The following SDLC artifacts need to be produced (reverse-engineered from existing code):\n\n'
    for phase in "${PHASE_NAMES[@]}"; do
      if [[ "${PHASE_STATUS[$phase]}" != "COMPLETE" ]]; then
        printf '- %s\n' "$phase"
      fi
    done
  fi
} > "$AUDIT_FILE"

# -- Emit JSON summary to stdout ----------------------------------------------
lowest_json="${LOWEST_INCOMPLETE:-none}"
locks_json=$(printf '%s' "$LOCKS_CREATED" | tr ' ' ',' | sed 's/^,//')

printf '{"status":"%s","lowest_incomplete":"%s","brownfield":%s,"locks_created":"%s","audit_file":"docs/work/SDLC_AUDIT.md"}\n' \
  "$OVERALL_STATUS" \
  "$lowest_json" \
  "$([ "$HAS_CODE" == "true" ] && echo true || echo false)" \
  "$locks_json"

# -- Exit with appropriate code -----------------------------------------------
case "$OVERALL_STATUS" in
  fresh)      exit 0 ;;
  partial)    exit 1 ;;
  brownfield) exit 2 ;;
  complete)   exit 3 ;;
esac
