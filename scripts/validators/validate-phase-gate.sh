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
#   feature        -- Scoped: changed files on branch all covered by reviews
#   improve        -- Scoped: every audit synthesized into IMPROVEMENT_BACKLOG
#
# Exits 0 if every relevant validator passes, 1 otherwise. Aggregated JSON
# gap list on stdout.
#
# Gate receipts (T27.1): a clean gate writes docs/work/gates/<phase>-receipt.json
# instead of a bare timestamp lock. The receipt records exactly what ran (every
# validator's name, exit code, gap count), the phase's file list, and a content
# hash of those files -- so a later prereq check can tell a real pass from a
# touched/fabricated one, and detect when the underlying docs or the gate's own
# validator set have changed since the receipt was minted. See
# check_phase_prereq() below for the read side.

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
GATES_DIR="$ROOT/docs/work/gates"

# -- Pure lookup: populate GATE_FILES / GATE_VALIDATORS for a given phase ---
# No side effects (no prereq checks, no gap/pass emission beyond the UX-gate
# and phase-4 UI-bearing notes below, which reflect real repo state, not the
# CURRENT run's outcome). Called both for the phase actually being run AND,
# in-process, by check_phase_prereq() to ask "what SHOULD the prior phase's
# validator set be right now" -- so drift between an old receipt and the
# gate's current definition is detectable.
declare -a GATE_VALIDATORS
declare -a GATE_FILES

populate_phase_artifacts() {
  local phase="$1"
  GATE_FILES=()
  GATE_VALIDATORS=()
  case "$phase" in
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
        "validate-requirements-matrix.sh"
      )
      ;;
    phase-3)
      GATE_FILES=("docs/MODULE_DESIGN.md" "docs/ARCHITECTURE.md" "docs/API_DESIGN.md" "docs/api/openapi.yaml" "docs/TECH_STACK.md" "docs/THREAT_MODEL.md" "docs/SECURITY_CONTROLS.md" "docs/INFRASTRUCTURE.md")
      GATE_VALIDATORS=(
        "validate-module-design.sh"
        "validate-flows.sh"
        "validate-design-tokens.sh"
        "validate-circular-deps.sh"
        "validate-module-boundaries-transitive.sh"
        "validate-infrastructure.sh"
        "validate-observability.sh"
        "validate-data-governance.sh"
        "validate-resilience-patterns.sh"
        "validate-architecture.sh"
        "validate-api-coverage.sh"
        "validate-sequence-coverage.sh"
        "validate-erd-coverage.sh"
        "validate-no-ascii-art.sh"
        "validate-mermaid.sh"
        "validate-doc-render-health.sh"
        "validate-c3-coverage.sh"
        "validate-entry-points.sh"
        "validate-tech-stack.sh"
        "validate-adrs.sh"
        "validate-security-controls.sh"
        # T29.5: an ADR/design doc asserting an unverified external rationale
        # (compliance/supply-chain/legal/vendor mandate) must not clear Phase
        # 3 -- wired here (not just Phase 5) so the design doc is not
        # considered final while an external claim is still unverified.
        "validate-challenger-gate.sh"
        # T29.6: spec-before-backlog -- a project generating its backlog into
        # an external tracker must record docs/TRACKER_DATA_MODEL.md BEFORE
        # docs/work/tracker-snapshot.json exists. No-op for projects using
        # only this repo's own plan.json (see validate-tickets.sh, phase-4).
        "validate-tracker-integrity.sh"
      )
      # UX gate is UNCONDITIONAL: validate-ux-spec.sh passes only when UX docs
      # exist OR ARCHITECTURE.md explicitly declares "No UI — UX branch not
      # applicable". Previously this only ran when DESIGN_PRINCIPLES.md already
      # existed — circular, so a missed UI-bearing detection silently skipped
      # the UX branch (RetroForge lesson, 2026-07-06).
      GATE_VALIDATORS+=("validate-ux-spec.sh")
      # Founding-brief coverage: docs/TRACEABILITY.md must grade every original
      # spec requirement against the doc set + tickets before implementation.
      GATE_VALIDATORS+=("validate-spec-traceability.sh")
      ;;
    phase-3.5)
      # Test design gate -- non-blocking style (coverage loop escalation, not hard block)
      GATE_VALIDATORS=(
        "validate-test-design.sh"
      )
      ;;
    phase-4)
      # Implementation gate -- build + lint + tests + test mapping + migrations
      # + IaC scaffolding + module boundary enforcement.
      GATE_VALIDATORS=(
        "validate-build.sh"
        "validate-lint.sh"
        "validate-tests.sh"
        "validate-tests-mapping.sh"
        "validate-e2e-setup.sh"
        "validate-migrations.sh"
        "validate-iac.sh"
        "validate-module-boundaries.sh"
        "validate-api-consistency.sh"
        "validate-code-health.sh"
        "validate-dead-code.sh"
        "validate-file-size.sh"
        "validate-tickets.sh"
        "validate-ticket-hygiene.sh"
        # T29.6: once a backlog snapshot exists, item-level integrity
        # (unlabeled items, unlinked stories, untagged strays polluting
        # scope math) -- the external-tracker analog of validate-tickets.sh
        # above, which only covers the internal plan.json layer.
        "validate-tracker-integrity.sh"
        # Per-ticket adversarial check: a FIX_BACKLOG with HIGH/CRITICAL findings
        # must have a matching CHALLENGE_REPORT with no unresolved CONTRADICTED
        # verdicts before the module gate passes (G1 — was only at phase-3/phase-5,
        # so a coding-wave backlog got remediated with no veracity check).
        "validate-challenger-gate.sh"
      )
      # UI-bearing: validate design system was implemented
      if [[ -f "$ROOT/docs/design/UX_SPEC.md" ]]; then
        GATE_VALIDATORS+=("validate-design-system.sh" "validate-wcag-coverage.sh")
      fi
      ;;
    phase-5)
      GATE_FILES=()
      # Phase 5 release gate -- operational + completeness + code-health + release-readiness
      GATE_VALIDATORS=(
        "validate-build.sh"
        "validate-lint.sh"
        "validate-tests.sh"
        "validate-deps.sh"
        "validate-smoke.sh"
        "validate-fix-backlog-closed.sh"
        "validate-challenger-gate.sh"
        "validate-model-pins.sh"
        "validate-code-health.sh"
        "validate-dead-code.sh"
        "validate-module-boundaries.sh"
        "validate-api-consistency.sh"
        "validate-contract-conformance.sh"
        "validate-release-readiness.sh"
        # T29.2 (H1/A-6.3): REQUIREMENT closure, not task closure -- a plan
        # with every module "done" still fails here if a user story was
        # never mapped to a module, or the mandatory reconciliation matrix
        # is missing/incomplete/OUTSTANDING. Skips cleanly when the
        # stories[] layer isn't adopted (additive, not retroactive).
        "validate-requirement-closure.sh"
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
        "validate-mermaid.sh"
        "validate-doc-render-health.sh"
      )
      ;;
    security-deep)
      GATE_VALIDATORS=("validate-owasp.sh")
      ;;
    feature)
      GATE_VALIDATORS=("validate-feature-coverage.sh")
      ;;
    improve)
      GATE_VALIDATORS=("validate-improve-coverage.sh")
      ;;
    *)
      fatal "unknown phase: $phase"
      ;;
  esac
}

# -- Prereq chain: which phase must have a valid receipt before this one runs
prereq_for_phase() {
  case "$1" in
    phase-1) echo "phase-0" ;;
    phase-2) echo "phase-1" ;;
    phase-3) echo "phase-2" ;;
    phase-3.5) echo "phase-3" ;;
    phase-4) echo "phase-3.5" ;;
    phase-5) echo "phase-4" ;;
    *) echo "" ;;
  esac
}

# -- Verify the prior phase's receipt, not just that a file exists ----------
# A receipt is either:
#   mode "real"   -- written by a genuine validate-phase-gate.sh run: verified
#                    by recomputing the current input-file hash (catches docs
#                    changing since) and confirming every validator this repo
#                    CURRENTLY requires for that phase appears in the receipt
#                    with exitCode 0 / gaps 0 (catches the gate's own
#                    definition growing new validators since the receipt was
#                    minted).
#   mode "waiver" -- written by scripts/waive-gate.sh, requires a non-empty,
#                    non-generic signedBy. Existing-project adoption goes
#                    through a real gate run or an explicit, visible waiver --
#                    never silent minting from mere file existence.
# No "or create the lock/receipt manually" escape hatch -- that invited the
# exact gap this ticket closes.
check_phase_prereq() {
  local prior_phase="$1"
  local receipt_file="$GATES_DIR/${prior_phase}-receipt.json"

  if [[ ! -f "$receipt_file" ]]; then
    gap "phase-ordering" "Gate ${prior_phase} has no receipt — run validate-phase-gate.sh ${prior_phase} first, or scripts/waive-gate.sh ${prior_phase} \"<reason>\" --signed-by <you> for an explicit, visible waiver"
    return
  fi

  local receipt
  receipt="$(cat "$receipt_file")"
  local mode
  mode="$(printf '%s' "$receipt" | sed -nE 's/.*"mode":"([a-zA-Z]*)".*/\1/p')"

  if [[ "$mode" == "waiver" ]]; then
    local signed_by signed_by_norm
    signed_by="$(printf '%s' "$receipt" | sed -nE 's/.*"signedBy":"([^"]*)".*/\1/p')"
    # Same normalization as waive-gate.sh's own check — must match exactly,
    # or a receipt written by one and read by the other could disagree.
    # Independent review (2026-07-07): the original case-sensitive blocklist
    # was trivially bypassed by casing/whitespace alone (confirmed live).
    signed_by_norm="$(printf '%s' "$signed_by" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    case "$signed_by_norm" in
      "" | agent | claude | ai | assistant | system | bot | llm | gpt | model | opencode)
        gap "phase-ordering" "${prior_phase} waiver receipt has no valid human signedBy (\"${signed_by}\") — waivers must be explicitly signed by a person, not an agent"
        ;;
      *)
        pass "prereq ${prior_phase}: explicit waiver signed by ${signed_by}"
        ;;
    esac
    return
  fi

  if [[ "$mode" != "real" ]]; then
    gap "phase-ordering" "${prior_phase} receipt has an unrecognized or missing mode — not a valid gate pass"
    return
  fi

  # Recompute the phase's CURRENT canonical files+validators to compare
  # against what the receipt actually recorded. Save/restore this run's own
  # GATE_FILES/GATE_VALIDATORS since populate_phase_artifacts mutates them.
  local saved_files=("${GATE_FILES[@]:-}")
  local saved_validators=("${GATE_VALIDATORS[@]:-}")
  populate_phase_artifacts "$prior_phase"

  local current_hash receipt_hash
  current_hash="$(sha256_of_paths "$ROOT" "${GATE_FILES[@]:-}")"
  receipt_hash="$(printf '%s' "$receipt" | sed -nE 's/.*"inputTreeHash":"([a-f0-9]*)".*/\1/p')"

  if [[ "$current_hash" != "$receipt_hash" ]]; then
    gap "phase-ordering" "${prior_phase} receipt is stale — its input files changed since the gate ran; re-run validate-phase-gate.sh ${prior_phase}"
  else
    local missing="" v
    for v in "${GATE_VALIDATORS[@]:-}"; do
      [[ -z "$v" ]] && continue
      if ! printf '%s' "$receipt" | grep -qF "\"name\":\"${v}\",\"exitCode\":0,\"gaps\":0"; then
        missing="${missing} ${v}"
      fi
    done
    if [[ -n "$missing" ]]; then
      gap "phase-ordering" "${prior_phase} receipt is incomplete — missing a clean run of:${missing} (added to the gate since this receipt was minted, or it never passed)"
    else
      pass "prereq ${prior_phase} receipt verified (hash + validator set match)"
    fi
  fi

  GATE_FILES=("${saved_files[@]}")
  GATE_VALIDATORS=("${saved_validators[@]}")
}

# -- Resolve this run's phase artifacts + prereq -----------------------------
populate_phase_artifacts "$PHASE"
PREREQ="$(prereq_for_phase "$PHASE")"
if [[ -n "$PREREQ" ]]; then
  check_phase_prereq "$PREREQ"
fi

# -- Check required files exist ---------------------------------------------
for f in "${GATE_FILES[@]:-}"; do
  [[ -z "$f" ]] && continue
  if ! file_exists_nonempty "$ROOT/$f"; then
    gap "missing-file" "$f (required for $PHASE)"
  else
    pass "$f present"
  fi
done

# -- Run chained validators, capturing structured results for the receipt ---
VALIDATOR_RESULTS=""
for v in "${GATE_VALIDATORS[@]:-}"; do
  [[ -z "$v" ]] && continue
  script="$VALIDATORS_DIR/$v"
  if [[ ! -x "$script" && ! -f "$script" ]]; then
    gap "missing-validator" "$v not found in $VALIDATORS_DIR"
    continue
  fi

  printf '\n%s-- running %s --%s\n' "$_BOLD" "$v" "$_RESET" >&2
  _stderr_tmp="$(mktemp)"
  set +e
  json=$(bash "$script" "$ROOT" 2>"$_stderr_tmp")
  v_exit=$?
  set -e
  cat "$_stderr_tmp" >&2
  rm -f "$_stderr_tmp"

  sub_gaps=$(printf '%s' "$json" | sed -nE 's/.*"gaps":([0-9]+).*/\1/p')
  sub_gaps="${sub_gaps:-0}"
  if [[ "$v_exit" -eq 0 && "$sub_gaps" -eq 0 ]]; then
    pass "$v clean"
  else
    gap "sub-validator-failed" "$v reported $sub_gaps gap(s) (exit $v_exit)"
  fi

  if [[ -z "$VALIDATOR_RESULTS" ]]; then
    VALIDATOR_RESULTS="{\"name\":\"${v}\",\"exitCode\":${v_exit},\"gaps\":${sub_gaps}}"
  else
    VALIDATOR_RESULTS="${VALIDATOR_RESULTS},{\"name\":\"${v}\",\"exitCode\":${v_exit},\"gaps\":${sub_gaps}}"
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

# -- Write phase gate receipt on clean gate (T27.1) --------------------------
# Only written when GAP_COUNT is genuinely zero. Records exactly what ran so
# a later prereq check verifies substance, not presence.
if [[ "$GAP_COUNT" -eq 0 ]]; then
  mkdir -p "$GATES_DIR"
  RECEIPT_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  RECEIPT_HASH="$(sha256_of_paths "$ROOT" "${GATE_FILES[@]:-}")"

  FILES_JSON=""
  for f in "${GATE_FILES[@]:-}"; do
    [[ -z "$f" ]] && continue
    if [[ -z "$FILES_JSON" ]]; then FILES_JSON="\"${f}\""; else FILES_JSON="${FILES_JSON},\"${f}\""; fi
  done

  printf '{"phase":"%s","timestamp":"%s","mode":"real","inputTreeHash":"%s","validators":[%s],"filesChecked":[%s]}\n' \
    "$PHASE" "$RECEIPT_TS" "$RECEIPT_HASH" "$VALIDATOR_RESULTS" "$FILES_JSON" \
    > "$GATES_DIR/${PHASE}-receipt.json"
  pass "gate receipt written: docs/work/gates/${PHASE}-receipt.json"
fi

validator_exit
