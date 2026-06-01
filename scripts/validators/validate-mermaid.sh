#!/usr/bin/env bash
#
# validate-mermaid.sh — scan markdown files for Mermaid syntax problems
#
# Checks (static analysis, no external renderer required):
#   M001  Unquoted / in node label          [/sdlc] → ["/sdlc"]
#   M002  Semicolon in Note over text       Note over X: a; b  → Note over X: a, b
#   M003  Unicode → in Mermaid block        → should be ->
#   M004  Unquoted | in node label context  [a|b text] (likely meant "alias pipe")
#   M005  Empty node label                  [] or ()
#   M006  Unclosed mermaid fenced block
#
# Usage:
#   validate-mermaid.sh [root-dir] [scan-path]
#   Defaults: root-dir=$(pwd), scan-path=root-dir/docs
#
# Exit: 0 = clean, 1 = errors found, 2 = invocation error
# stdout: one JSON object per line: {"file":"...","line":N,"code":"...","message":"...","severity":"error|warning"}
# stderr: human-readable summary
#

set -uo pipefail

ROOT="${1:-$(pwd)}"
SCAN_PATH="${2:-$ROOT/docs}"

[[ ! -d "$SCAN_PATH" ]] && SCAN_PATH="$ROOT"

total_errors=0
total_warnings=0
files_scanned=0

emit() {
  # emit JSON finding to stdout
  local severity="$1" file="$2" line="$3" code="$4" msg="$5"
  # escape double quotes in msg
  msg="${msg//\"/\\\"}"
  printf '{"severity":"%s","file":"%s","line":%d,"code":"%s","message":"%s"}\n' \
    "$severity" "$file" "$line" "$code" "$msg"
}

scan_file() {
  local file="$1"
  local in_mermaid=0
  local mermaid_open_line=0
  local diagram_type=""
  local lineno=0
  local file_errors=0
  local file_warnings=0

  while IFS= read -r rawline; do
    lineno=$((lineno + 1))
    line="$rawline"

    # ── fence tracking ─────────────────────────────────────────────────────
    if [[ "$line" =~ ^[[:space:]]*\`\`\`([a-zA-Z]*)$ ]]; then
      local lang="${BASH_REMATCH[1]:-}"
      if [[ $in_mermaid -eq 0 && "$lang" == "mermaid" ]]; then
        in_mermaid=1
        mermaid_open_line=$lineno
        diagram_type=""
      elif [[ $in_mermaid -eq 1 ]]; then
        in_mermaid=0
        diagram_type=""
      fi
      continue
    fi

    [[ $in_mermaid -eq 0 ]] && continue

    # Detect diagram type from first keyword line
    if [[ -z "$diagram_type" && "$line" =~ ^[[:space:]]*(sequenceDiagram|flowchart|graph|erDiagram|stateDiagram|classDiagram) ]]; then
      diagram_type="${BASH_REMATCH[1]}"
      continue
    fi

    # ── M001: unquoted / in square-bracket node label ──────────────────────
    # Match [...] where content has / but is not already "..."
    # Exclude <br/> which is intentional HTML
    local stripped_br="${line//<br\/>/BRPLACEHOLDER}"
    if [[ "$stripped_br" =~ \[([^\[\]\"]*\/[^\[\]\"]*)\] ]]; then
      local label="${BASH_REMATCH[1]}"
      # Ignore if the / appears inside a quoted edge label  -->|"text/text"|
      local arrow_label_pattern='-->\|.*".*".*\|'
      if [[ ! "$line" =~ $arrow_label_pattern ]]; then
        emit "error" "$file" "$lineno" "M001" \
          "Unquoted / in node label: [${label}] — wrap in double quotes: [\"${label}\"]"
        file_errors=$((file_errors + 1))
      fi
    fi

    # ── M002: semicolon in Note over text ──────────────────────────────────
    if [[ "$line" =~ ^[[:space:]]*Note[[:space:]]+over[[:space:]]+[A-Za-z,[:space:]]+:[[:space:]].*\; ]]; then
      emit "error" "$file" "$lineno" "M002" \
        "Semicolon in Note over text breaks Mermaid parser — replace ; with , or remove"
      file_errors=$((file_errors + 1))
    fi

    # ── M003: Unicode arrow → in Mermaid block ─────────────────────────────
    if [[ "$line" == *"→"* ]]; then
      emit "error" "$file" "$lineno" "M003" \
        "Unicode arrow → in Mermaid block — replace with ASCII ->"
      file_errors=$((file_errors + 1))
    fi

    # ── M004: unquoted | in square-bracket label (likely pipe-syntax confusion)
    # Skip database shape syntax like [a|b] which is intentional
    if [[ "$line" =~ \[([^\[\]\"]+)[[:space:]]\|[[:space:]]([^\[\]\"]+)\] ]]; then
      emit "warning" "$file" "$lineno" "M004" \
        "Possible unquoted | inside node label — use quoted label or check syntax"
      file_warnings=$((file_warnings + 1))
    fi

    # ── M005: empty node label ─────────────────────────────────────────────
    if [[ "$line" =~ [^a-zA-Z0-9]\[\][[:space:]] || "$line" =~ [^a-zA-Z0-9]\(\)[[:space:]] ]]; then
      emit "error" "$file" "$lineno" "M005" \
        "Empty node label [] or () — all Mermaid nodes must have labels"
      file_errors=$((file_errors + 1))
    fi

  done < "$file"

  # ── M006: unclosed mermaid block ───────────────────────────────────────
  if [[ $in_mermaid -eq 1 ]]; then
    emit "error" "$file" "$mermaid_open_line" "M006" \
      "Unclosed mermaid code block — missing closing backtick fence"
    file_errors=$((file_errors + 1))
  fi

  total_errors=$((total_errors + file_errors))
  total_warnings=$((total_warnings + file_warnings))
  [[ $((file_errors + file_warnings)) -gt 0 ]] && return 1 || return 0
}

# ── scan all markdown files ───────────────────────────────────────────────────

while IFS= read -r -d '' mdfile; do
  [[ "$mdfile" == *"/node_modules/"* ]] && continue
  [[ "$mdfile" == *"/.git/"* ]] && continue
  files_scanned=$((files_scanned + 1))
  scan_file "$mdfile" || true
done < <(find "$SCAN_PATH" -name "*.md" -print0 2>/dev/null)

# ── summary to stderr ─────────────────────────────────────────────────────────
{
  if [[ $total_errors -eq 0 && $total_warnings -eq 0 ]]; then
    echo "validate-mermaid: PASS — $files_scanned files scanned, no issues found"
  else
    echo "validate-mermaid: $total_errors errors, $total_warnings warnings across $files_scanned files"
    echo ""
    echo "Codes:"
    echo "  M001  Unquoted / in node label"
    echo "  M002  Semicolon in Note over text"
    echo "  M003  Unicode → arrow"
    echo "  M004  Unquoted | in node label"
    echo "  M005  Empty node label"
    echo "  M006  Unclosed mermaid block"
  fi
} >&2

[[ $total_errors -eq 0 ]]
