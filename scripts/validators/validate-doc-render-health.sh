#!/usr/bin/env bash
#
# validate-doc-render-health.sh -- markdown-table orphan-fragment linter
# (T29.9, H8/C-2/C-3).
#
# This repo's published docs have twice suffered real, observed rendering
# bugs that look "fine" in a plain-text diff but are genuinely broken once
# rendered: (1) a Mermaid node label containing an unescaped backtick, which
# breaks the Mermaid parser and makes the rendering tool silently fall back
# to showing the raw ```mermaid code block; (2) a markdown table where a
# data row is not preceded (in the same contiguous block) by a valid
# header + separator row, which renders as an orphaned pipe-delimited text
# fragment instead of a table in most Markdown renderers.
#
# Split of responsibility (deliberate, not accidental duplication):
#   - Mermaid diagram health (including the backtick bug, M013) lives in
#     validate-mermaid.sh, which already owns Mermaid fence-tracking and
#     label parsing -- extending it kept one parser instead of two.
#   - THIS validator owns the markdown-table half, which is not
#     Mermaid-specific at all (it applies to any ordinary markdown table).
# Both are chained together in validate-phase-gate.sh's doc-hygiene set, so
# together they form the "render-health" gate the ticket describes: every
# diagram renders as a diagram (validate-mermaid.sh), every table renders as
# a table (this validator).
#
# Table-orphan-fragment check:
#   A contiguous run of `|`-delimited lines (no blank line, no fence
#   boundary in between) is only a valid table if its first line is a
#   header row and its SECOND line is a valid separator row (cells made up
#   only of `-`, `:`, and whitespace, e.g. `|---|---|` or `| :-- | --: |`).
#   A run that doesn't satisfy that -- a lone data row after a blank line
#   with no header above it, or a run whose second line isn't a real
#   separator -- renders as literal pipe-delimited text in most renderers.
#   Runs inside fenced code blocks (```...```, including ```mermaid) are
#   skipped entirely -- a shell pipe in a code sample is not a table.
#
# Usage:
#   validate-doc-render-health.sh [project-root] [scan-path]
#   Defaults: project-root=$(pwd), scan-path=project-root/docs (falls back
#   to project-root itself if no docs/ dir -- same convention as
#   validate-mermaid.sh, so fixture dirs without a docs/ subdir still scan).
#
# Exit: 0 = clean, 1 = gaps found, 2 = validator error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-doc-render-health"

ROOT="$(detect_project_root "${1:-}")"
SCAN_PATH="${2:-$ROOT/docs}"
[[ ! -d "$SCAN_PATH" ]] && SCAN_PATH="$ROOT"

# Row shape: a line whose trimmed content starts and ends with `|`.
ROW_PATTERN='^[[:space:]]*\|.*\|[[:space:]]*$'

# Separator-row shape: optional leading/trailing |, cells of only
# -, :, and whitespace (any amount, including tabs -- unusual whitespace
# must not defeat this), separated by |. Requires at least one `-`.
SEP_PATTERN='^[[:space:]]*\|?[[:space:]]*:?-+:?[[:space:]]*(\|[[:space:]]*:?-+:?[[:space:]]*)*\|?[[:space:]]*$'

scan_file() {
  local file="$1"
  local rel="${file#"$ROOT/"}"
  local in_fence=0
  local lineno=0
  local run_start=0
  local run_line1=""
  local run_line2=""
  local run_count=0

  flush_run() {
    if [[ $run_count -eq 1 ]]; then
      gap "table-orphan-fragment" "$rel:$run_start — lone \`|\`-delimited row with no header/separator above it: ${run_line1:0:80}"
    elif [[ $run_count -ge 2 && ! "$run_line2" =~ $SEP_PATTERN ]]; then
      gap "table-orphan-fragment" "$rel:$run_start — \`|\`-delimited row run has no valid separator row (line $((run_start + 1)) is not \`---|---\`-shaped): ${run_line1:0:80}"
    fi
    run_count=0
    run_line1=""
    run_line2=""
  }

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # Fence tracking (any language, including mermaid) -- table syntax
    # inside a code block is sample text, not a real table. Both GFM fence
    # styles count (``` and ~~~) -- independent review (2026-07-09) found a
    # ~~~-fenced block containing pipe-delimited sample output was scanned
    # as live markdown and false-positived; not a strict per-style matcher
    # (a ``` line still toggles a ~~~-opened fence and vice versa), same
    # simplification validate-mermaid.sh's own fence tracker already makes.
    if [[ "$line" =~ ^[[:space:]]*(\`\`\`|~~~) ]]; then
      if [[ $in_fence -eq 0 ]]; then
        in_fence=1
      else
        in_fence=0
      fi
      flush_run
      continue
    fi
    if [[ $in_fence -eq 1 ]]; then
      continue
    fi

    if [[ "$line" =~ $ROW_PATTERN ]]; then
      if [[ $run_count -eq 0 ]]; then
        run_start=$lineno
      fi
      run_count=$((run_count + 1))
      if [[ $run_count -eq 1 ]]; then
        run_line1="$line"
      elif [[ $run_count -eq 2 ]]; then
        run_line2="$line"
      fi
    else
      flush_run
    fi
  done < "$file"
  flush_run
}

files_scanned=0
while IFS= read -r -d '' mdfile; do
  [[ "$mdfile" == *"/node_modules/"* ]] && continue
  [[ "$mdfile" == *"/.git/"* ]] && continue
  files_scanned=$((files_scanned + 1))
  scan_file "$mdfile"
done < <(find "$SCAN_PATH" -name "*.md" -print0 2>/dev/null)

if [[ "$GAP_COUNT" -eq 0 ]]; then
  pass "scanned ${files_scanned} file(s) under ${SCAN_PATH#"$ROOT/"} — no orphaned table fragments found"
  note "Mermaid diagram render-health (backtick-in-label, unbalanced brackets, unclosed fences) is checked by validate-mermaid.sh — run both together for full render-health coverage"
fi

validator_exit
