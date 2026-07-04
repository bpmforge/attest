#!/usr/bin/env bash
#
# validate-contract-conformance.sh -- live app vs frozen openapi spec (O2.5).
#
# Wraps scripts/contract-conformance.mjs. Requires the app already booted by the
# RUNTIME step; take the base URL from --base-url or $APP_BASE_URL. SKIPs cleanly
# (exit 0) when there is no openapi spec or no base URL -- it is a live gate, not
# a static one. Every probed GET endpoint must return a declared 2xx with its
# required JSON response fields present; drift (spec route missing from the app)
# is a gap.
#
# Usage: validate-contract-conformance.sh [project-root] [--base-url URL] [--spec PATH]
# Exit 0 clean/SKIP · 1 gaps · 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-contract-conformance"

ROOT="$(detect_project_root "${1:-}")"
HELPER="$(dirname "${BASH_SOURCE[0]}")/../contract-conformance.mjs"

# base url + spec from flags/env
BASE=""; SPEC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE="$2"; shift 2 ;;
    --spec) SPEC="$2"; shift 2 ;;
    *) shift ;;
  esac
done
BASE="${BASE:-${APP_BASE_URL:-}}"

if ! command -v node >/dev/null 2>&1; then note "node not found -- skipping"; validator_exit; exit $?; fi
if [[ ! -f "$HELPER" ]]; then note "helper not found -- skipping"; validator_exit; exit $?; fi

# locate a spec if not given
if [[ -z "$SPEC" ]]; then
  for cand in "$ROOT/openapi.yaml" "$ROOT/openapi.json" "$ROOT/docs/api/openapi.yaml" "$ROOT/docs/api/openapi.json" "$ROOT/docs/design/openapi.yaml"; do
    [[ -f "$cand" ]] && { SPEC="$cand"; break; }
  done
fi
if [[ -z "$SPEC" || ! -f "$SPEC" ]]; then note "no openapi spec found -- nothing to check (SKIP)"; validator_exit; exit $?; fi
if [[ -z "$BASE" ]]; then note "no --base-url / APP_BASE_URL (app not booted) -- SKIP"; validator_exit; exit $?; fi

while IFS= read -r line; do
  case "$line" in
    SKIP:*) note "${line#SKIP: }" ;;
    \{*) gap "contract-drift" "$(printf '%s' "$line")" ;;
  esac
done < <(node "$HELPER" --spec "$SPEC" --base-url "$BASE" 2>/dev/null)

note "checked live conformance of $SPEC against $BASE"
validator_exit
