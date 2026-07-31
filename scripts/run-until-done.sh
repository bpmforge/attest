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
# Tier-aware session budget + stall detection (O2 runtime fold, T31.7 --
# folds FIX_VERIFY_LOOP.md's v2 iteration classes from protocol text into
# this runner, same convention as run-plan.mjs's per-node retries):
#   - --max-sessions, when not explicitly given, defaults per the CURRENT
#     session's docs/work/.model-context tier -- 6 on metered/cloud tiers,
#     12 on local/unknown tiers (is_local_tier(); same defaults as
#     fix-verify.mjs's R4 classes and run-plan.mjs's attemptCeiling()).
#   - stall-2-then-escalate: if a completed (non-killed) session's combined
#     output is byte-identical to the immediately prior session's output --
#     genuinely repeating itself, not just "STATE.md not yet touched" --
#     twice in a row, the loop stops early (exit 1) rather than grinding out
#     the rest of the session cap. --stall-sessions overrides the threshold
#     (default 2; 0 disables the check).
#   - PROGRESSED extension: a run whose output keeps changing session to
#     session is never cut short by the stall check, so it naturally rides
#     the full tier-aware ceiling above -- "as long as it is not looping on
#     the same output, let it keep going."
#   A watchdog-killed session (SESSION_KILLED set) is an infra event, same as
#   FIX_VERIFY_LOOP.md's rule: it counts toward --max-sessions but never
#   touches the stall counter.
#
# Context-limit sync (T30.8, LOCAL_CONTEXT_INTEGRITY_DESIGN P2): opencode has no
# runtime hook to re-read `limit.*` mid-session -- static config is the only
# mechanism it supports -- so the loop syncs the config to LM Studio's actually-
# loaded context ONCE, before the first session, rather than trusting whatever
# was last written. Best-effort and non-fatal: a cloud/large-tier run has no
# local provider to sync, and an unreachable LM Studio or a sub-floor load just
# means limits are left exactly as they were found (see sync_model_limits()).
#
# Usage:
#   run-until-done.sh --prompt "<task>" [--agent sdlc-lead] [--model <m>]
#                     [--state docs/work/STATE.md] [--root .]
#                     [--plan docs/work/plan.json] [--actor <name>]
#                     [--max-sessions <tier-aware: 6 metered / 12 local>]
#                     [--stall-sessions 2] [--max-seconds 7200]
#                     [--max-session-seconds 1800] [--heartbeat-seconds 300]
#   run-until-done.sh --self-test        # no opencode needed; stubbed runner
#   run-until-done.sh --help
#
# Exit 0 = completed, 1 = hit a cap without completing, stalled twice in a
# row, or the refuse-to-select-next-work gate refused to start; 2 = usage/error.

set -uo pipefail

PROMISE='<promise>COMPLETE</promise>'
AGENT="sdlc-lead"
MODEL=""
ROOT="."
STATE="docs/work/STATE.md"
PLAN=""
ACTOR=""
MAX_SESSIONS=""
STALL_SESSIONS=2
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
    --stall-sessions) STALL_SESSIONS="$2"; shift 2 ;;
    --max-seconds) MAX_SECONDS="$2"; shift 2 ;;
    --max-session-seconds) MAX_SESSION_SECONDS="$2"; shift 2 ;;
    --heartbeat-seconds) HEARTBEAT_SECONDS="$2"; shift 2 ;;
    --self-test) SELFTEST=1; shift ;;
    --help|-h)
      sed -n '3,90p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# is_local_tier (T31.7): reads $ROOT/docs/work/.model-context's tier= line --
# same signal + same "unknown defaults to local" convention as run-plan.mjs's
# attemptCeiling()/fix-verify.mjs's getAttemptCeiling(), so all three runners
# agree on what "local" means. Returns true (0) for local/unknown, false (1)
# for a metered/cloud tier (large, from detect-model-context.sh's cloud path).
is_local_tier() {
  local mc="$ROOT/docs/work/.model-context"
  [[ -f "$mc" ]] || return 0
  local tier; tier="$(grep -E '^tier=' "$mc" 2>/dev/null | head -1 | cut -d= -f2)"
  [[ -z "$tier" ]] && return 0
  case "$tier" in
    *local*|*small*) return 0 ;;
    *) return 1 ;;
  esac
}

# Tier-aware --max-sessions default (T31.7): only when the caller did not
# pass --max-sessions explicitly -- an explicit value always wins.
if [[ -z "$MAX_SESSIONS" ]]; then
  if is_local_tier; then MAX_SESSIONS=12; else MAX_SESSIONS=6; fi
fi

resume_preamble() {
  # The checkpoint may not exist yet (first session of a fresh project, or an
  # agent that never wrote one). Telling a session to "continue from its Next
  # step" in a file that is not there is worse than saying nothing: it reads as
  # an instruction whose object is missing, and the session has to guess. Ask
  # for the checkpoint instead -- run-until-done, validate-state-drift and
  # /sdlc resume all key off it, so a run without one cannot resume at all.
  if [[ -f "$STATE" ]]; then
    printf '/sdlc resume\nRead %s and continue from its Next step.' "$STATE"
  else
    printf '/sdlc resume\nThere is no checkpoint at %s yet. Create it per agents/shared/CHECKPOINT_STATE.md before you finish this session -- the resume loop and the drift gate both read that exact path, and without it no later session can pick up where you stopped.' "$STATE"
  fi
  printf ' When the whole task is finished, emit the exact token %s.\n' "$PROMISE"

  # Feed the refusal back. Truncated: this rides in front of the real prompt on
  # every restart, and a validator dump can be long.
  if [[ -n "$LAST_GAPS" ]]; then
    printf '\nYOUR PREVIOUS SESSION EMITTED %s AND WAS REFUSED. The token is a request to evaluate completion, not proof of it, and objective state disagreed:\n\n%s\n\nFix exactly these before emitting the token again. Do not re-emit it with them outstanding.\n' \
      "$PROMISE" "$(printf '%s' "$LAST_GAPS" | head -c 4000)"
  fi

  printf '\n%s\n' "$PROMPT"
}

# -- shared hygiene checks (T27.4, reused by both is_complete() post-hoc and
# next_work_gate_ok() pre-flight -- same pairing, two call sites) -----------

validators_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")/validators" 2>/dev/null && pwd
}

# Why a session was REFUSED, carried into the next session's preamble.
#
# Both checks used to send the validator's output to /dev/null, so the gap text
# reached this script's log and nothing else. resume_preamble() rebuilds the
# next session from $STATE and the ORIGINAL $PROMPT only — meaning a session
# whose promise token was rejected got no signal that it had been rejected, let
# alone why. It would re-emit the same work, be refused identically, and the
# loop would burn to its cap or trip the stall detector. Observed in this
# repo's own docs/work/run-until-done.log: two consecutive sessions rejected
# for the same single drift gap, then "session cap 3 reached".
#
# conductor.mjs already learned this in v3.1.1 — it preserves the scope
# violation diff and feeds it into the retry, because "the previous attempt's
# mistake was described to it in the abstract but never shown". Same fix here.
LAST_GAPS=""

state_drift_clean() {
  local vdir out; vdir="$(validators_dir)"
  [[ -n "$vdir" && -x "$vdir/validate-state-drift.sh" ]] || return 0
  if out="$("$vdir/validate-state-drift.sh" "$ROOT" "$STATE" 2>&1)"; then return 0; fi
  printf '%s\n' "$out" >>"$LOG"
  LAST_GAPS="$out"
  return 1
}

tickets_clean() {
  local vdir out plan="${1:-$ROOT/docs/work/plan.json}"
  vdir="$(validators_dir)"
  [[ -n "$vdir" && -x "$vdir/validate-tickets.sh" && -f "$plan" ]] || return 0
  if out="$("$vdir/validate-tickets.sh" "$ROOT" "$plan" 2>&1)"; then return 0; fi
  printf '%s\n' "$out" >>"$LOG"
  LAST_GAPS="$out"
  return 1
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
  local last_out="" repeat_count=0
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
      # infra event (T31.7): watchdog kills spend a session but never touch
      # the stall-repeat counter -- neither reset nor increment.
      continue
    fi
    if is_complete "$out"; then
      echo "[run-until-done] COMPLETE at session ${session} (rc=${rc})" | tee -a "$LOG"
      return 0
    fi
    # stall-2-then-escalate (T31.7): PROGRESSED extension is implicit -- a
    # session whose output keeps changing never trips this and rides the
    # full tier-aware --max-sessions ceiling above.
    if [[ -n "$out" && "$out" == "$last_out" ]]; then
      repeat_count=$((repeat_count + 1))
    else
      repeat_count=0
    fi
    last_out="$out"
    if (( STALL_SESSIONS > 0 && repeat_count >= STALL_SESSIONS )); then
      echo "[run-until-done] session output identical for ${repeat_count} consecutive sessions -- stalled, stopping early at session ${session}/${MAX_SESSIONS} (stall-${STALL_SESSIONS}-then-escalate)" | tee -a "$LOG"
      return 1
    fi
  done
  echo "[run-until-done] session cap ${MAX_SESSIONS} reached without completion" | tee -a "$LOG"
  return 1
}

# sync_model_limits (T30.8): reconcile opencode's believed provider `limit.*`
# to LM Studio's actually-loaded context before this loop's first session.
# Resolves OPENCODE_CONFIG if set, else `opencode debug paths`'s config dir.
# Silent no-op when node/the sync script/a resolvable config aren't present
# (self-test's stubbed RUN_CMD never needs this and never calls it, since it
# returns before run_loop in that branch).
sync_model_limits() {
  local script_dir sync_script cfg cfg_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || return 0
  sync_script="$script_dir/sync-model-limits.mjs"
  [[ -f "$sync_script" ]] || return 0
  command -v node >/dev/null 2>&1 || return 0
  cfg="${OPENCODE_CONFIG:-}"
  if [[ -z "$cfg" ]] && command -v opencode >/dev/null 2>&1; then
    cfg_dir="$(opencode debug paths 2>/dev/null | awk '/^config[[:space:]]/{print $2}')"
    [[ -n "$cfg_dir" ]] && cfg="$cfg_dir/opencode.json"
  fi
  [[ -n "$cfg" && -f "$cfg" ]] || return 0
  mkdir -p "$(dirname "$LOG")"
  if ! node "$sync_script" --config "$cfg" --write >>"$LOG" 2>&1; then
    echo "[run-until-done] sync-model-limits found a sub-floor load or unreachable LM Studio -- see $LOG, continuing with limits as found" | tee -a "$LOG" >&2
  fi
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

  # -- Scenario 3 (T31.7): stall-2-then-escalate -----------------------------
  # A stub that never completes and never varies its output -- the exact
  # same "still working" line every session -- must stop after 2 consecutive
  # identical sessions, well before exhausting a generous session cap.
  scenario3_ok=1
  {
    saved_max="$MAX_SESSIONS"
    MAX_SESSIONS=8
    stall_state="$tmp/stall-STATE.md"; echo "# STATE" > "$stall_state"
    saved_state="$STATE"; STATE="$stall_state"
    stall_log="$tmp/stall-run.log"; saved_log="$LOG"; LOG="$stall_log"
    rm -f "$tmp/stall-count"
    cat > "$tmp/stall-stub.sh" <<STUB2
#!/usr/bin/env bash
c="$tmp/stall-count"; n=\$(( \$(cat "\$c" 2>/dev/null || echo 0) + 1 )); echo \$n > "\$c"
echo "still working, no progress"
STUB2
    chmod +x "$tmp/stall-stub.sh"
    RUN_CMD="$tmp/stall-stub.sh"
    if run_loop; then
      echo "self-test scenario 3 FAIL: stalled run should not report complete"; scenario3_ok=0
    else
      passes="$(cat "$tmp/stall-count" 2>/dev/null || echo 0)"
      if [[ "$passes" == "3" ]] && grep -qF "stall-2-then-escalate" "$stall_log"; then
        echo "self-test scenario 3 PASS (stopped early at session 3/8 on 2 identical sessions, never reached the cap)"
      else
        echo "self-test scenario 3 FAIL (sessions=$passes, expected 3, or missing stall log line)"; scenario3_ok=0
      fi
    fi
    MAX_SESSIONS="$saved_max"; STATE="$saved_state"; LOG="$saved_log"
    RUN_CMD="$tmp/stub.sh"
  }

  # -- Scenario 4 (T31.7): is_local_tier() tier-aware default signal ---------
  scenario4_ok=1
  mc_root="$tmp/mc-test"; mkdir -p "$mc_root/docs/work"
  saved_root="$ROOT"; ROOT="$mc_root"
  if is_local_tier; then
    echo "self-test scenario 4a PASS (no .model-context -> local/unknown default)"
  else
    echo "self-test scenario 4a FAIL: expected local default with no .model-context present"; scenario4_ok=0
  fi
  printf 'type=cloud\ntier=large\n' > "$mc_root/docs/work/.model-context"
  if is_local_tier; then
    echo "self-test scenario 4b FAIL: expected metered (false) for tier=large"; scenario4_ok=0
  else
    echo "self-test scenario 4b PASS (tier=large -> metered)"
  fi
  printf 'type=local\ntier=small\n' > "$mc_root/docs/work/.model-context"
  if is_local_tier; then
    echo "self-test scenario 4c PASS (tier=small -> local)"
  else
    echo "self-test scenario 4c FAIL: expected local (true) for tier=small"; scenario4_ok=0
  fi
  ROOT="$saved_root"

  # -- Scenario 5: the refusal must reach the next session ------------------
  # A rejected promise token is only actionable if the NEXT session is told it
  # was rejected and why. Without this the loop re-runs the same work, is
  # refused identically, and burns to the cap -- which is what this repo's own
  # run-until-done.log recorded before the gaps were wired through.
  scenario5_ok=1
  {
    saved_state="$STATE"; saved_prompt="$PROMPT"; saved_gaps="$LAST_GAPS"
    PROMPT="do the thing"

    # (a) no checkpoint yet -> ask for one, never point at a missing file
    STATE="$tmp/absent-STATE.md"; rm -f "$STATE"; LAST_GAPS=""
    out="$(resume_preamble)"
    if grep -qF "There is no checkpoint at" <<<"$out" && ! grep -qF "continue from its Next step" <<<"$out"; then
      echo "self-test scenario 5a PASS (a missing checkpoint is requested, not silently referenced)"
    else
      echo "self-test scenario 5a FAIL: preamble still points at a checkpoint that does not exist"; scenario5_ok=0
    fi

    # (b) a refusal carries its gap text into the next session
    STATE="$tmp/present-STATE.md"; echo "# STATE" > "$STATE"
    LAST_GAPS='  [x] module '"'"'parse'"'"': kind must be "module"'
    out="$(resume_preamble)"
    if grep -qF "WAS REFUSED" <<<"$out" && grep -qF 'kind must be "module"' <<<"$out" && grep -qF "do the thing" <<<"$out"; then
      echo "self-test scenario 5b PASS (the refusal, its gaps, and the original prompt all reach the next session)"
    else
      echo "self-test scenario 5b FAIL: gap text did not reach the preamble"; scenario5_ok=0
    fi

    # (c) a clean run must not grow a phantom refusal notice
    LAST_GAPS=""
    out="$(resume_preamble)"
    if ! grep -qF "WAS REFUSED" <<<"$out" && grep -qF "continue from its Next step" <<<"$out"; then
      echo "self-test scenario 5c PASS (no refusal text when nothing was refused)"
    else
      echo "self-test scenario 5c FAIL: clean restart carries a refusal notice"; scenario5_ok=0
    fi

    STATE="$saved_state"; PROMPT="$saved_prompt"; LAST_GAPS="$saved_gaps"
  }

  if [[ "$scenario1_ok" == "1" && "$scenario2_ok" == "1" && "$scenario3_ok" == "1" && "$scenario4_ok" == "1" && "$scenario5_ok" == "1" ]]; then
    echo "self-test PASS (session-restart completion + refuse-to-select-next-work gate + stall-2-then-escalate + tier-aware default + refusal feedback)"
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
sync_model_limits
run_loop
