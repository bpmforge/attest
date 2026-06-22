#!/usr/bin/env bash
#
# run-coverage-loop.sh -- universal Ralph Wiggum coverage loop wrapper.
#
# Wraps validate-phase-gate.sh with iteration tracking, structured gap-list
# output, and 3-iteration cap with escalation. Replaces the orchestrator's
# subjective "is this done?" judgment with deterministic coverage facts.
#
# Usage:
#   run-coverage-loop.sh <phase> [project-root]
#
# Phases: phase-0..5 | onboard-deep | security-deep | feature | improve (cap 2)
#
# Behavior per call:
#   1. Run validate-phase-gate.sh <phase>
#   2. Read or initialize docs/work/COVERAGE_LOOP_<phase>_<date>.md
#   3. Append the iteration result (PASS or gap list)
#   4. Determine status:
#      - PASS  -> exit 0
#      - GAPS, iter < 3  -> exit 1 (orchestrator emits gap-fill HANDOFFs, then re-runs)
#      - GAPS, iter >= 3 -> exit 2 (orchestrator emits escalation block per RALPH_WIGGUM_LOOP)
#
# Each iteration the orchestrator runs:
#     ./scripts/validators/run-coverage-loop.sh <phase>
# After fixing flagged gaps, it runs the same command again. The script
# tracks iteration count automatically via the loop file.
#
# IMPORTANT: this is NOT a self-driving loop -- it's a coverage REPORTER that
# the orchestrator iterates manually. That keeps human-in-the-loop visibility
# and lets the orchestrator emit specialist HANDOFFs (which require LLM) for
# each gap-fill round.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

PHASE="${1:-}"
ROOT_ARG="${2:-}"
[[ -z "$PHASE" ]] && { echo "usage: $0 <phase> [project-root]" >&2; exit 2; }

ROOT="$(detect_project_root "$ROOT_ARG")"
DATE=$(date +%Y-%m-%d)
LOOP_FILE="$ROOT/docs/work/COVERAGE_LOOP_${PHASE}_${DATE}.md"
mkdir -p "$ROOT/docs/work"

# Scoped phases (feature/improve) get a tighter cap than full-phase loops
case "$PHASE" in
  feature|improve) CAP=2 ;;
  *)               CAP=3 ;;
esac

# Archive stale loop files from previous days so sessions never pay tokens
# re-reading dead loops (and the iteration counter never reads a stale file).
STALE=$(find "$ROOT/docs/work" -maxdepth 1 -name "COVERAGE_LOOP_${PHASE}_*.md" ! -name "COVERAGE_LOOP_${PHASE}_${DATE}.md" 2>/dev/null || true)
if [[ -n "$STALE" ]]; then
  mkdir -p "$ROOT/docs/work/archive"
  while IFS= read -r sf; do
    [[ -n "$sf" ]] && mv "$sf" "$ROOT/docs/work/archive/$(basename "$sf")"
  done <<< "$STALE"
  echo "[run-coverage-loop] archived $(echo "$STALE" | wc -l | tr -d ' ') stale loop file(s) to docs/work/archive/"
fi

# Read current iteration from loop file (or 0 if new)
ITER=0
if [[ -f "$LOOP_FILE" ]]; then
  # grep -c outputs "0" and exits 1 when no matches; we use wc -l instead
  ITER=$(grep -E '^## Iteration ' "$LOOP_FILE" 2>/dev/null | wc -l | tr -d ' ')
  ITER="${ITER:-0}"
fi
ITER=$((ITER + 1))

# Initialize the loop file on first iteration
if [[ "$ITER" -eq 1 ]]; then
  cat > "$LOOP_FILE" <<EOF
# Coverage Loop — ${PHASE} — ${DATE}

**Project:** ${ROOT}
**Phase:** ${PHASE}
**Cap:** ${CAP} iterations before escalation

## Protocol

1. Run \`./scripts/validators/run-coverage-loop.sh ${PHASE}\` (this script).
2. If exit 0: phase gate clean — proceed to next phase.
3. If exit 1: gaps remain (iteration < cap). Read the gap list below; emit
   focused gap-fill HANDOFFs (one row per HANDOFF); run validators again.
4. If exit 2: cap reached with gaps remaining. Emit the
   escalation block from \`agents/shared/RALPH_WIGGUM_LOOP.md\` and stop.

EOF
fi

# Run the validator and capture JSON
JSON_LOG=$(mktemp -t "coverage.XXXXXX")
trap 'rm -f "$JSON_LOG"' EXIT

# validate-phase-gate.sh exits non-zero on gaps, but we MUST keep going to
# update the loop file. Temporarily disable -e for this invocation.
set +e
bash "$(dirname "${BASH_SOURCE[0]}")/validate-phase-gate.sh" "$PHASE" "$ROOT" > "$JSON_LOG" 2>&1
PHASE_RC=$?
set -e

# The validator prints its JSON envelope on the LAST stdout line; everything
# else is human-readable progress on stderr. We mixed them with 2>&1, so just
# extract the JSON line(s).
JSON_LINE=$(grep -E '^\{"validator":' "$JSON_LOG" | tail -1)

# Parse gap count
GAPS=0
if [[ -n "$JSON_LINE" ]]; then
  GAPS=$(echo "$JSON_LINE" | sed -nE 's/.*"gaps":([0-9]+).*/\1/p')
  GAPS="${GAPS:-0}"
fi

# Gap-checksum stall detection (no-progress kill) — loop-engineering guardrail.
# Iteration count alone can't tell "making progress" from "spinning". We checksum
# the exact gap set; if it is byte-identical to the previous iteration, the loop
# is not converging — halt early (exit 3) rather than burning the rest of the cap.
# Read the PREVIOUS iteration's checksum BEFORE we append this one.
PREV_CKSUM=$(grep -E '^<!-- gap-cksum: ' "$LOOP_FILE" 2>/dev/null | tail -1 | sed -nE 's/^<!-- gap-cksum: ([a-f0-9]+).*/\1/p' || true)
CKSUM=""
if [[ "$GAPS" -gt 0 && -n "$JSON_LINE" ]]; then
  CKSUM=$(printf '%s' "$JSON_LINE" | { md5 2>/dev/null || md5sum; } | awk '{print $NF}')
fi

# Append iteration to loop file
{
  echo ""
  echo "## Iteration ${ITER}"
  echo ""
  echo "**Timestamp:** $(date -Iseconds)"
  echo "**Validator exit:** ${PHASE_RC}"
  echo "**Gap count:** ${GAPS}"
  echo ""
  if [[ "$GAPS" -eq 0 ]]; then
    echo "**Status:** ✅ CLEAN — phase gate passed."
  else
    echo "**Status:** ⏳ GAPS REMAINING"
    echo ""
    echo "### Gap list"
    echo ""
    echo '```json'
    echo "$JSON_LINE"
    echo '```'
    echo ""
    echo "### Human-readable trace"
    echo ""
    echo '```'
    grep -E '^\s*\[x\]' "$JSON_LOG" | head -50
    echo '```'
  fi
} >> "$LOOP_FILE"

# Record this iteration's gap checksum so the NEXT run can detect no-progress.
[[ -n "$CKSUM" ]] && echo "<!-- gap-cksum: ${CKSUM} iter=${ITER} -->" >> "$LOOP_FILE"

# Decide exit code
if [[ "$GAPS" -eq 0 ]]; then
  echo "[run-coverage-loop] ${PHASE} CLEAN at iteration ${ITER} -- see ${LOOP_FILE#"$ROOT/"}"
  exit 0
fi

# No-progress kill: identical gap set two iterations running (and not the first
# pass) means the gap-fill HANDOFFs are not moving the needle. Halt now.
if [[ "$ITER" -gt 1 && -n "$CKSUM" && "$CKSUM" == "$PREV_CKSUM" ]]; then
  echo "[run-coverage-loop] ${PHASE} NO-PROGRESS HALT (gap set unchanged since iteration $((ITER-1)), ${GAPS} gap(s) remain)"
  echo "  loop file: ${LOOP_FILE#"$ROOT/"}"
  echo "  the same rows keep failing — the inventory, validator, or gap-fill strategy is wrong."
  echo "  emit the escalation block from agents/shared/RALPH_WIGGUM_LOOP.md (do NOT iterate again)."
  exit 3
fi

if [[ "$ITER" -ge "$CAP" ]]; then
  echo "[run-coverage-loop] ${PHASE} ESCALATION (${CAP} iterations exhausted, ${GAPS} gap(s) remain)"
  echo "  loop file: ${LOOP_FILE#"$ROOT/"}"
  echo "  emit the escalation block from agents/shared/RALPH_WIGGUM_LOOP.md"
  exit 2
fi

echo "[run-coverage-loop] ${PHASE} iteration ${ITER}/${CAP} — ${GAPS} gap(s) remain"
echo "  loop file: ${LOOP_FILE#"$ROOT/"}"
echo "  emit gap-fill HANDOFFs for each row, then re-run this script"
exit 1
