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
# Usage:
#   run-until-done.sh --prompt "<task>" [--agent sdlc-lead] [--model <m>]
#                     [--state docs/work/STATE.md] [--root .]
#                     [--max-sessions 12] [--max-seconds 7200]
#   run-until-done.sh --self-test        # no opencode needed; stubbed runner
#   run-until-done.sh --help
#
# Exit 0 = completed, 1 = hit a cap without completing, 2 = usage/error.

set -uo pipefail

PROMISE='<promise>COMPLETE</promise>'
AGENT="sdlc-lead"
MODEL=""
ROOT="."
STATE="docs/work/STATE.md"
MAX_SESSIONS=12
MAX_SECONDS=7200
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
    --max-sessions) MAX_SESSIONS="$2"; shift 2 ;;
    --max-seconds) MAX_SECONDS="$2"; shift 2 ;;
    --self-test) SELFTEST=1; shift ;;
    --help|-h)
      sed -n '3,33p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

resume_preamble() {
  printf '/sdlc resume\nRead %s and continue from its Next step. When the whole task is finished, emit the exact token %s.\n\n%s\n' \
    "$STATE" "$PROMISE" "$PROMPT"
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
  local validators_dir
  validators_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/validators" 2>/dev/null && pwd)"
  if [[ -n "$validators_dir" && -x "$validators_dir/validate-state-drift.sh" ]]; then
    if ! "$validators_dir/validate-state-drift.sh" "$ROOT" "$STATE" >/dev/null 2>>"$LOG"; then
      echo "[run-until-done] promise token seen but validate-state-drift.sh found drift -- not complete" | tee -a "$LOG"
      return 1
    fi
  fi
  if [[ -n "$validators_dir" && -x "$validators_dir/validate-tickets.sh" && -f "$ROOT/docs/work/plan.json" ]]; then
    if ! "$validators_dir/validate-tickets.sh" "$ROOT" >/dev/null 2>>"$LOG"; then
      echo "[run-until-done] promise token seen but validate-tickets.sh found gaps -- not complete" | tee -a "$LOG"
      return 1
    fi
  fi
  return 0
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
    local model_arg=(); [[ -n "$MODEL" ]] && model_arg=(--model "$MODEL")
    out="$(resume_preamble | $RUN_CMD --agent "$AGENT" ${model_arg[@]+"${model_arg[@]}"} 2>&1)"; rc=$?
    printf '%s\n' "$out" >> "$LOG"
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
  STATE="$tmp/STATE.md"; LOG="$tmp/run.log"; PROMPT="self-test"; MAX_SESSIONS=5; ROOT="$tmp"
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
  if run_loop; then
    passes="$(cat "$tmp/count")"
    if [[ "$passes" == "3" ]]; then echo "self-test PASS (completed on session 3, drift-check clean)"; exit 0
    else echo "self-test FAIL (completed on session $passes, expected 3)"; exit 1; fi
  else
    echo "self-test FAIL (never completed)"; exit 1
  fi
fi

if [[ -z "$PROMPT" ]]; then echo "run-until-done: --prompt required (or --self-test)" >&2; exit 2; fi
run_loop
