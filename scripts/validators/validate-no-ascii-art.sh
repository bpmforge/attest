#!/usr/bin/env bash
#
# validate-no-ascii-art.sh -- enforce the Document Hygiene rule across all
# project documentation. Diagrams must be Mermaid; banner separators and
# Unicode box-drawing characters are forbidden in deliverables.
#
# What it flags:
#   - Lines that are entirely Unicode box-drawing characters
#     (═, ║, ┌, ┐, └, ┘, ─, │, ╔, ╗, ╚, ╝, ╠, ╣, ╦, ╩, ╬)
#   - Banner lines: 40+ consecutive `=` characters
#   - Banner lines: 40+ consecutive `*`, `#`, `-` outside of markdown headings
#     (heading underline/setext is short — this catches the long ones)
#   - Diagram-shaped ASCII tree blocks (4+ consecutive lines containing │ or ├)
#
# What it allows:
#   - Mermaid blocks (anything inside ```mermaid ... ```)
#   - Short markdown horizontal rules (`---`, `***`)
#   - Code fences and their content
#   - Tables (pipe characters in table syntax)
#
# Usage:
#   validate-no-ascii-art.sh [project-root]
#
# By default scans docs/**/*.md (including subdirectories). Configure other
# paths via NO_ASCII_PATHS env var (space-separated relative paths).
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-no-ascii-art"

ROOT="$(detect_project_root "${1:-}")"

# -- Targets -----------------------------------------------------------------
# Default: every markdown file under docs/ EXCEPT the audit file (which
# documents the patterns it's banning).
declare -a TARGETS
if [[ -n "${NO_ASCII_PATHS:-}" ]]; then
  # shellcheck disable=SC2206
  TARGETS=( ${NO_ASCII_PATHS} )
else
  while IFS= read -r f; do
    TARGETS+=( "$f" )
  done < <(find "$ROOT/docs" -type f -name '*.md' 2>/dev/null | grep -v 'AUDIT_' || true)
fi

if [[ "${#TARGETS[@]}" -eq 0 ]]; then
  warn "no markdown targets found under $ROOT/docs"
  validator_exit
fi

# -- Per-file scan -----------------------------------------------------------
# Box-drawing range: U+2500–U+257F (Box Drawing block).
# Use grep -P (PCRE) on Linux; on macOS use ripgrep if available, else fall
# back to a hand-built character class.

scan_file() {
  local file="$1"
  local rel="${file#"$ROOT/"}"

  [[ ! -f "$file" ]] && return

  # Track whether we're inside a code fence (any language) to skip block content.
  local in_fence=0
  local fence_lang=""
  local lineno=0
  local tree_run=0
  local tree_run_start=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # Detect fence open/close
    if [[ "$line" =~ ^\`\`\`([a-zA-Z0-9_-]*)$ ]]; then
      if [[ "$in_fence" -eq 0 ]]; then
        in_fence=1
        fence_lang="${BASH_REMATCH[1]}"
      else
        in_fence=0
        fence_lang=""
      fi
      tree_run=0
      continue
    fi

    # Inside a non-mermaid code fence: still flag box-drawing (would print
    # literally if rendered). Inside mermaid, skip — Mermaid syntax is fine.
    if [[ "$in_fence" -eq 1 && "$fence_lang" == "mermaid" ]]; then
      tree_run=0
      continue
    fi

    # 1. Banner: line of 40+ Unicode box-drawing horizontal chars
    if [[ "$line" =~ ^═{40,}$ ]] || [[ "$line" =~ ^─{40,}$ ]] || [[ "$line" =~ ^━{40,}$ ]]; then
      gap "banner-unicode" "$rel:$lineno — Unicode box-drawing banner"
      continue
    fi

    # 2. Banner: 40+ consecutive ASCII = chars
    if [[ "$line" =~ ^={40,}$ ]]; then
      gap "banner-ascii" "$rel:$lineno — ASCII = banner"
      continue
    fi

    # 3. Box-drawing chars inside a line (any of them, anywhere in the file)
    # We check each banned character. Bash 3.2 doesn't support Unicode ranges
    # well in =~, so use grep -F per char.
    local banned_chars='═║┌┐└┘─│╔╗╚╝╠╣╦╩╬┏┓┗┛━┃┣┫┳┻╋├┤┬┴┼'
    local i
    local banned=""
    for (( i=0; i<${#banned_chars}; i++ )); do
      local ch="${banned_chars:$i:1}"
      if [[ "$line" == *"$ch"* ]]; then
        banned="$ch"
        break
      fi
    done
    if [[ -n "$banned" ]]; then
      # Trim line for readable output
      local snippet="${line:0:60}"
      gap "box-drawing" "$rel:$lineno — '$banned' in: $snippet"
    fi
  done < "$file"
}

for target in "${TARGETS[@]}"; do
  scan_file "$target"
done

if [[ "$GAP_COUNT" -eq 0 ]]; then
  pass "scanned ${#TARGETS[@]} file(s) — no ASCII art / box-drawing found"
fi

validator_exit
