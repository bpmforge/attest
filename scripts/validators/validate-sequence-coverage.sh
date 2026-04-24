#!/usr/bin/env bash
#
# validate-sequence-coverage.sh -- confirm every P0 use case in docs/USE_CASES.md
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
USECASES="$ROOT/docs/USE_CASES.md"
ARCH="$ROOT/docs/ARCHITECTURE.md"
SEQ_DIR="$ROOT/docs/sequences"

if ! file_exists_nonempty "$USECASES"; then
  # No use cases file -- nothing to enforce. Warn and pass clean.
  warn "docs/USE_CASES.md not found -- skipping sequence-coverage check"
  validator_exit
fi

# Collect P0 use-case identifiers
P0_CASES=$(mktemp -t "p0.XXXXXX")
trap 'rm -f "$P0_CASES"' EXIT

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
#   1. A sequenceDiagram mermaid block in ARCHITECTURE.md whose block header
#      (a ## or ### heading within 10 lines above it, OR a title inside the
#      block) references the UC-id
#   2. A file docs/sequences/<UC-id>*.md containing a sequenceDiagram block

while IFS= read -r uc; do
  [[ -z "$uc" ]] && continue
  found=0

  # Check ARCHITECTURE.md -- look for UC-id within 15 lines of any
  # sequenceDiagram fence.
  if [[ -f "$ARCH" ]]; then
    if awk -v uc="$uc" '
      /^```mermaid/ { in_mermaid = 1; block = ""; next }
      /^```$/ && in_mermaid { in_mermaid = 0; print block; block = ""; next }
      in_mermaid { block = block "\n" $0 }
      !in_mermaid { hist[NR] = $0; if (NR>15) delete hist[NR-15] }
      END {}
    ' "$ARCH" | grep -q "sequenceDiagram" 2>/dev/null; then
      # We have sequenceDiagrams. Check one of them references this UC.
      if grep -E "(sequenceDiagram|$uc)" "$ARCH" | grep -A 50 "$uc" 2>/dev/null | grep -q 'sequenceDiagram'; then
        found=1
      elif grep -E 'sequenceDiagram' "$ARCH" | grep -q "$uc" 2>/dev/null; then
        found=1
      else
        # Fallback: any section heading referencing UC above a sequenceDiagram
        if grep -B 5 'sequenceDiagram' "$ARCH" | grep -q "$uc" 2>/dev/null; then
          found=1
        fi
      fi
    fi
  fi

  # Check docs/sequences/<uc>*.md
  if [[ "$found" -eq 0 && -d "$SEQ_DIR" ]]; then
    if find "$SEQ_DIR" -type f -name "${uc}*" 2>/dev/null | head -1 | grep -q .; then
      # File exists -- confirm it has a sequenceDiagram block
      match=$(find "$SEQ_DIR" -type f -name "${uc}*" 2>/dev/null | head -1)
      if grep -q 'sequenceDiagram' "$match"; then
        found=1
      fi
    fi
  fi

  if [[ "$found" -eq 0 ]]; then
    gap "missing-sequence" "$uc (P0 use case) has no sequence diagram in ARCHITECTURE.md or docs/sequences/"
  fi
done < "$P0_CASES"

validator_exit
