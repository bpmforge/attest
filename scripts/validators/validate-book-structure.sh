#!/usr/bin/env bash
#
# validate-book-structure.sh — verify a docs/ subdirectory is a valid book
#
# Supports 2-level nesting:
#   Level 1 — flat chapter files (01-topic.md)
#   Level 2 — chapter directories (02-topic/) with sub-chapter files inside
#
# A valid book has:
#   - README.md with a markdown table containing links
#   - At least 2 chapter entries (files or directories)
#   - Every flat chapter file: nav bar + ≤MAX_LINES lines
#   - Every chapter directory: README.md with nav table + ≥1 sub-chapter files
#   - Every sub-chapter: nav bars (book + chapter breadcrumbs) + ≤MAX_LINES lines
#   - No 3rd-level nesting
#
# Usage:
#   validate-book-structure.sh <book-dir>
#
# Exit: 0 = valid, 1 = invalid, 2 = usage error
# stdout: JSON findings
# stderr: human-readable summary

set -o pipefail

MAX_LINES=400
BOOK_DIR="${1:-}"

if [[ -z "$BOOK_DIR" || ! -d "$BOOK_DIR" ]]; then
  echo "Usage: validate-book-structure.sh <book-dir>" >&2
  echo '{"ok":false,"error":"book-dir not found or not specified"}'
  exit 2
fi

BOOK_DIR="$(cd "$BOOK_DIR" && pwd)"

errors=()
warnings=()

emit_error() { errors+=("$1"); }
emit_warning() { warnings+=("$1"); }

# ── Helpers ────────────────────────────────────────────────────────────────

check_nav_bar() {
  local file="$1" label="$2"
  if ! grep -q '\[🏠' "$file" && ! grep -q '\[.*Index\]' "$file"; then
    emit_error "Chapter $label is missing nav bar — add [🏠 Index](README.md) at top and bottom"
  fi
}

check_sub_nav_bar() {
  local file="$1" label="$2"
  # Sub-chapters need both book and chapter breadcrumbs
  if ! grep -q '\[🏠' "$file" && ! grep -q '\[.*Index\]' "$file"; then
    emit_error "Sub-chapter $label is missing nav bars — add [🏠 Book](../README.md) and [📖 Chapter](README.md)"
  fi
}

check_line_count() {
  local file="$1" label="$2"
  local lc
  lc=$(wc -l < "$file")
  if [[ $lc -gt $MAX_LINES ]]; then
    emit_warning "$label is ${lc} lines (limit ${MAX_LINES}) — consider splitting further"
  fi
}

has_nav_table() {
  grep -qE '^\|.*\[.*\]\(.*\.md\).*\|' "$1"
}

# ── Check 1: Book README.md ────────────────────────────────────────────────
if [[ ! -f "$BOOK_DIR/README.md" ]]; then
  emit_error "Missing README.md — book index is required"
elif ! has_nav_table "$BOOK_DIR/README.md"; then
  emit_error "README.md has no navigation table — add | Chapter | Summary | table with links"
fi

# ── Collect top-level chapter files ───────────────────────────────────────
chapter_files=()
while IFS= read -r -d '' f; do
  fname="$(basename "$f")"
  if [[ "$fname" != "README.md" && "$fname" =~ ^[0-9A-Z] ]]; then
    chapter_files+=("$f")
  fi
done < <(find "$BOOK_DIR" -maxdepth 1 -mindepth 1 -name "*.md" -print0 2>/dev/null | sort -z)

# ── Collect top-level chapter directories ─────────────────────────────────
chapter_dirs=()
while IFS= read -r -d '' d; do
  dname="$(basename "$d")"
  if [[ "$dname" =~ ^[0-9A-Z] ]]; then
    chapter_dirs+=("$d")
  fi
done < <(find "$BOOK_DIR" -maxdepth 1 -mindepth 1 -type d -print0 2>/dev/null | sort -z)

n_chapter_files=${#chapter_files[@]}
n_chapter_dirs=${#chapter_dirs[@]}
total_chapters=$(( n_chapter_files + n_chapter_dirs ))

# ── Check 2: Minimum chapter count ────────────────────────────────────────
if [[ $total_chapters -lt 2 ]]; then
  emit_error "Book has $total_chapters chapter entry — minimum 2 required (split content into chapters)"
fi

# ── Check 3: Flat chapter files ───────────────────────────────────────────
for cf in "${chapter_files[@]}"; do
  label="$(basename "$cf")"
  check_nav_bar "$cf" "$label"
  check_line_count "$cf" "$label"
done

# ── Check 4: Chapter directories (sub-chapter level) ─────────────────────
for cdir in "${chapter_dirs[@]}"; do
  dname="$(basename "$cdir")"

  # 4a: Chapter directory must have README.md
  if [[ ! -f "$cdir/README.md" ]]; then
    emit_error "Chapter directory $dname/ is missing README.md — add a chapter index"
    continue
  fi

  # 4b: Chapter README must have nav table
  if ! has_nav_table "$cdir/README.md"; then
    emit_error "Chapter $dname/README.md has no navigation table — add sub-page links"
  fi

  # 4c: Collect sub-chapter files
  sub_files=()
  while IFS= read -r -d '' sf; do
    sfname="$(basename "$sf")"
    if [[ "$sfname" != "README.md" && "$sfname" =~ ^[0-9A-Z] ]]; then
      sub_files+=("$sf")
    fi
  done < <(find "$cdir" -maxdepth 1 -mindepth 1 -name "*.md" -print0 2>/dev/null | sort -z)

  if [[ ${#sub_files[@]} -lt 1 ]]; then
    emit_error "Chapter directory $dname/ has no sub-chapter files — add at least one 01-*.md"
  fi

  # 4d: Each sub-chapter needs nav bars and size check
  for sf in "${sub_files[@]}"; do
    label="$dname/$(basename "$sf")"
    check_sub_nav_bar "$sf" "$label"
    check_line_count "$sf" "$label"
  done

  # 4e: Warn on 3rd-level nesting
  while IFS= read -r -d '' subdir; do
    emit_warning "3-level nesting: $dname/$(basename "$subdir")/ — flatten or consolidate (max depth is 2)"
  done < <(find "$cdir" -maxdepth 1 -mindepth 1 -type d -print0 2>/dev/null)
done

# ── Summary ────────────────────────────────────────────────────────────────
error_count=${#errors[@]}
warning_count=${#warnings[@]}

{
  if [[ $error_count -eq 0 && $warning_count -eq 0 ]]; then
    echo "validate-book-structure: PASS — $BOOK_DIR ($total_chapters chapters, $n_chapter_dirs with sub-pages)"
  else
    echo "validate-book-structure: $error_count errors, $warning_count warnings — $BOOK_DIR"
    for e in "${errors[@]}"; do echo "  ERROR: $e"; done
    for w in "${warnings[@]}"; do echo "  WARN:  $w"; done
  fi
} >&2

# ── JSON output ────────────────────────────────────────────────────────────
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

printf '{"ok":%s,"errors":%d,"warnings":%d,"chapters":%d,"chapter_dirs":%d,"errors_list":%s,"warnings_list":%s}\n' \
  "$([ $error_count -eq 0 ] && echo true || echo false)" \
  "$error_count" \
  "$warning_count" \
  "$total_chapters" \
  "$n_chapter_dirs" \
  "$errors_json" \
  "$warnings_json"


# Telemetry (plan 4.12) — same row shape as _lib.sh validator_exit.
if [[ "${EXPERTS_TELEMETRY:-1}" != "0" ]]; then
  {
    mkdir -p docs/work &&
    printf '{"ts":"%s","source":"validator","validator":"validate-book-structure","gaps":%d,"exit":%d}\n' \
      "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$error_count" "$([ $error_count -eq 0 ] && echo 0 || echo 1)" \
      >> docs/work/telemetry.jsonl
  } 2>/dev/null || true
fi

[[ $error_count -eq 0 ]]
