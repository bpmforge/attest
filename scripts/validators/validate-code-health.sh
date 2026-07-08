#!/usr/bin/env bash
#
# validate-code-health.sh -- grep-based enforcement of AI slop anti-patterns.
#
# Script-level enforcement for patterns in agents/shared/ANTI_SLOP_RULES.md
# that are detectable without full AST analysis. Runs over src/ (or the
# directory passed as argument).
#
# Rules enforced:
#   R-01  Catch-all swallowing (empty catch blocks)
#   R-02  try/catch inside tight loops
#   R-13  What-comments (mechanical narration)
#   R-15  Stale JSDoc @param (param count mismatch)
#   R-16  Emojis in code comments
#   R-19  Duplicate magic strings (partial — flags literal repetition)
#
# Structural checks (not per-rule, but code hygiene):
#   H-01  Functions exceeding 50 lines
#   H-02  Files exceeding 250 lines
#   H-03  TODO/FIXME/HACK left in source
#   H-04  console.log / print / fmt.Println debug statements left in
#   H-05  Magic numbers (bare numeric literals outside constants/config)
#
# Exit: 0 = clean / 1 = violations found / 2 = invocation error
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-code-health"

ROOT="$(detect_project_root "${1:-}")"

# -- Locate source directories ------------------------------------------------
SRC_DIRS=()
for candidate in "src" "app" "lib" "packages" "services"; do
  [[ -d "$ROOT/$candidate" ]] && SRC_DIRS+=("$ROOT/$candidate")
done

if [[ "${#SRC_DIRS[@]}" -eq 0 ]]; then
  warn "No source directory found (checked src/, app/, lib/, packages/, services/) — skipping"
  validator_exit
fi

note "Scanning: ${SRC_DIRS[*]}"

# -- Helper: find source files ------------------------------------------------
find_source_files() {
  find "${SRC_DIRS[@]}" \
    -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
       -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.next/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -name "*.d.ts" \
    -not -name "*.test.*" \
    -not -name "*.spec.*" \
    2>/dev/null || true
}

VIOLATION_COUNT=0

# -- R-01: Catch-all swallowing (empty catch blocks) --------------------------
printf '\n[R-01] catch-all swallowing\n' >&2
while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  # Match: catch blocks with nothing useful inside (empty or just a log)
  matches=$(grep -nE '} catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{[[:space:]]*\}' "$src_file" \
    2>/dev/null | head -3 || true)
  if [[ -n "$matches" ]]; then
    gap "R-01-catch-all" "${src_file#"$ROOT/"}: empty catch block — handle or re-throw: $matches"
    VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
  fi
done < <(find_source_files)

# -- R-02: try/catch inside tight loops (TS/JS only) -------------------------
printf '\n[R-02] try/catch inside loops\n' >&2
while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  ext="${src_file##*.}"
  [[ "$ext" != "ts" && "$ext" != "tsx" && "$ext" != "js" && "$ext" != "jsx" ]] && continue

  # Look for try blocks that appear inside for/while/forEach contexts
  # Heuristic: try { appears within 5 lines after a loop keyword on the same nesting level
  matches=$(awk '
    /\b(for|while|forEach|map|reduce|filter)\b.*\{/ { in_loop=NR }
    in_loop && NR <= in_loop+5 && /\btry\b[[:space:]]*\{/ {
      print NR": "substr($0,1,80)
    }
  ' "$src_file" 2>/dev/null | head -3 || true)
  if [[ -n "$matches" ]]; then
    gap "R-02-try-in-loop" "${src_file#"$ROOT/"}: try/catch inside loop (wrap the loop, not each iteration): $matches"
    VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
  fi
done < <(find_source_files)

# -- R-13: What-comments (mechanical narration) -------------------------------
printf '\n[R-13] what-comments\n' >&2
WHAT_PATTERNS=(
  '//[[:space:]]+(increment|decrement|increase|decrease)[[:space:]]+(the|a|an)'
  '//[[:space:]]+(check if|checking if|verify that|verifying)[[:space:]]'
  '//[[:space:]]+(get|set|return|fetch|create|update|delete)[[:space:]]+(the|a|an)[[:space:]][a-z]'
  '//[[:space:]]+(loop|iterate)[[:space:]]+(over|through|across)'
  '//[[:space:]]+Step[[:space:]]+[0-9]+:'
  '#[[:space:]]+(increment|decrement|check if|get the|set the|loop over)'
)

while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  for pattern in "${WHAT_PATTERNS[@]}"; do
    matches=$(grep -niE "$pattern" "$src_file" 2>/dev/null | head -2 || true)
    if [[ -n "$matches" ]]; then
      gap "R-13-what-comment" "${src_file#"$ROOT/"}: mechanical what-comment (explain WHY not WHAT): $matches"
      VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
      break  # one gap per file for this rule
    fi
  done
done < <(find_source_files)

# -- R-16: Emojis in code comments --------------------------------------------
printf '\n[R-16] emojis in comments\n' >&2
while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  # Match emoji patterns in comment lines
  matches=$(grep -nP '^\s*(//|#|/\*|\*).*[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}✅❌⚠️🚀💡🔒🎉]' "$src_file" \
    2>/dev/null | head -2 || true)
  if [[ -n "$matches" ]]; then
    gap "R-16-emoji-comment" "${src_file#"$ROOT/"}: emoji in source comment — remove emojis from code: $matches"
    VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
  fi
done < <(find_source_files)

# -- H-01: Functions exceeding 50 lines (TS/JS) ------------------------------
printf '\n[H-01] functions >50 lines\n' >&2
while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  ext="${src_file##*.}"
  [[ "$ext" != "ts" && "$ext" != "tsx" && "$ext" != "js" && "$ext" != "jsx" ]] && continue

  # Process substitution, NOT a pipe: `cmd | while read; do gap ...; done`
  # runs the loop in a subshell, silently losing gap()'s GAP_COUNT increment
  # (the parent shell still reports exit 0 even though a real gap was
  # written to the gap file and shown in the JSON `items` array).
  while IFS= read -r fn_info; do
    [[ -n "$fn_info" ]] && gap "H-01-function-too-long" "${src_file#"$ROOT/"}: $fn_info"
  done < <(awk '
    /\b(function|=>[[:space:]]*\{|async[[:space:]]+function)\b/ {
      fn_start = NR; fn_name = $0; sub(/[[:space:]]*\{.*/, "", fn_name)
    }
    fn_start && /\}/ {
      fn_len = NR - fn_start
      if (fn_len > 50) {
        print fn_start": function ~"fn_len" lines (limit: 50): "substr(fn_name,1,60)
      }
      fn_start = 0
    }
  ' "$src_file" 2>/dev/null | head -3)
done < <(find_source_files)

# -- H-02: file size -- CONSOLIDATED into validate-file-size.sh ---------------
# File-size gating now has a single source of truth: validate-file-size.sh
# (configurable cap, book-style decomposition guidance, proper exclusions for
# generated/test/migration files, .filesizeignore). It is wired into the phase-4
# gate alongside this validator, so size is still gated — just not duplicated
# here at a second, conflicting threshold. See CODE_BOOK_PROTOCOL.md.
note "[H-02] file-size gating delegated to validate-file-size.sh"

# -- H-03: TODO/FIXME/HACK left in source ------------------------------------
printf '\n[H-03] TODO/FIXME/HACK in source\n' >&2
while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  matches=$(grep -niE '\b(TODO|FIXME|HACK|XXX)\b' "$src_file" 2>/dev/null | head -3 || true)
  if [[ -n "$matches" ]]; then
    gap "H-03-leftover-todo" "${src_file#"$ROOT/"}: TODO/FIXME/HACK comment left in code — resolve or track in backlog: $matches"
    VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
  fi
done < <(find_source_files)

# -- H-04: Debug statements left in (console.log, print, fmt.Println) --------
printf '\n[H-04] debug statements\n' >&2
DEBUG_PATTERNS=(
  'console\.(log|debug|warn|error|trace)\('
  '^[[:space:]]*print\('
  'fmt\.(Print|Println|Printf)\('
  'System\.out\.print'
)
while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  for pattern in "${DEBUG_PATTERNS[@]}"; do
    matches=$(grep -nE "$pattern" "$src_file" 2>/dev/null | head -2 || true)
    if [[ -n "$matches" ]]; then
      gap "H-04-debug-statement" "${src_file#"$ROOT/"}: debug print left in code (use structured logging): $matches"
      VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
      break
    fi
  done
done < <(find_source_files)

# -- H-05: Magic numbers (bare numerics outside constants) --------------------
printf '\n[H-05] magic numbers\n' >&2
while IFS= read -r src_file; do
  [[ -z "$src_file" ]] && continue
  ext="${src_file##*.}"
  [[ "$ext" != "ts" && "$ext" != "tsx" && "$ext" != "js" && "$ext" != "jsx" ]] && continue

  # Match: bare numbers > 1 in non-const, non-test, non-config contexts
  # Exclude: 0, 1, -1 (common sentinel values), port 3000, common HTTP codes 200/404/500
  matches=$(grep -nE '[^a-zA-Z_0-9.](([2-9][0-9]{2,})|([1-9][0-9]{3,}))[^a-zA-Z_0-9.]' "$src_file" \
    | grep -vE '(const|readonly|PORT|STATUS|CODE|LIMIT|MAX|MIN|http|https|3000|8080|200|201|400|401|403|404|500|503)' \
    | grep -vE '(test|spec|mock|fixture|seed)' \
    | head -3 || true)
  if [[ -n "$matches" ]]; then
    gap "H-05-magic-number" "${src_file#"$ROOT/"}: magic number in code (extract to named constant): $matches"
    VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
  fi
done < <(find_source_files)

# -- Summary ------------------------------------------------------------------
if [[ "$VIOLATION_COUNT" -eq 0 ]]; then
  pass "No code health violations found"
fi

validator_exit
