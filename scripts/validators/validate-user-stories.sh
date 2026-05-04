#!/usr/bin/env bash
#
# validate-user-stories.sh -- every user story in docs/USER_STORIES.md must
# have an acceptance criteria block (Given/When/Then or numbered list >= 3
# items). Cross-check: every persona in USER_PERSONAS.md has at least one story.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-user-stories"

ROOT="$(detect_project_root "${1:-}")"

US="$ROOT/docs/USER_STORIES.md"
PERSONAS="$ROOT/docs/USER_PERSONAS.md"

if [[ ! -f "$US" ]]; then
  warn "no docs/USER_STORIES.md found — skipping"
  validator_exit
fi

# A user story is a heading "## US-NN" or "## Story <NN>" or "### As a ..."
# We scan for "## " sections and check each has acceptance criteria within
# the section.

awk '
  /^## / {
    if (in_story) {
      if (!has_ac) print prev_id
    }
    in_story = 0
    has_ac = 0
    if ($0 ~ /[Uu][Ss]-?[0-9]+/ || $0 ~ /[Ss]tory/ || $0 ~ /^##[[:space:]]+As[[:space:]]+a/) {
      in_story = 1
      prev_id = $0
      sub(/^## /, "", prev_id)
    }
    next
  }
  in_story && /[Gg]iven/ && /[Ww]hen/ && /[Tt]hen/ { has_ac = 1 }
  in_story && /[Aa]cceptance[[:space:]]+[Cc]riteria/ { has_ac = 1 }
  in_story && /^[[:space:]]*[0-9]+\./ { ac_count++; if (ac_count >= 3) has_ac = 1 }
  in_story && /^[[:space:]]*[-*][[:space:]]/ { bullet_count++; if (bullet_count >= 3) has_ac = 1 }
  /^## / { ac_count = 0; bullet_count = 0 }
  END {
    if (in_story && !has_ac) print prev_id
  }
' "$US" | while IFS= read -r story; do
  [[ -n "$story" ]] && gap "missing-ac" "story without acceptance criteria: $story"
done

# Cross-check: every persona has at least one story
if [[ -f "$PERSONAS" ]]; then
  while IFS= read -r persona_line; do
    [[ -z "$persona_line" ]] && continue
    persona=$(echo "$persona_line" | sed -E 's/^##[[:space:]]+//; s/[[:space:]]*\(.*//; s/[[:space:]]*$//')
    [[ -z "$persona" ]] && continue
    if ! grep -qiE "\b${persona}\b" "$US" 2>/dev/null; then
      gap "uncovered-persona" "persona '$persona' has no story referencing them in USER_STORIES.md"
    fi
  done < <(grep -E '^##[[:space:]]+[A-Z]' "$PERSONAS" 2>/dev/null | head -20)
fi

validator_exit
