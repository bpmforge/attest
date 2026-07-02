#!/usr/bin/env bash
#
# validate-autonomy-wiring.sh -- every by-design pause must be autonomy-aware.
#
# Wave O1 adds an autonomy level (AUTONOMY_PROTOCOL.md): in `auto` mode a gated
# pause takes its documented default + logs to APPROVALS.md instead of waiting.
# For that to actually happen, each pause site must carry the autonomy handling
# inline -- prose-only rules drift (the lesson from validate-handoff-discipline).
#
# This validator finds pause directives ("wait for the user", "do not
# auto-continue", "get approval first", "do not execute yet", "do not
# auto-advance") in agents/** and fails any that lack an autonomy reference
# (AUTONOMY_PROTOCOL / autonomy=auto / APPROVALS.md / NEVER-AUTO) within +-5
# lines. Pure reference/template docs that only quote the phrases are exempt.
#
# Usage: validate-autonomy-wiring.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-autonomy-wiring"

ROOT="$(detect_project_root "${1:-}")"
AGENTS_DIR="$ROOT/agents"

if [[ ! -d "$AGENTS_DIR" ]]; then
  note "no agents/ directory at $ROOT -- nothing to check"
  validator_exit; exit $?
fi

PAUSE_RE='wait for (the )?user|do not auto-continue|get approval first|do not execute yet|do not auto-advance'
AUTON_RE='AUTONOMY_PROTOCOL|autonomy[:= ]*auto|APPROVALS\.md|NEVER-AUTO'

is_exempt() {
  case "$1" in
    */HANDOFF_TEMPLATES.md|*/HANDOFF_QUICK_REF.md|*/SESSION_PRIMER.md \
    |*/AUTONOMY_PROTOCOL.md|*/PERSISTENCE.md|*_METHODOLOGY.md|agents/templates/*) return 0 ;;
  esac
  return 1
}

checked=0
while IFS= read -r f; do
  rel="${f#"$ROOT"/}"
  is_exempt "$rel" && continue
  # every pause-directive line number in this file
  while IFS=: read -r ln _; do
    [[ -z "$ln" ]] && continue
    checked=$((checked + 1))
    lo=$((ln - 5)); [[ $lo -lt 1 ]] && lo=1
    hi=$((ln + 5))
    if ! sed -n "${lo},${hi}p" "$f" | grep -qiE "$AUTON_RE"; then
      line_text="$(sed -n "${ln}p" "$f" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | cut -c1-70)"
      gap "ungated-pause" "$rel:$ln has a pause directive with no autonomy handling within +-5 lines -- add the AUTONOMY_PROTOCOL gate or mark NEVER-AUTO. [$line_text]"
    fi
  done < <(grep -niE "$PAUSE_RE" "$f" | cut -d: -f1)
done < <(find "$AGENTS_DIR" -name '*.md' -type f)

note "checked $checked pause directive(s) for autonomy wiring"
validator_exit
