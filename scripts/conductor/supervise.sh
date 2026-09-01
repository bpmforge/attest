#!/usr/bin/env bash
# supervise.sh — keeps conductor.mjs alive across its OWN process death.
#
# Two independent recovery layers:
#   - provider session/usage limits -> handled INSIDE conductor.mjs (sleep to reset)
#   - conductor process crash/fatal -> handled HERE (preserve state, relaunch)
#
# Usage: nohup caffeinate -dimsu bash supervise.sh --root ~/Code/some-target-project \
#          >> ~/Code/some-target-project/docs/work/conductor.out 2>&1 &
# Stop:  touch STOP in --root   (checked before every (re)launch and after every crash)
set -u
CONDUCTOR_DIR="$(cd "$(dirname "$0")" && pwd)"

# Parse just --root out of the passthrough args (everything is forwarded to
# conductor.mjs as-is; we only need ROOT here for crash cleanup).
TARGET_ROOT="."
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[$i]}" == "--root" && $((i + 1)) -lt ${#args[@]} ]]; then
    TARGET_ROOT="${args[$((i + 1))]}"
  fi
done
TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd)"

MAX=${SUPERVISE_MAX:-30}     # give up after this many crash-restarts
BACKOFF=${SUPERVISE_BACKOFF:-30}
n=0
log(){ echo "[supervise $(date -u +%FT%TZ)] $*"; }

while :; do
  if [ -f "$TARGET_ROOT/STOP" ]; then log "STOP present — exiting"; break; fi

  # Do not reset, clean, or delete worktrees here. conductor.mjs's resume
  # protocol reconciles board receipts against those exact branches and
  # worktrees. Deleting them before relaunch converts recoverable state into
  # fabricated drift and can destroy the only copy of reviewed code.

  log "starting conductor (launch $((n+1)))"
  node "$CONDUCTOR_DIR/conductor.mjs" "$@"
  code=$?
  log "conductor exited code=$code"

  [ "$code" -eq 0 ] && { log "clean exit — board drained or halt; done"; break; }
  case "$code" in
    2|3|4|5|6)
      log "deterministic gate exit code=$code — preserving state and stopping; repair the reported condition before restart"
      break
      ;;
  esac
  [ -f "$TARGET_ROOT/STOP" ] && { log "STOP present after crash — exiting"; break; }
  n=$((n+1))
  [ "$n" -ge "$MAX" ] && { log "hit MAX=$MAX restarts — giving up, needs a human"; break; }
  log "crash; restarting in ${BACKOFF}s (restart $n/$MAX)"
  sleep "$BACKOFF"
done
log "supervisor stopped"
