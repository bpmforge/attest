#!/usr/bin/env bash
#
# validate-status-freshness.sh -- flags a stale generated STATUS.md (T29.3,
# H7/C-1).
#
# Root cause this closes: generated project status artifacts (docs/work/
# STATUS.md, scripts/gen-status-report.mjs) can go stale the same way any
# generated view can -- work happens on plan.json (a module closes, a story
# closes) and nobody regenerates the artifact, so a human reads optimistic
# numbers that no longer match reality. This wraps
# `gen-status-report.mjs --check` (single source of truth:
# scripts/lib/status-report.mjs's checkStatusFreshness()), which flags stale
# on either (a) the embedded numbers mismatching a live recompute against the
# same plan.json, or (b) the plan having a work event newer than the
# artifact's generatedAt.
#
# Deliberately NOT chained into validate-phase-gate.sh's GATE_VALIDATORS --
# STATUS.md is a rolling dashboard artifact regenerated throughout
# development, not a phase-gate deliverable (same posture as
# validate-close-receipt.sh's "orthogonal axis" reasoning). The intended
# caller is the steward skill (`/steward audit` — see skills/steward/
# SKILL.md's staleness step) plus any session that wants a deterministic
# freshness check; kept as a standalone script (not chained) so it can still
# be run directly or wired into a project's own gate later.
#
# Skips cleanly when no plan.json or no STATUS.md exists yet -- nothing has
# been generated, so there is nothing to go stale.
#
# Usage: validate-status-freshness.sh [project-root]
# Exit 0 fresh (or nothing to check) / 1 stale / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-status-freshness"

ROOT="$(detect_project_root "${1:-}")"
GEN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GEN="$GEN_DIR/gen-status-report.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot check status freshness"
  validator_exit; exit $?
fi
if [[ ! -f "$GEN" ]]; then
  note "gen-status-report.mjs not found at $GEN -- nothing to check"
  validator_exit; exit $?
fi

PLAN=""
if [[ -f "$ROOT/docs/work/plan.json" ]]; then PLAN="$ROOT/docs/work/plan.json"
elif [[ -f "$ROOT/examples/tickets-plan.sample.json" ]]; then PLAN="$ROOT/examples/tickets-plan.sample.json"
fi
if [[ -z "$PLAN" || ! -f "$PLAN" ]]; then
  note "no plan.json found (checked docs/work/plan.json, examples/) -- nothing to check"
  validator_exit; exit $?
fi

STATUS="$ROOT/docs/work/STATUS.md"
if [[ ! -f "$STATUS" ]]; then
  note "no docs/work/STATUS.md found -- nothing generated yet, nothing to check"
  validator_exit; exit $?
fi

STORIES=""
[[ -f "$ROOT/docs/USER_STORIES.md" ]] && STORIES="$ROOT/docs/USER_STORIES.md"

rel="${STATUS#"$ROOT"/}"

while IFS= read -r line; do
  case "$line" in
    *"[x]"*) gap "status-stale" "${rel}: ${line#*\[x\] }" ;;
  esac
done < <(node "$GEN" "$PLAN" "$STORIES" "$STATUS" --check 2>&1)

note "checked freshness of $rel against $(basename "$PLAN")"
validator_exit
