#!/usr/bin/env bash
#
# jira.sh — thin wrapper over scripts/jira/jira.mjs (the Jira DC adapter).
# Parity with the jira.sh CLI used in opencode elsewhere. All logic lives in
# jira.mjs; this only locates node + the script and forwards args.
#
# Source of truth is plan.json ($PLAN_JSON, default docs/work/plan.json); Jira
# is a mirrored ledger. When Jira is not configured (no $JIRA_BASE_URL) the
# lifecycle verbs still run on plan.json — see jira.mjs graceful-fallback path.
#
# Config (env):
#   JIRA_BASE_URL   https://jira.company.com        (unset → adapter disabled)
#   JIRA_TOKEN      <personal access token>          (sent as Authorization: Bearer)
#   JIRA_PROJECT    PROJ
#   JIRA_FLAVOR     datacenter|cloud                 (default datacenter)
#   JIRA_CONFIG     path to jira.config.json         (optional field/name overrides)
#   TRACKER_BACKEND auto|jira|none                   (default auto)
#   PLAN_JSON       path to plan.json                (default docs/work/plan.json)
#
# Usage: jira.sh <verb> ...    (run with no args for the verb list)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$HERE/jira.mjs" "$@"
