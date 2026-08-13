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
#   validate-file-size.sh [project-root] [--changed-since <ref>]
#
# --changed-since <ref> restricts the hard gate to files this run actually
# touched (git diff against <ref>, plus the working tree). Files outside that
# set are still reported, but as warnings, not gaps. This is what makes the
# validator usable in the per-HANDOFF runtime gate: a project adopting the cap
# mid-life has pre-existing oversized files, and failing a ticket for a file it
# never opened leaves nothing that ticket can edit to clear the gate -- which
# also means every gate after it goes unrun. Same lesson as the Gate 4 tracker
# comment in run-handoff-gates.sh: gate a step on what the step owns.
# Without the flag, behaviour is unchanged: whole-tree, every violation a gap.
#
# Env:
#   FILE_SIZE_CAP   hard fail over this many lines (default 400)
#   FILE_SIZE_WARN  note over this many lines        (default 300)
#
# Excludes: generated/vendored/build output, lockfiles, .d.ts, minified, tests,
# fixtures, migrations, and any path listed in GENERATED_FILES.txt. Also prunes
# scratch trees that hold code we did not author and do not maintain --
# `.tmp-*` (benchmark/eval output: model-written sample projects) and
# `.worktrees` (per-ticket checkouts, which would otherwise report the SAME
# oversized file once per worktree). Counting those inflates the violation list
# with noise and buries the real findings.
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-file-size"

ROOT_ARG=""
CHANGED_SINCE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --changed-since) CHANGED_SINCE="${2:-}"; shift 2 ;;
    *) ROOT_ARG="$1"; shift ;;
  esac
done

ROOT="$(detect_project_root "$ROOT_ARG")"
CAP="${FILE_SIZE_CAP:-400}"
WARN="${FILE_SIZE_WARN:-300}"
note "cap=${CAP} warn=${WARN} lines (root: ${ROOT})"

# When --changed-since is given, build the set of files this run touched.
# Anything outside it is pre-existing debt: reported, but never a hard gap.
declare -a TOUCHED=()
if [[ -n "$CHANGED_SINCE" ]]; then
  if git -C "$ROOT" rev-parse --verify --quiet "$CHANGED_SINCE" >/dev/null 2>&1; then
    while IFS= read -r p; do
      [[ -n "$p" ]] && TOUCHED+=("$p")
    done < <(
      { git -C "$ROOT" diff --name-only "$CHANGED_SINCE"...HEAD 2>/dev/null || true
        git -C "$ROOT" diff --name-only HEAD 2>/dev/null || true
        git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null || true
      } | sort -u
    )
    note "scoped to ${#TOUCHED[@]} file(s) changed since ${CHANGED_SINCE}; others warn-only"
  else
    # An unresolvable ref must not silently widen the gate back to whole-tree.
    warn "--changed-since ref '${CHANGED_SINCE}' does not resolve -- treating ALL files as in-scope"
    CHANGED_SINCE=""
  fi
fi

is_touched() {
  [[ -z "$CHANGED_SINCE" ]] && return 0
  local rel="$1" t
  for t in "${TOUCHED[@]}"; do
    [[ "$t" == "$rel" ]] && return 0
  done
  return 1
}

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
    # A test suite that names its files `test-<topic>.ts` (or `test.ts`) rather
    # than `<topic>.test.ts` is still a test suite — the rule above only caught
    # the dotted convention, so prefix-named suites were being gated as source.
    test-*|*/test-*|test.ts|*/test.ts) return 0 ;;
    # Benchmark/eval transcripts: model-authored sample projects kept as run
    # evidence. Not code we authored or maintain.
    */realworld-runs/*|*/bench-runs/*) return 0 ;;
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
    -o -name target -o -name __pycache__ \
    -o -name '.tmp-*' -o -name .worktrees -o -name .venv -o -name venv \) -prune -o \
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
    if is_touched "$rel"; then
      gap "file-size" "${rel} is ${lines} lines (> ${CAP}) -- split into a directory: an index/barrel + chapter modules (one concern each, <= ${CAP} lines). See CODE_BOOK_PROTOCOL.md"
    else
      warn "${rel} is ${lines} lines (> ${CAP}) -- PRE-EXISTING (untouched by this run), not blocking; schedule a book-style split"
    fi
  elif [[ "$lines" -gt "$WARN" ]]; then
    warn "${rel} is ${lines} lines (> ${WARN}) -- approaching the cap; plan a book-style split"
  fi
done <<EOF
$FILES
EOF

note "checked ${CHECKED} source file(s)"
validator_exit
