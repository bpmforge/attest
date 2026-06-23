#!/usr/bin/env bash
#
# validate-file-size.sh -- enforce book-style code sizing (G-A).
#
# A source file larger than the cap is hard to hold coherently — worst for small
# / local LLMs that can't fit it in context, so they drift. Like a doc that
# exceeds 300 lines becomes a book, a code file over the cap must become a
# directory: an index/barrel + chapter modules, one concern each. See
# agents/shared/CODE_BOOK_PROTOCOL.md.
#
# Usage:
#   validate-file-size.sh [project-root]
# Env:
#   FILE_SIZE_CAP   hard fail over this many lines (default 400)
#   FILE_SIZE_WARN  note over this many lines        (default 300)
#
# Excludes: generated/vendored/build output, lockfiles, .d.ts, minified, tests,
# fixtures, migrations, and any path listed in GENERATED_FILES.txt.
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-file-size"

ROOT="$(detect_project_root "${1:-}")"
CAP="${FILE_SIZE_CAP:-400}"
WARN="${FILE_SIZE_WARN:-300}"
note "cap=${CAP} warn=${WARN} lines (root: ${ROOT})"

# Exact-path exception lists, if the project ships them:
#   GENERATED_FILES.txt  — build outputs (already used by the dual-repo build)
#   .filesizeignore      — hand-maintained exceptions (one relative path per line, # comments ok)
GEN_LIST="$ROOT/GENERATED_FILES.txt"
IGNORE_LIST="$ROOT/.filesizeignore"

is_excluded() {
  local rel="$1"
  case "$rel" in
    *.min.*|*.generated.*|*.d.ts|*-lock.*|*.lock) return 0 ;;
    *.test.*|*.spec.*|*__tests__*|*/tests/*|*/test/*|*/fixtures/*|*/__fixtures__/*) return 0 ;;
    */migrations/*|*/__generated__/*|*.pb.go|*_pb2.py) return 0 ;;
  esac
  if [[ -f "$GEN_LIST" ]] && grep -qxF "$rel" "$GEN_LIST" 2>/dev/null; then
    return 0
  fi
  if [[ -f "$IGNORE_LIST" ]] && grep -qxF "$rel" "$IGNORE_LIST" 2>/dev/null; then
    return 0
  fi
  return 1
}

# Collect source files, pruning heavy/vendored directories.
FILES=$(find "$ROOT" \
  -type d \( -name node_modules -o -name dist -o -name build -o -name out \
    -o -name .git -o -name vendor -o -name coverage -o -name .next \
    -o -name target -o -name __pycache__ \) -prune -o \
  -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
    -o -name '*.mjs' -o -name '*.cjs' -o -name '*.py' -o -name '*.go' \
    -o -name '*.rs' -o -name '*.java' -o -name '*.kt' -o -name '*.rb' \
    -o -name '*.php' -o -name '*.swift' -o -name '*.c' -o -name '*.cc' \
    -o -name '*.cpp' -o -name '*.cs' -o -name '*.scala' \) -print 2>/dev/null || true)

CHECKED=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  rel="${f#"$ROOT"/}"
  is_excluded "$rel" && continue
  CHECKED=$((CHECKED + 1))
  lines=$(wc -l < "$f" | tr -d ' ')
  if [[ "$lines" -gt "$CAP" ]]; then
    gap "file-size" "${rel} is ${lines} lines (> ${CAP}) -- split into a directory: an index/barrel + chapter modules (one concern each, <= ${CAP} lines). See CODE_BOOK_PROTOCOL.md"
  elif [[ "$lines" -gt "$WARN" ]]; then
    warn "${rel} is ${lines} lines (> ${WARN}) -- approaching the cap; plan a book-style split"
  fi
done <<EOF
$FILES
EOF

note "checked ${CHECKED} source file(s)"
validator_exit
