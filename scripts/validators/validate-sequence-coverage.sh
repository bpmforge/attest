#!/usr/bin/env bash
#
# validate-sequence-coverage.sh -- confirm every P0 use case in docs/testing/USE_CASES.md
# (or legacy docs/USE_CASES.md)
# has a matching sequence diagram in docs/ARCHITECTURE.md (or docs/sequences/).
#
# Use case detection: looks for rows in USE_CASES.md with priority marker P0,
# in the form:
#   | UC-01 | Login | P0 | ... |
#   | UC-01 -- Login (P0) | ... |
# or lines containing the UC-NN identifier AND "P0".
#
# Usage:
#   validate-sequence-coverage.sh [project-root]
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-sequence-coverage"

ROOT="$(detect_project_root "${1:-}")"
USECASES=""
for _uc in "$ROOT/docs/testing/USE_CASES.md" "$ROOT/docs/USE_CASES.md"; do
  [[ -f "$_uc" ]] && USECASES="$_uc" && break
done
[[ -z "$USECASES" ]] && USECASES="$ROOT/docs/testing/USE_CASES.md"
ARCH="$ROOT/docs/ARCHITECTURE.md"
SEQ_DIR="$ROOT/docs/sequences"
DIAG_SEQ_DIR="$ROOT/docs/diagrams/sequences"

if ! file_exists_nonempty "$USECASES"; then
  # No use cases file -- nothing to enforce. Warn and pass clean.
  warn "docs/USE_CASES.md not found -- skipping sequence-coverage check"
  validator_exit
fi

# Collect P0 use-case identifiers
P0_CASES=$(mktemp -t "p0.XXXXXX")
COVERED=$(mktemp -t "seqcov.XXXXXX")
trap 'rm -f "$GAP_FILE" "$P0_CASES" "$COVERED"' EXIT

# Patterns: line contains UC-NN and P0
grep -E 'UC-[0-9]+' "$USECASES" | grep -E '\bP0\b' | \
  grep -oE 'UC-[0-9]+' | sort -u > "$P0_CASES" || true

P0_COUNT=$(wc -l < "$P0_CASES" | tr -d ' ')
if [[ "$P0_COUNT" -eq 0 ]]; then
  warn "no P0 use cases found in USE_CASES.md"
  validator_exit
fi

pass "found $P0_COUNT P0 use case(s)"

# -- Each P0 should have a sequence diagram ---------------------------------
# Acceptable evidence (any one):
#   1. A sequenceDiagram in ARCHITECTURE.md with the UC-id
#        - in a markdown heading (#..######) within 10 lines above it, or
#        - on any line within 5 lines above it, or
#        - in the block header: the `sequenceDiagram` line itself, or a
#          `title ...` / `%% ...` line inside the same mermaid block.
#   2. A file docs/sequences/<UC-id>*.md containing a sequenceDiagram block
#   3. A file under docs/diagrams/sequences/ (where /sdlc onboard's
#      entry-point-tracer writes them, named by flow: auth.md,
#      write-operation.md ...) satisfying the same rule as (1).
#      Onboard sequences used to count for nothing here: the default and
#      deep onboard gates both failed missing-sequence on diagrams that
#      existed, one directory over.
#
# UC-ids match exactly (UC-1 does not satisfy UC-14, and vice versa).
#
# NO `producer | grep -q` PIPELINES FOR DECISIONS. _lib.sh runs under
# `set -euo pipefail`: `grep -q` exits on its first match, the upstream
# awk/grep takes SIGPIPE on its next write, the pipeline returns 141 and the
# `if` reads it as "not found". On an ARCHITECTURE.md past one pipe buffer
# (~64 KB) that reported EVERY P0 use case missing (3.13.2, attest-browser:
# 14 false gaps on a 65 KB file with 21 sequence diagrams). The evidence is
# now collected ONCE into a file and each UC is looked up with
# `grep -qxF uc FILE` -- grep reads a file, no pipe, no SIGPIPE.

# Emit every UC-id that rule (1) attributes to a sequenceDiagram, one per
# line. Works per file (FNR), so it serves ARCHITECTURE.md and the
# docs/diagrams/sequences/ files alike. Portable awk: no \b (stock macOS
# awk treats it as a no-op -- see test-awk-word-boundary.ts).
collect_sequence_ucs() {
  awk '
    function emit(s,   rest) {
      rest = s
      while (match(rest, /UC-[0-9]+/)) {
        print substr(rest, RSTART, RLENGTH)
        rest = substr(rest, RSTART + RLENGTH)
      }
    }
    FNR == 1 { n = 0; in_mermaid = 0; in_seq = 0 }
    {
      line = $0
      if (line ~ /^[[:space:]]*```[[:space:]]*mermaid/) { in_mermaid = 1; in_seq = 0 }
      else if (in_mermaid && line ~ /^[[:space:]]*```/) { in_mermaid = 0; in_seq = 0 }
      else if (line ~ /^[[:space:]]*sequenceDiagram/) {
        emit(line)
        for (k = 1; k <= 10 && k <= n; k++) {
          prev = hist[(n - k) % 10]
          if (k <= 5 || prev ~ /^[[:space:]]*#/) emit(prev)
        }
        if (in_mermaid) in_seq = 1
      }
      else if (in_seq && line ~ /^[[:space:]]*(title[[:space:]]|%%)/) emit(line)
      hist[n % 10] = line
      n++
    }
  ' "$@"
}

if [[ -f "$ARCH" ]]; then
  collect_sequence_ucs "$ARCH" >> "$COVERED"
fi
if [[ -d "$DIAG_SEQ_DIR" ]]; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    collect_sequence_ucs "$f" >> "$COVERED"
  done < <(find "$DIAG_SEQ_DIR" -type f -name '*.md' 2>/dev/null)
fi

while IFS= read -r uc; do
  [[ -z "$uc" ]] && continue
  found=0

  if grep -qxF "$uc" "$COVERED"; then
    found=1
  fi

  # Check docs/sequences/<uc>*.md -- capture first, then test (no grep -q
  # at the end of a find pipeline).
  if [[ "$found" -eq 0 && -d "$SEQ_DIR" ]]; then
    match=$(find "$SEQ_DIR" -type f -name "${uc}*" 2>/dev/null | head -1 || true)
    if [[ -n "$match" ]] && grep -q 'sequenceDiagram' "$match"; then
      found=1
    fi
  fi

  if [[ "$found" -eq 0 ]]; then
    gap "missing-sequence" "$uc (P0 use case) has no sequence diagram in ARCHITECTURE.md, docs/sequences/ or docs/diagrams/sequences/"
  fi
done < "$P0_CASES"

validator_exit
