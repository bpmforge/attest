#!/usr/bin/env bash
#
# validate-persistence-block.sh -- executor/coding agents must carry the
# anti-announce-then-stop rule (agents/shared/PERSISTENCE.md).
#
# The #1 accidental pause: a model announces "I'll now edit X" and ends the turn
# with no tool call, so the runtime legitimately ends the loop. The prompt-side
# fix (OpenAI persistence reminder, ~+20% SWE-bench) is PERSISTENCE.md. This
# validator ensures every agent that does tool-heavy execution or emits
# delegation actually carries the rule -- directly, or transitively through a
# shared contract that embeds it (MODEL_ADAPTER / BOUNDED_TASK_CONTRACT), or by
# stating the rule inline. Prose-only rules drift; this holds (same lesson as
# validate-handoff-discipline.sh).
#
# Usage: validate-persistence-block.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-persistence-block"

ROOT="$(detect_project_root "${1:-}")"
AGENTS_DIR="$ROOT/agents"

if [[ ! -d "$AGENTS_DIR" ]]; then
  note "no agents/ directory at $ROOT -- nothing to check"
  validator_exit; exit $?
fi

# Executor/coding duty: emits delegation (task()/HANDOFF) or is a coding executor.
EXECUTOR_RE='task\(agent=|paste this EXACT prompt to /|SDLC-TASK for |coding-agent'
# Carries persistence: direct ref, transitive via a contract that embeds it, or the rule inline.
CARRIES_RE='PERSISTENCE\.md|MODEL_ADAPTER\.md|BOUNDED_TASK_CONTRACT\.md|end your turn after (merely )?announc|never end your turn after|announc[a-z]* an action'

checked=0
while IFS= read -r f; do
  rel="${f#"$ROOT"/}"
  # Skip reference/protocol docs (shared, templates, disable:true, methodology,
  # parallel-wave protocol) -- they are loaded into an agent's context, not
  # independent executors that end turns.
  case "$rel" in agents/shared/*|agents/templates/*|*/METHODOLOGY.md|*_METHODOLOGY.md|*PARALLEL_WAVE_PROTOCOL.md) continue ;; esac
  head -8 "$f" | grep -qE 'disable:[[:space:]]*true' && continue
  grep -qE "$EXECUTOR_RE" "$f" || continue
  checked=$((checked + 1))
  if ! grep -qE "$CARRIES_RE" "$f"; then
    gap "missing-persistence" "$rel does executor/coding work but carries no persistence rule -- reference agents/shared/PERSISTENCE.md (or MODEL_ADAPTER/BOUNDED_TASK_CONTRACT, which embed it) so it will not announce-then-stop."
  fi
done < <(find "$AGENTS_DIR" -name '*.md' -type f)

note "checked $checked executor/coding agent(s) for the persistence rule"
validator_exit
