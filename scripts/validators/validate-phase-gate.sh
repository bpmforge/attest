#!/usr/bin/env bash
#
# validate-phase-gate.sh -- orchestrator that runs all validators relevant to
# the current SDLC phase and aggregates their results.
#
# Usage:
#   validate-phase-gate.sh <phase> [project-root]
#
# Phases:
#   phase-0        -- Ideation (VISION, COMPETITIVE_ANALYSIS)
#   phase-1        -- Planning (SCOPE, RISKS, CONSTRAINTS, USER_PERSONAS)
#   phase-2        -- Requirements (SRS, USER_STORIES, USE_CASES)
#   phase-3        -- Design (ARCHITECTURE, API, DATABASE, THREAT_MODEL)
#   phase-4        -- Implementation (per-module RUNTIME reports)
#   phase-5        -- Release (FIX_BACKLOG closed, all reviews READY)
#   onboard-deep   -- Onboard deep mode (INVENTORY + ARCHITECTURE + ERD)
#   security-deep  -- Security deep mode (OWASP all 10 ≥ 7 + attack chains)
#
# Exits 0 if every relevant validator passes, 1 otherwise. Aggregated JSON
# gap list on stdout.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-phase-gate"

PHASE="${1:-}"
PROJECT_ROOT_ARG="${2:-}"
ROOT="$(detect_project_root "$PROJECT_ROOT_ARG")"

if [[ -z "$PHASE" ]]; then
  fatal "missing phase argument. Usage: validate-phase-gate.sh <phase> [project-root]"
fi

VALIDATORS_DIR="$(dirname "${BASH_SOURCE[0]}")"

# -- Phase → validator list -------------------------------------------------
declare -a GATE_VALIDATORS
declare -a GATE_FILES

case "$PHASE" in
  phase-0)
    GATE_FILES=("docs/VISION.md" "docs/COMPETITIVE_ANALYSIS.md")
    ;;
  phase-1)
    GATE_FILES=("docs/SCOPE.md" "docs/RISKS.md" "docs/CONSTRAINTS.md" "docs/USER_PERSONAS.md")
    ;;
  phase-2)
    GATE_FILES=("docs/SRS.md" "docs/USER_STORIES.md" "docs/USE_CASES.md")
    GATE_VALIDATORS=(
      "validate-use-cases.sh"
      "validate-user-stories.sh"
    )
    ;;
  phase-3)
    GATE_FILES=("docs/ARCHITECTURE.md" "docs/API_DESIGN.md" "docs/api/openapi.yaml" "docs/TECH_STACK.md")
    GATE_VALIDATORS=(
      "validate-architecture.sh"
      "validate-api-coverage.sh"
      "validate-sequence-coverage.sh"
      "validate-erd-coverage.sh"
      "validate-no-ascii-art.sh"
      "validate-c3-coverage.sh"
      "validate-entry-points.sh"
      "validate-tech-stack.sh"
      "validate-adrs.sh"
    )
    ;;
  phase-4)
    # Implementation gate -- the project must actually build, lint, and test,
    # AND have completeness coverage (tests mapped to use cases, migrations
    # documented).
    GATE_VALIDATORS=(
      "validate-build.sh"
      "validate-lint.sh"
      "validate-tests.sh"
      "validate-tests-mapping.sh"
      "validate-migrations.sh"
    )
    ;;
  phase-5)
    GATE_FILES=()
    # Phase 5 release gate -- operational validators + completeness validators run first
    GATE_VALIDATORS=(
      "validate-build.sh"
      "validate-lint.sh"
      "validate-tests.sh"
      "validate-deps.sh"
      "validate-smoke.sh"
      "validate-fix-backlog-closed.sh"
    )
    ;;
  onboard-deep)
    GATE_FILES=("docs/onboard/INVENTORY.md" "docs/ARCHITECTURE.md")
    GATE_VALIDATORS=(
      "validate-inventory.sh"
      "validate-architecture.sh"
      "validate-erd-coverage.sh"
      "validate-sequence-coverage.sh"
      "validate-no-ascii-art.sh"
    )
    ;;
  security-deep)
    GATE_VALIDATORS=("validate-owasp.sh")
    ;;
  *)
    fatal "unknown phase: $PHASE"
    ;;
esac

# -- Check required files exist ---------------------------------------------
for f in "${GATE_FILES[@]:-}"; do
  [[ -z "$f" ]] && continue
  if ! file_exists_nonempty "$ROOT/$f"; then
    gap "missing-file" "$f (required for $PHASE)"
  else
    pass "$f present"
  fi
done

# -- Run chained validators -------------------------------------------------
for v in "${GATE_VALIDATORS[@]:-}"; do
  [[ -z "$v" ]] && continue
  script="$VALIDATORS_DIR/$v"
  if [[ ! -x "$script" && ! -f "$script" ]]; then
    gap "missing-validator" "$v not found in $VALIDATORS_DIR"
    continue
  fi

  printf '\n%s-- running %s --%s\n' "$_BOLD" "$v" "$_RESET" >&2
  # Capture JSON stdout, let stderr pass through for user visibility
  if output=$(bash "$script" "$ROOT" 2>&1 >/dev/null); then
    # Re-run silently to capture JSON -- we already let the stderr show above
    json=$(bash "$script" "$ROOT" 2>/dev/null || true)
    sub_gaps=$(printf '%s' "$json" | sed -nE 's/.*"gaps":([0-9]+).*/\1/p')
    sub_gaps="${sub_gaps:-0}"
    if [[ "$sub_gaps" -eq 0 ]]; then
      pass "$v clean"
    else
      gap "sub-validator-failed" "$v reported $sub_gaps gap(s)"
    fi
  else
    # validator exited non-zero -- count as a gap
    json=$(bash "$script" "$ROOT" 2>/dev/null || true)
    sub_gaps=$(printf '%s' "$json" | sed -nE 's/.*"gaps":([0-9]+).*/\1/p')
    sub_gaps="${sub_gaps:-?}"
    gap "sub-validator-failed" "$v reported $sub_gaps gap(s)"
  fi
done

# -- Phase 5 release checks -------------------------------------------------
if [[ "$PHASE" == "phase-5" ]]; then
  # FIX_BACKLOG closed or waived
  backlog=$(find "$ROOT/docs/reviews" -type f -name 'FIX_BACKLOG_*.md' 2>/dev/null | head -1)
  if [[ -z "$backlog" ]]; then
    warn "no FIX_BACKLOG found -- skipping backlog check"
  else
    # Any row with [x] or FAIL?
    if grep -qE '([x]|FAIL|OPEN)' "$backlog"; then
      gap "open-backlog" "FIX_BACKLOG has open items: $backlog"
    else
      pass "FIX_BACKLOG clean: $backlog"
    fi
  fi

  # Every review verdict = APPROVED / READY / RELEASE-READY
  if [[ -d "$ROOT/docs/reviews" ]]; then
    while IFS= read -r review; do
      if ! grep -qE '(APPROVED|RELEASE-READY|READY|PASS)' "$review"; then
        gap "review-not-approved" "$(basename "$review") missing APPROVED/READY/PASS verdict"
      fi
    done < <(find "$ROOT/docs/reviews" -type f -name 'CODE_REVIEW_*.md' -o -name 'SECURITY_*.md' -o -name 'PERF_*.md' -o -name 'UX_*.md' 2>/dev/null)
  fi

  # RUNTIME gate
  if ! find "$ROOT/docs/reviews" -type f -name 'RUNTIME_*.md' 2>/dev/null | head -1 | grep -q .; then
    gap "no-runtime" "no RUNTIME_*.md report found -- runtime gate cannot pass"
  else
    while IFS= read -r r; do
      if ! grep -qE 'PASS' "$r"; then
        gap "runtime-not-pass" "$(basename "$r") does not show PASS verdict"
      fi
    done < <(find "$ROOT/docs/reviews" -type f -name 'RUNTIME_*.md' 2>/dev/null)
  fi
fi

validator_exit
