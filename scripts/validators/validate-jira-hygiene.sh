#!/usr/bin/env bash
#
# validate-jira-hygiene.sh -- Jira MIRROR hygiene gate (offline-safe).
#
# Active ONLY when a Jira backend is configured (TRACKER_BACKEND=jira, or =auto
# with JIRA_BASE_URL set). A project not using Jira is skipped clean -- this
# gate never fires for the plan.json-only path, so wiring it into the phase
# chain is safe for every project.
#
# Checks (via scripts/lib/jira-hygiene.mjs -- no live Jira, CI-safe):
#   - pending-mirror : lifecycle ops queued in docs/work/jira-outbox.jsonl that
#     were never applied to Jira (work advanced, mirror deferred) -> run
#     'jira.sh reconcile'.
#   - unsynced-module: a module that is claimed/in_progress/in_review/done but
#     carries no jira_key -> it was never synced ('jira.sh sync-plan').
# The LIVE drift checks (epic open with all children done, in-progress issue
# with no assignee, split-grab) require the Jira API and live in 'jira.sh
# doctor'; this gate stays runnable with no network.
#
# Usage: validate-jira-hygiene.sh [project-root] [plan.json]
# Exit 0 clean/skipped / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-jira-hygiene"

ROOT="$(detect_project_root "${1:-}")"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/jira-hygiene.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot validate jira hygiene"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "jira-hygiene.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi

PLAN="${2:-}"
if [[ -z "$PLAN" ]]; then
  if [[ -f "$ROOT/docs/work/plan.json" ]]; then PLAN="$ROOT/docs/work/plan.json"
  elif [[ -f "$ROOT/examples/tickets-plan.sample.json" ]]; then PLAN="$ROOT/examples/tickets-plan.sample.json"
  fi
fi

if [[ -z "$PLAN" || ! -f "$PLAN" ]]; then
  note "no plan.json found (checked docs/work/plan.json, examples/) -- nothing to check"
  validator_exit; exit $?
fi

if ! grep -q '"kind"[[:space:]]*:[[:space:]]*"module"' "$PLAN"; then
  note "plan $PLAN has no module tickets -- nothing to check"
  validator_exit; exit $?
fi

rel="${PLAN#"$ROOT"/}"

# jira-hygiene.mjs prints "[x] <cat>\t<detail>" per gap; only [x]-marked lines
# are trusted (same convention as validate-ticket-hygiene.sh).
while IFS= read -r line; do
  case "$line" in
    *"skip — no Jira backend configured"*)
      note "no Jira backend configured (TRACKER_BACKEND) -- skipped clean"
      ;;
    *"[x]"*)
      rest="${line#*\[x\] }"
      cat="${rest%%$'\t'*}"
      det="${rest#*$'\t'}"
      gap "$cat" "${rel}: ${det}"
      ;;
  esac
done < <(node "$LIB" "$PLAN" 2>&1)

note "audited jira mirror hygiene in $rel"
validator_exit
