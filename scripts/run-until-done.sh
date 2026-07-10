#!/usr/bin/env bash
#
# run-until-done.sh -- scripted outer loop for SDLC work across session restarts (O1.4).
#
# Small-tier agents run "one HANDOFF per session, restart after 3" -- which makes the
# USER the outer loop. This wrapper makes the restart free: it re-invokes `opencode run`
# with the /sdlc resume preamble (rehydrate from docs/work/STATE.md) until the work
# signals completion, then stops. Fresh context each pass (the B2-friendly behavior).
# Complements run-plan.mjs (which owns DAG plans); this owns "keep an SDLC mode going
# across restarts".
#
# Completion signal (T27.4): the literal promise <promise>COMPLETE</promise> is a
# REQUEST to evaluate completion, not proof of it -- an agent can emit that token
# with a red gate behind it. Once the token appears (in the session output or in
# docs/work/STATE.md), objective state decides:
#   - scripts/validators/validate-state-drift.sh must be clean (every phase
#     STATE.md's Done section claims must be backed by a real/waiver gate
#     receipt at docs/work/gates/<phase>-receipt.json -- T27.1's receipt).
#   - if docs/work/plan.json exists, scripts/validators/validate-tickets.sh
#     must also be clean (ticket-hygiene gate).
# A STATE.md with no phase claims at all (a Mode 4 audit, or no STATE.md) has
# nothing for validate-state-drift.sh to check -- clean by having nothing to
# verify, not by skipping verification. That's the intentional discrimination
# between "legitimately ungated task" and "agent skipped the gates".
#
# Refuse-to-select-next-work gate (T26.3): BEFORE this wrapper starts any work at
# all, it refuses to proceed if either hygiene validator (state-drift, tickets) is
# red, or (when --actor is given) that actor still has an open ticket -- claimed or
# in_progress, i.e. not yet closed via a close() receipt (in_review already counts
# as closed, matching tickets-lifecycle.mjs's own WIP=1 semantics). This is a
# pre-flight, not a per-session check: each session restart in the loop below
# resumes the SAME unit of work via /sdlc resume ("continue from Next"), it never
# selects a *different* ticket -- so the point where "next work" is chosen is
# before the loop begins, once per invocation of this script. --plan/--actor are
# both optional; with neither set the gate is a no-op (a plain SDLC-phase run with
# no ticket layer has nothing to check here).
#
# Task budget + watchdog (T31.5): each individual `opencode run` invocation is a
# black box that can hang (model stuck, tool call blocked) well inside the outer
# --max-seconds wall-clock cap, which is only checked BETWEEN sessions -- a single
# stalled session would otherwise hang the whole overnight run forever. Every
# session now runs in the background under two independent guards, checked on a
# short poll:
#   - --max-session-seconds: hard per-session task budget (elapsed time since the
#     session started), regardless of whether it is still producing output.
#   - --heartbeat-seconds: stall detection -- the session's combined stdout+stderr
#     must grow at least once per this window, or it is considered stalled.
# A breach sends SIGTERM (then SIGKILL if it doesn't exit within 1s) and the
# breach is checkpointed as a JSON line in docs/work/watchdog-events.jsonl
# (alongside the run log) so a killed/stalled session is a visible, auditable
# event, not a silent hang. The session is then treated like any other
# non-completing pass: it counts toward --max-sessions and the loop continues --
# the NEXT session resumes from whatever --state the killed session last wrote,
# same as any other restart (T26.3/T27.4's existing resume path IS the recovery
# checkpoint; the watchdog's job is only to make sure the loop reaches it).
#
# Usage:
#   run-until-done.sh --prompt "<task>" [--agent sdlc-lead] [--model <m>]
#                     [--state docs/work/STATE.md] [--root .]
#                     [--plan docs/work/plan.json] [--actor <name>]
#                     [--max-sessions 12] [--max-seconds 7200]
#                     [--max-session-seconds 1800] [--heartbeat-seconds 300]
#   run-until-done.sh --self-test        # no opencode needed; stubbed runner
#   run-until-done.sh --help
#
# Exit 0 = completed, 1 = hit a cap without completing (or the refuse-to-select-next-work
# gate refused to start), 2 = usage/error.

set -uo pipefail

PROMISE='<promise>COMPLETE</promise>'
AGENT="sdlc-lead"
MODEL=""
ROOT="."
STATE="docs/work/STATE.md"
PLAN=""
ACTOR=""
MAX_SESSIONS=12
MAX_SECONDS=7200
MAX_SESSION_SECONDS=1800
HEARTBEAT_SECONDS=300
POLL_SECONDS="${POLL_SECONDS:-5}"
PROMPT=""
SELFTEST=0
LOG="docs/work/run-until-done.log"
# Runner is overridable so --self-test (and CI) can stub opencode.
RUN_CMD="${RUN_CMD:-opencode run}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt) PROMPT="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    --actor) ACTOR="$2"; shift 2 ;;
    --max-sessions) MAX_SESSIONS="$2"; shift 2 ;;
    --max-seconds) MAX_SECONDS="$2"; shift 2 ;;
    --max-session-seconds) MAX_SESSION_SECONDS="$2"; shift 2 ;;
    --heartbeat-seconds) HEARTBEAT_SECONDS="$2"; shift 2 ;;
    --self-test) SELFTEST=1; shift ;;
    --help|-h)
      sed -n '3,67p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

resume_preamble() {
  printf '/sdlc resume\nRead %s and continue from its Next step. When the whole task is finished, emit the exact token %s.\n\n%s\n' \
    "$STATE" "$PROMISE" "$PROMPT"
}

# -- shared hygiene checks (T27.4, reused by both is_complete() post-hoc and
# next_work_gate_ok() pre-flight -- same pairing, two call sites) -----------

validators_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")/validators" 2>/dev/null && pwd
}

state_drift_clean() {
  local vdir; vdir="$(validators_dir)"
  [[ -n "$vdir" && -x "$vdir/validate-state-drift.sh" ]] || return 0
  "$vdir/validate-state-drift.sh" "$ROOT" "$STATE" >/dev/null 2>>"$LOG"
}

tickets_clean() {
  local vdir plan="${1:-$ROOT/docs/work/plan.json}"
  vdir="$(validators_dir)"
  [[ -n "$vdir" && -x "$vdir/validate-tickets.sh" && -f "$plan" ]] || return 0
  "$vdir/validate-tickets.sh" "$ROOT" "$plan" >/dev/null 2>>"$LOG"
}

is_complete() {
  local out="$1"
  local token_seen=1
  grep -qF "$PROMISE" <<<"$out" || token_seen=0
  if [[ "$token_seen" == "0" && -f "$STATE" ]]; then
    grep -qF "$PROMISE" "$STATE" && token_seen=1
  fi
  [[ "$token_seen" == "1" ]] || return 1

  # Token seen -- now verify against objective state before trusting it.
  if ! state_drift_clean; then
    echo "[run-until-done] promise token seen but validate-state-drift.sh found drift -- not complete" | tee -a "$LOG"
    return 1
  fi
  if ! tickets_clean; then
    echo "[run-until-done] promise token seen but validate-tickets.sh found gaps -- not complete" | tee -a "$LOG"
    return 1
  fi
  return 0
}

# next_work_gate_ok (T26.3): refuse to select/claim the NEXT ticket while
# either hygiene validator is red, or --actor already has an open ticket
# elsewhere. No-op (returns 0) when neither --plan nor --actor is set --
# both hygiene checks already degrade to "nothing to check" cleanly with no
# STATE.md/plan.json present (see state_drift_clean/tickets_clean above), and
# the open-ticket check only runs when --actor is explicitly given.
next_work_gate_ok() {
  if ! state_drift_clean; then
    echo "[run-until-done] refusing to select next work -- validate-state-drift.sh found drift" | tee -a "$LOG"
    return 1
  fi
  local plan="${PLAN:-$ROOT/docs/work/plan.json}"
  if ! tickets_clean "$plan"; then
    echo "[run-until-done] refusing to select next work -- validate-tickets.sh found gaps" | tee -a "$LOG"
    return 1
  fi
  if [[ -n "$ACTOR" ]]; then
    local lib; lib="$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" 2>/dev/null && pwd)"
    if [[ -f "$plan" && -n "$lib" && -f "$lib/tickets.mjs" ]] && command -v node >/dev/null 2>&1; then
      if ! node "$lib/tickets.mjs" open-for "$plan" "$ACTOR" >/dev/null 2>>"$LOG"; then
        echo "[run-until-done] refusing to select next work -- '$ACTOR' has an open ticket (not yet closed via a close() receipt)" | tee -a "$LOG"
        return 1
      fi
    fi
  fi
  return 0
}

# checkpoint_kill (T31.5): append a structured, greppable checkpoint record for
# a watchdog kill so the event survives past the free-text log -- the actual
# recovery checkpoint is whatever --state the killed session last wrote (the
# existing /sdlc resume path); this record is the audit trail of *why* the loop
# didn't just hang.
checkpoint_kill() {
  local session="$1" reason="$2" elapsed="$3"
  local wlog; wlog="$(dirname "$LOG")/watchdog-events.jsonl"
  mkdir -p "$(dirname "$wlog")"
  printf '{"session":%d,"reason":"%s","elapsedSeconds":%d,"timestamp":"%s"}\n' \
    "$session" "$reason" "$elapsed" "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)" >> "$wlog"
}

# kill_tree (T31.5): a plain `kill $pid` only signals that one process --
# bash does NOT forward signals to a backgrounded pipeline's children (e.g.
# $RUN_CMD's own `sleep`/model-call subprocess), so killing just the top pid
# orphans them to keep running (and keep consuming resources) instead of
# actually reclaiming what the watchdog killed the session to reclaim.
# Walks the descendant tree via `pgrep -P` (portable: macOS + Linux both
# support it, no GNU-only flags) and signals every pid found. Re-walked fresh
# on each call rather than cached, since the TERM pass may still leave a
# child alive for the follow-up KILL pass.
kill_tree() {
  local root="$1" sig="$2"
  local pids=("$root") i=0 children c
  while (( i < ${#pids[@]} )); do
    children="$(pgrep -P "${pids[$i]}" 2>/dev/null)"
    for c in $children; do pids+=("$c"); done
    i=$((i + 1))
  done
  for c in "${pids[@]}"; do kill "-$sig" "$c" 2>/dev/null; done
}

# run_one_session (T31.5): run exactly one $RUN_CMD invocation under the
# per-session task budget + heartbeat watchdog. Sets SESSION_OUT/SESSION_RC/
# SESSION_KILLED (empty, "budget", or "stall") for the caller. Bash-3.2-safe:
# no associative arrays, no GNU-coreutils `timeout` (not present on stock
# macOS) -- the watchdog is a manual background-process poll loop instead.
run_one_session() {
  local model_arg=(); [[ -n "$MODEL" ]] && model_arg=(--model "$MODEL")
  local tmp_out; tmp_out="$(mktemp "${TMPDIR:-/tmp}/run-until-done.XXXXXX")"
  SESSION_KILLED=""

  resume_preamble | $RUN_CMD --agent "$AGENT" ${model_arg[@]+"${model_arg[@]}"} >"$tmp_out" 2>&1 &
  local pid=$!
  local session_start now size last_size=0 stalled_for=0
  session_start=$(date +%s 2>/dev/null || echo 0)

  while kill -0 "$pid" 2>/dev/null; do
    sleep "$POLL_SECONDS"
    now=$(date +%s 2>/dev/null || echo 0)
    size=$(wc -c <"$tmp_out" 2>/dev/null | tr -d ' '); [[ -z "$size" ]] && size=0
    if (( size > last_size )); then
      last_size=$size
      stalled_for=0
    else
      stalled_for=$(( stalled_for + POLL_SECONDS ))
    fi
    if (( MAX_SESSION_SECONDS > 0 && now - session_start >= MAX_SESSION_SECONDS )); then
      SESSION_KILLED="budget"
      break
    fi
    if (( HEARTBEAT_SECONDS > 0 && stalled_for >= HEARTBEAT_SECONDS )); then
      SESSION_KILLED="stall"
      break
    fi
  done

  if [[ -n "$SESSION_KILLED" ]]; then
    kill_tree "$pid" TERM
    sleep 1
    kill_tree "$pid" KILL
    wait "$pid" 2>/dev/null
    SESSION_RC=124
  else
    wait "$pid"; SESSION_RC=$?
  fi
  SESSION_OUT="$(cat "$tmp_out" 2>/dev/null)"
  rm -f "$tmp_out"
}

run_loop() {
  mkdir -p "$(dirname "$LOG")"
  local start now session=0 out rc
  start=$(date +%s 2>/dev/null || echo 0)
  while (( session < MAX_SESSIONS )); do
    session=$((session + 1))
    now=$(date +%s 2>/dev/null || echo 0)
    if (( start > 0 && now - start >= MAX_SECONDS )); then
      echo "[run-until-done] wall-clock cap ${MAX_SECONDS}s reached at session ${session}" | tee -a "$LOG"
      return 1
    fi
    echo "[run-until-done] session ${session}/${MAX_SESSIONS} $(date 2>/dev/null)" >> "$LOG"
    run_one_session
    out="$SESSION_OUT"; rc=$SESSION_RC
    printf '%s\n' "$out" >> "$LOG"
    if [[ -n "$SESSION_KILLED" ]]; then
      local elapsed=$(( $(date +%s 2>/dev/null || echo 0) - now ))
      echo "[run-until-done] session ${session} KILLED (${SESSION_KILLED}, ${elapsed}s) -- checkpointed, continuing" | tee -a "$LOG"
      checkpoint_kill "$session" "$SESSION_KILLED" "$elapsed"
      continue
    fi
    if is_complete "$out"; then
      echo "[run-until-done] COMPLETE at session ${session} (rc=${rc})" | tee -a "$LOG"
      return 0
    fi
  done
  echo "[run-until-done] session cap ${MAX_SESSIONS} reached without completion" | tee -a "$LOG"
  return 1
}

if [[ "$SELFTEST" == "1" ]]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  STATE="$tmp/STATE.md"; LOG="$tmp/run.log"; PROMPT="self-test"; MAX_SESSIONS=5; ROOT="$tmp"; POLL_SECONDS=1
  mkdir -p "$tmp/docs/work/gates"
  echo "# STATE" > "$STATE"
  # Stub runner: emits the promise token only on the 3rd invocation, AND (T27.4)
  # backs that claim with a real gate receipt + a matching STATE.md Done line.
  # This proves the self-test passes THROUGH validate-state-drift.sh, not around
  # it via the "STATE.md claims nothing gated" no-op path -- a stub that just
  # emitted the token with an untouched STATE.md would be a false green under
  # the new contract (it would only prove the vacuous case, not the gate).
  cat > "$tmp/stub.sh" <<STUB
#!/usr/bin/env bash
c="$tmp/count"; n=\$(( \$(cat "\$c" 2>/dev/null || echo 0) + 1 )); echo \$n > "\$c"
if (( n >= 3 )); then
  cat > "$tmp/docs/work/gates/phase-9-receipt.json" <<'RECEIPT'
{"phase":"phase-9","timestamp":"2026-01-01T00:00:00Z","mode":"real","inputTreeHash":"selftest","validators":[],"filesChecked":[]}
RECEIPT
  cat > "$STATE" <<'STATEEOF'
# STATE — self-test

## Done
- phase-9 done -- self-test stub

## Next
- (none)
STATEEOF
  echo "done: $PROMISE"
else
  echo "still working (pass \$n)"
fi
STUB
  chmod +x "$tmp/stub.sh"
  RUN_CMD="$tmp/stub.sh"

  scenario1_ok=1
  if run_loop; then
    passes="$(cat "$tmp/count")"
    if [[ "$passes" == "3" ]]; then echo "self-test scenario 1 PASS (completed on session 3, drift-check clean)"
    else echo "self-test scenario 1 FAIL (completed on session $passes, expected 3)"; scenario1_ok=0; fi
  else
    echo "self-test scenario 1 FAIL (never completed)"; scenario1_ok=0
  fi

  # -- Scenario 2 (T26.3): next_work_gate_ok() -------------------------------
  # (a) no-op with neither --plan nor --actor set (PLAN/ACTOR still "" here).
  # (b) refuses when --actor already has an open (claimed/in_progress) ticket.
  # (c) does NOT refuse a different actor with no open ticket of their own.
  scenario2_ok=1
  plan2="$tmp/plan-open.json"
  cat > "$plan2" <<'PLANJSON'
{"goal":"selftest","modules":[{"id":"M-open","kind":"module","title":"open","lane":"test","owner":"tester","status":"in_progress","write_scope":["src/**"],"depends_on":[],"acceptance":["x"],"verify":"true","manifest":"m.md","history":[]}]}
PLANJSON

  if next_work_gate_ok; then
    echo "self-test scenario 2a PASS (no-op clean with no --plan/--actor)"
  else
    echo "self-test scenario 2a FAIL: next_work_gate_ok() should no-op clean with no --plan/--actor"; scenario2_ok=0
  fi

  PLAN="$plan2"; ACTOR="tester"
  if next_work_gate_ok; then
    echo "self-test scenario 2b FAIL: next_work_gate_ok() should refuse -- 'tester' has an open ticket M-open"; scenario2_ok=0
  else
    echo "self-test scenario 2b PASS (refused to select next work while 'tester' has an open ticket)"
  fi

  ACTOR="someone-else"
  if next_work_gate_ok; then
    echo "self-test scenario 2c PASS (a different actor is not blocked by 'tester's open ticket)"
  else
    echo "self-test scenario 2c FAIL: next_work_gate_ok() wrongly refused for an actor with no open ticket"; scenario2_ok=0
  fi
  PLAN=""; ACTOR=""

  if [[ "$scenario1_ok" == "1" && "$scenario2_ok" == "1" ]]; then
    echo "self-test PASS (session-restart completion + refuse-to-select-next-work gate)"
    exit 0
  else
    echo "self-test FAIL"
    exit 1
  fi
fi

if [[ -z "$PROMPT" ]]; then echo "run-until-done: --prompt required (or --self-test)" >&2; exit 2; fi
if ! next_work_gate_ok; then
  echo "[run-until-done] refusing to start -- see ${LOG} for which gate fired" >&2
  exit 1
fi
run_loop
