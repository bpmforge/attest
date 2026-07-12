#!/usr/bin/env bash
// Provenance: shipwright scripts/supervise.sh — FIELD-PROVEN reference implementation (conductor run 2026-07-11/12:
// 19 tickets landed unattended, provider-limit sleep-to-resume fired live, supervisor crash-recovery,
// sticky-findings + informed-APPROVE gate, diff-scoped validator gates). Implements M28/T28.x for
// plan.json boards. Adaptation notes: scripts/conductor/README.md. DO NOT hand-edit without porting tests.
# supervise.sh — keeps the conductor alive across its OWN process death.
#
# Two independent recovery layers:
#   • provider session/usage limits  -> handled INSIDE conductor.mjs (sleep to reset)
#   • conductor process crash/fatal  -> handled HERE (reset tree, relaunch)
#
# Usage: nohup caffeinate -dimsu bash scripts/supervise.sh --waves W0,W1,W2 --escalate \
#          >> docs/work/conductor.out 2>&1 &
# Stop:  touch STOP   (checked before every (re)launch and after every crash)
set -u
cd "$(dirname "$0")/.."
export PATH="/Users/user/.local/share/fnm/node-versions/v24.14.0/installation/bin:$PATH"

MAX=${SUPERVISE_MAX:-30}     # give up after this many crash-restarts
BACKOFF=${SUPERVISE_BACKOFF:-30}
n=0
log(){ echo "[supervise $(date -u +%FT%TZ)] $*"; }

while :; do
  if [ -f STOP ]; then log "STOP present — exiting"; break; fi

  # A crashed conductor leaves the tree on a feature branch with uncommitted work,
  # which fails the conductor's clean-tree preflight. Reset to committed main so it
  # can re-claim from board state. Only abandons the crashed attempt (redone idempotently).
  # (With worktree isolation, ROOT stays on main even across a crash — this is mostly
  #  belt-and-suspenders — but a crashed run can leave dangling worktrees + sw/ branches.)
  git checkout -f main >/dev/null 2>&1
  git clean -fd >/dev/null 2>&1
  git worktree prune >/dev/null 2>&1
  git for-each-ref --format='%(refname:short)' refs/heads/ \
    | grep -E '^(sw/|feat/w[0-9].*-auto$)' \
    | while read -r b; do git worktree remove --force "$(git worktree list --porcelain | grep -A2 "branch refs/heads/$b" | grep '^worktree ' | cut -d' ' -f2)" >/dev/null 2>&1; git branch -D "$b" >/dev/null 2>&1; done
  rm -rf ../.shipwright-worktrees >/dev/null 2>&1

  log "starting conductor (launch $((n+1)))"
  node scripts/conductor.mjs "$@"
  code=$?
  log "conductor exited code=$code"

  [ "$code" -eq 0 ] && { log "clean exit — board drained or breakpoint; done"; break; }
  [ -f STOP ] && { log "STOP present after crash — exiting"; break; }
  n=$((n+1))
  [ "$n" -ge "$MAX" ] && { log "hit MAX=$MAX restarts — giving up, needs a human"; break; }
  log "crash; restarting in ${BACKOFF}s (restart $n/$MAX)"
  sleep "$BACKOFF"
done
log "supervisor stopped"
