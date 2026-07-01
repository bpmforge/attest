#!/usr/bin/env bash
#
# validate-handoff-discipline.sh -- delegation must HANDOFF, never naively spawn.
#
# opencode (and any runtime without a blocking subagent tool) cannot spawn a
# child agent. Delegation there is a HANDOFF block the user pastes into a new
# session. Agents express delegation as `task(agent="X", ...)` SHORTHAND, which
# every such file must declare maps to a HANDOFF, gated by `has_task_tool`
# (Executor A/B) with a no-spawn fallback (Executor C: emit-as-text, wait for
# user). This validator fails any agent that uses task()-shorthand without both
# the HANDOFF translation and the no-spawn fallback -- so the discipline can't
# silently regress into "the model tries to call task() and the runtime can't."
#
# It also flags hard spawn calls (Agent(...) / subagent_type) in agent prose,
# which bypass the HANDOFF contract entirely.
#
# Third check: coordinator files that dispatch specialists CONCURRENTLY ("Dispatch
# Wave", "emit N HANDOFFs simultaneously / in parallel / in one message") express
# the same naive-spawn assumption in the `HANDOFF to:` prose format rather than
# task() shorthand -- so the two checks above miss them. Any such file must gate on
# has_task_tool / EXECUTOR_SELECTION so it degrades to sequential-inline (Executor
# D) or manual paste (C) when the runtime cannot spawn. This is the exact class
# that let security-auditor ship a gate-less parallel dispatch.
#
# Usage: validate-handoff-discipline.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-handoff-discipline"

ROOT="$(detect_project_root "${1:-}")"
AGENTS_DIR="$ROOT/agents"

if [[ ! -d "$AGENTS_DIR" ]]; then
  note "no agents/ directory at $ROOT -- nothing to check"
  validator_exit
  exit $?
fi

# A file "delegates via shorthand" if it contains a task(agent=...) call.
# Two cues every such file must also carry:
#   translation: ties task() to a HANDOFF block
#   fallback:    a no-spawn path (capability gate / manual paste / parent rules)
TRANSLATION_RE='task\(\) ?→|task\([^)]*\)[^A-Za-z]*HANDOFF|HANDOFF[^A-Za-z]*task\(|shorthand|Delegation Rule'
FALLBACK_RE='has_task_tool|EXECUTOR_SELECTION|emit .*(as )?text|wait for (the )?user|Mandatory rules.*live in|Full rules in'

checked=0
while IFS= read -r f; do
  grep -qE 'task\(agent=' "$f" || continue
  checked=$((checked + 1))
  rel="${f#"$ROOT"/}"

  if ! grep -qiE "$TRANSLATION_RE" "$f"; then
    gap "missing-translation" "$rel uses task() shorthand but never states it maps to a HANDOFF block -- a model will try to call task() the runtime can't spawn."
  fi
  if ! grep -qiE "$FALLBACK_RE" "$f"; then
    gap "missing-fallback" "$rel uses task() shorthand with no no-spawn fallback (has_task_tool gate / manual HANDOFF paste / 'rules live in <parent>')."
  fi
done < <(find "$AGENTS_DIR" -name '*.md' -type f)

# Hard spawn calls that bypass the HANDOFF contract entirely.
while IFS= read -r f; do
  rel="${f#"$ROOT"/}"
  # Ignore lines that are clearly forbidding it ("do not spawn", "never Agent(").
  if grep -nE '\bAgent\(|subagent_type[[:space:]]*[:=]' "$f" \
       | grep -viE 'do not|don.t|never|forbidden|must not' >/dev/null; then
    gap "raw-spawn-call" "$rel references a raw spawn (Agent(...) / subagent_type) outside the HANDOFF contract -- delegation must go through a HANDOFF + EXECUTOR_SELECTION."
  fi
done < <(find "$AGENTS_DIR" -name '*.md' -type f)

# ── Coordinator concurrent-dispatch without an executor gate ───────────
# Cues that a file assumes it can fan out specialists at once.
DISPATCH_RE='Dispatch Wave|Parallel Wave|Emit (ALL|all|[Tt]hree|[Tt]wo|[Ff]our|[Ff]ive|[0-9]+|N) HANDOFF|HANDOFFs? (simultaneously|in parallel|in one message)|emit .*HANDOFFs simultaneously'
# A file is gated if it STATES a no-spawn behavior: the has_task_tool branch, a
# manual-paste path (emit as text / wait for user / open N sessions), sequential
# or inline execution, the Delegation Rule, or a named Executor. A bare pointer to
# EXECUTOR_SELECTION.md is NOT enough -- security-auditor mentioned it for an
# unrelated dispatch while its wave fan-out stayed gate-less.
GATE_RE='has_task_tool|Delegation Rule|emit .*(as )?text|wait for( the)? user|open [0-9A-Za-z ]*session|user opens|Sequential mode|execute each phase directly|run .*inline|Executor [ABCD]'
dispatchers=0
while IFS= read -r f; do
  rel="${f#"$ROOT"/}"
  # Skip reference/protocol docs (agents/shared/**, disable:true) and the
  # parallel-wave protocol, which defines the manual-parallel fallback itself.
  case "$rel" in agents/shared/*) continue ;; esac
  head -8 "$f" | grep -qE 'disable:[[:space:]]*true' && continue
  [[ "$rel" == *"PARALLEL_WAVE_PROTOCOL.md" ]] && continue
  grep -qE "$DISPATCH_RE" "$f" || continue
  dispatchers=$((dispatchers + 1))
  if ! grep -qE "$GATE_RE" "$f"; then
    gap "missing-executor-gate" "$rel dispatches specialists concurrently (Dispatch Wave / parallel or simultaneous HANDOFFs) but never gates on has_task_tool / EXECUTOR_SELECTION -- opencode cannot spawn, so it must degrade to sequential-inline (Executor D) or manual paste (C)."
  fi
done < <(find "$AGENTS_DIR" -name '*.md' -type f)

note "checked $checked task()-shorthand file(s) and $dispatchers concurrent-dispatch coordinator(s)"
validator_exit
