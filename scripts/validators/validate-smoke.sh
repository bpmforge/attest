#!/usr/bin/env bash
#
# validate-smoke.sh -- boot the project's server, hit known routes, assert 200.
#
# Requires .sdlc/sdlc.json configuration:
#   "smoke": {
#     "start":     "npm run dev",
#     "wait_url":  "http://localhost:3000/health",
#     "wait_secs": 30,
#     "routes":    ["/", "/api/health"]
#   }
#
# If no smoke config is present, exits clean with a warn (not every project
# has a HTTP surface). The orchestrator decides whether absence of smoke is
# a gap based on whether the project is server-bearing.
#
# Writes docs/reviews/RUNTIME_smoke_<date>.md with verdict + per-route status.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib_sdlc_config.sh"

validator_init "validate-smoke"

ROOT="$(detect_project_root "${1:-}")"
CFG="$ROOT/.sdlc/sdlc.json"

if [[ ! -f "$CFG" ]]; then
  warn "no .sdlc/sdlc.json — smoke check skipped (configure smoke.start + smoke.wait_url + smoke.routes to enable)"
  validator_exit
fi

# Pull smoke config (require jq or python3)
SMOKE_JSON=$(read_config_value "$ROOT" "smoke" || true)
if [[ -z "$SMOKE_JSON" ]]; then
  warn "no 'smoke' key in .sdlc/sdlc.json — smoke check skipped"
  validator_exit
fi

# Parse smoke fields
get_smoke_field() {
  local field="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg f "$field" '.smoke[$f] // empty' "$CFG" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, sys
try:
    with open('$CFG') as f: c = json.load(f)
    v = c.get('smoke', {}).get('$field')
    if v is None: sys.exit(0)
    if isinstance(v, list): print('\n'.join(v))
    else: print(v)
except Exception:
    sys.exit(1)
"
  fi
}

START=$(get_smoke_field "start")
WAIT_URL=$(get_smoke_field "wait_url")
WAIT_SECS=$(get_smoke_field "wait_secs")
[[ -z "$WAIT_SECS" ]] && WAIT_SECS=30
ROUTES=$(get_smoke_field "routes")

if [[ -z "$START" || -z "$WAIT_URL" || -z "$ROUTES" ]]; then
  gap "incomplete-smoke-config" "smoke config requires start, wait_url, routes"
  validator_exit
fi

note "smoke start='$START' wait_url='$WAIT_URL' wait_secs=$WAIT_SECS"

LOG=$(mktemp -t "smoke.XXXXXX")
trap 'rm -f "$LOG"; cleanup_server' EXIT

# Spawn the server in background
SERVER_PID=""
cleanup_server() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

(cd "$ROOT" && eval "$START") >"$LOG" 2>&1 &
SERVER_PID=$!

# Wait for the server to come up
note "waiting up to ${WAIT_SECS}s for $WAIT_URL"
WAITED=0
while (( WAITED < WAIT_SECS )); do
  if curl -fsS -o /dev/null --max-time 2 "$WAIT_URL"; then
    pass "server reachable at $WAIT_URL after ${WAITED}s"
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

if (( WAITED >= WAIT_SECS )); then
  gap "server-no-boot" "server did not respond at $WAIT_URL within ${WAIT_SECS}s"
  TAIL=$(tail -50 "$LOG")
  write_runtime_report "$ROOT" "smoke" "FAIL — server never came up" "$TAIL" >/dev/null
  cleanup_server
  validator_exit
fi

# Hit each route
ROUTE_REPORT=""
ALL_OK=1
HOST=$(echo "$WAIT_URL" | sed -E 's|^(https?://[^/]+).*|\1|')

while IFS= read -r route; do
  [[ -z "$route" ]] && continue
  url="${HOST}${route}"
  status=$(curl -fsS -o /dev/null --max-time 5 -w '%{http_code}' "$url" 2>&1 || echo "ERROR")
  if [[ "$status" == "200" || "$status" == "204" ]]; then
    pass "$route -> $status"
    ROUTE_REPORT+="$route -> $status (OK)"$'\n'
  else
    gap "route-failed" "$route -> $status (expected 200/204)"
    ROUTE_REPORT+="$route -> $status (FAIL)"$'\n'
    ALL_OK=0
  fi
done <<< "$ROUTES"

cleanup_server

if [[ "$ALL_OK" -eq 1 ]]; then
  write_runtime_report "$ROOT" "smoke" "PASS" "$ROUTE_REPORT" >/dev/null
else
  write_runtime_report "$ROOT" "smoke" "FAIL" "$ROUTE_REPORT" >/dev/null
fi

validator_exit
