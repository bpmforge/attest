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

# Process substitution (`< <(...)`), NOT a pipe (`... | while read`): a pipe
# runs the while-loop in a SUBSHELL, so gap()'s GAP_COUNT increment is
# invisible to the parent shell once the subshell exits -- validator_exit()
# would then report exit 0 (clean) even though a real gap was written to the
# gap file and shown in the JSON `items` array. Found via the T22.5 red
# fixture: a story missing acceptance criteria showed up correctly in
# `items` but the validator still exited 0. Same fix already used correctly
# a few lines up for the persona-coverage loop.
while IFS= read -r story; do
  [[ -n "$story" ]] && gap "missing-ac" "story without acceptance criteria: $story"
done < <(awk '
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
' "$US")

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

# -- Traceability check: each user story should trace back to a UC or source
# Look for UC-NN references or Source:/Trace: fields in the document
uc_refs=$(grep -cE '(UC-[0-9]+|FR-[0-9]+|Source[[:space:]]*:|Trace[[:space:]]*:|Derived[[:space:]]+from)' "$US" || true)
story_count=$(grep -cE '^##[[:space:]]' "$US" || true)

if [[ "${story_count:-0}" -gt 0 && "${uc_refs:-0}" -eq 0 ]]; then
  gap "missing-traceability" "USER_STORIES.md has no traceability references (UC-NN, FR-NN, or Source: fields) — each story should trace to a use case or requirement"
else
  pass "traceability references found ($uc_refs across $story_count stories)"
fi

validator_exit
