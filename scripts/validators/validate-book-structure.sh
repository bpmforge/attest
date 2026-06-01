#!/usr/bin/env bash
#
# validate-book-structure.sh — verify a docs/ subdirectory is a valid book
#
# A valid book has:
#   - README.md with a markdown table containing links
#   - At least 2 chapter files (*.md other than README.md and A-*.md)
#   - Every chapter file has nav bars: at least one [🏠 Index] link
#   - No chapter file exceeds MAX_LINES lines
#
# Usage:
#   validate-book-structure.sh <book-dir>
#
# Exit: 0 = valid, 1 = invalid, 2 = usage error
# stdout: JSON findings
# stderr: human-readable summary
#

set -uo pipefail

MAX_LINES=400
BOOK_DIR="${1:-}"

if [[ -z "$BOOK_DIR" || ! -d "$BOOK_DIR" ]]; then
  echo "Usage: validate-book-structure.sh <book-dir>" >&2
  echo '{"ok":false,"error":"book-dir not found or not specified"}'
  exit 2
fi

# Normalize path
BOOK_DIR="$(cd "$BOOK_DIR" && pwd)"

errors=()
warnings=()

emit_error() { errors+=("$1"); }
emit_warning() { warnings+=("$1"); }

# ── Check 1: README.md exists ──────────────────────────────────────────────
if [[ ! -f "$BOOK_DIR/README.md" ]]; then
  emit_error "Missing README.md — book index is required"
fi

# ── Check 2: README.md has a nav table (at least one |...|..| row with a link)
if [[ -f "$BOOK_DIR/README.md" ]]; then
  if ! grep -qE '^\|.*\[.*\]\(.*\.md\).*\|' "$BOOK_DIR/README.md"; then
    emit_error "README.md has no navigation table — add a | Chapter | Summary | table with links to chapter files"
  fi
fi

# ── Check 3: At least 2 chapter files (numbered: 01-*, 02-*, etc.)
chapter_files=()
while IFS= read -r -d '' f; do
  fname="$(basename "$f")"
  # Include numbered chapters and appendices; exclude README.md
  if [[ "$fname" != "README.md" && "$fname" =~ ^[0-9A-Z] ]]; then
    chapter_files+=("$f")
  fi
done < <(find "$BOOK_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null | sort -z)

if [[ ${#chapter_files[@]} -lt 2 ]]; then
  emit_error "Book has ${#chapter_files[@]} chapter file(s) — minimum 2 required (split the content into chapters)"
fi

# ── Check 4: Every chapter has a nav bar (contains index link)
for cf in "${chapter_files[@]}"; do
  fname="$(basename "$cf")"
  if ! grep -q '\[.*Index\]' "$cf" && ! grep -q '\[🏠' "$cf"; then
    emit_error "Chapter $fname is missing nav bar — add [🏠 Index](README.md) at top and bottom"
  fi
done

# ── Check 5: No chapter exceeds MAX_LINES
for cf in "${chapter_files[@]}"; do
  fname="$(basename "$cf")"
  lc=$(wc -l < "$cf")
  if [[ $lc -gt $MAX_LINES ]]; then
    emit_warning "Chapter $fname is ${lc} lines (limit ${MAX_LINES}) — consider splitting further"
  fi
done

# ── Summary ────────────────────────────────────────────────────────────────
error_count=${#errors[@]}
warning_count=${#warnings[@]}

{
  if [[ $error_count -eq 0 && $warning_count -eq 0 ]]; then
    echo "validate-book-structure: PASS — $BOOK_DIR (${#chapter_files[@]} chapters)"
  else
    echo "validate-book-structure: $error_count errors, $warning_count warnings — $BOOK_DIR"
    for e in "${errors[@]}"; do echo "  ERROR: $e"; done
    for w in "${warnings[@]}"; do echo "  WARN:  $w"; done
  fi
} >&2

# Build JSON
errors_json="["
for i in "${!errors[@]}"; do
  [[ $i -gt 0 ]] && errors_json+=","
  errors_json+="\"${errors[$i]//\"/\\\"}\""
done
errors_json+="]"

warnings_json="["
for i in "${!warnings[@]}"; do
  [[ $i -gt 0 ]] && warnings_json+=","
  warnings_json+="\"${warnings[$i]//\"/\\\"}\""
done
warnings_json+="]"

printf '{"ok":%s,"errors":%d,"warnings":%d,"chapters":%d,"errors_list":%s,"warnings_list":%s}\n' \
  "$([ $error_count -eq 0 ] && echo true || echo false)" \
  "$error_count" \
  "$warning_count" \
  "${#chapter_files[@]}" \
  "$errors_json" \
  "$warnings_json"

[[ $error_count -eq 0 ]]
