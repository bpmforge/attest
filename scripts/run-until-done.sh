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
# Completion signal: the literal promise <promise>COMPLETE</promise> in the session's
# final output OR anywhere in docs/work/STATE.md.
#
# Usage:
#   run-until-done.sh --prompt "<task>" [--agent sdlc-lead] [--model <m>]
#                     [--state docs/work/STATE.md] [--max-sessions 12] [--max-seconds 7200]
#   run-until-done.sh --self-test        # no opencode needed; stubbed runner
#   run-until-done.sh --help
#
# Exit 0 = completed, 1 = hit a cap without completing, 2 = usage/error.

set -uo pipefail

PROMISE='<promise>COMPLETE</promise>'
AGENT="sdlc-lead"
MODEL=""
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
    --state) STATE="$2"; shift 2 ;;
    --max-sessions) MAX_SESSIONS="$2"; shift 2 ;;
    --max-seconds) MAX_SECONDS="$2"; shift 2 ;;
    --self-test) SELFTEST=1; shift ;;
    --help|-h)
      sed -n '3,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

resume_preamble() {
  printf '/sdlc resume\nRead %s and continue from its Next step. When the whole task is finished, emit the exact token %s.\n\n%s\n' \
    "$STATE" "$PROMISE" "$PROMPT"
}

is_complete() {
  local out="$1"
  grep -qF "$PROMISE" <<<"$out" && return 0
  [[ -f "$STATE" ]] && grep -qF "$PROMISE" "$STATE" && return 0
  return 1
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
  STATE="$tmp/STATE.md"; LOG="$tmp/run.log"; PROMPT="self-test"; MAX_SESSIONS=5
  echo "# STATE" > "$STATE"
  # Stub runner: emits COMPLETE only on the 3rd invocation (simulates work finishing).
  cat > "$tmp/stub.sh" <<STUB
#!/usr/bin/env bash
c="$tmp/count"; n=\$(( \$(cat "\$c" 2>/dev/null || echo 0) + 1 )); echo \$n > "\$c"
if (( n >= 3 )); then echo "done: $PROMISE"; else echo "still working (pass \$n)"; fi
STUB
  chmod +x "$tmp/stub.sh"
  RUN_CMD="$tmp/stub.sh"
  if run_loop; then
    passes="$(cat "$tmp/count")"
    if [[ "$passes" == "3" ]]; then echo "self-test PASS (completed on session 3)"; exit 0
    else echo "self-test FAIL (completed on session $passes, expected 3)"; exit 1; fi
  else
    echo "self-test FAIL (never completed)"; exit 1
  fi
fi

if [[ -z "$PROMPT" ]]; then echo "run-until-done: --prompt required (or --self-test)" >&2; exit 2; fi
run_loop
