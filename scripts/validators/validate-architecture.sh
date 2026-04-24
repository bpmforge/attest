#!/usr/bin/env bash
#
# validate-architecture.sh -- confirm ARCHITECTURE.md has all 6 diagram types,
# valid Mermaid fences, no placeholder text, and an HLA overview.
#
# Usage:
#   validate-architecture.sh [project-root]
#
# Exit: 0 clean / 1 gaps / 2 validator error
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-architecture"

ROOT="$(detect_project_root "${1:-}")"
ARCH="$ROOT/docs/ARCHITECTURE.md"

# -- existence --------------------------------------------------------------
if ! file_exists_nonempty "$ARCH"; then
  gap "missing-file" "docs/ARCHITECTURE.md does not exist or is empty"
  validator_exit
fi

pass "found docs/ARCHITECTURE.md ($(line_count "$ARCH") lines)"

# -- placeholder check ------------------------------------------------------
if has_placeholder "$ARCH"; then
  gap "placeholder" "ARCHITECTURE.md contains PLACEHOLDER / [TODO] / [TBD] / [FILL-IN] markers"
fi

# -- HLA overview (written LAST, grounds in real decisions) -----------------
if ! grep -qE '^##[[:space:]]+0\.[[:space:]]*HLA[[:space:]]+Overview' "$ARCH" \
   && ! grep -qE '^##[[:space:]]+HLA[[:space:]]+Overview' "$ARCH"; then
  gap "missing-section" "no '## HLA Overview' section"
else
  pass "HLA Overview section present"
fi

# -- 6 mandatory diagram types ----------------------------------------------
# We accept either literal C4 labels (C1, C2, C3) or the descriptive names.
declare_diagram() {
  local label="$1"
  local pattern="$2"
  if grep -qEi "$pattern" "$ARCH"; then
    pass "diagram found: $label"
  else
    gap "missing-diagram" "$label not found (pattern: $pattern)"
  fi
}

declare_diagram "C1 context diagram"    '(C1|context[[:space:]]+diagram|system[[:space:]]+context)'
declare_diagram "C2 container diagram"  '(C2|container[[:space:]]+diagram)'
declare_diagram "C3 component diagram"  '(C3|component[[:space:]]+diagram)'
declare_diagram "Sequence diagram"      '(sequence[[:space:]]+diagram|sequenceDiagram)'
declare_diagram "Deployment diagram"    '(deployment[[:space:]]+diagram|deployment[[:space:]]+view)'
declare_diagram "Data flow diagram"     '(data[[:space:]]+flow|dataflow|data-flow)'

# -- Mermaid fences ---------------------------------------------------------
# Build fence patterns via printf to sidestep bash 3.2 parser bug with
# triple-backticks inside single-quoted strings passed to $().
_open_fence_pat=$(printf '^%s' '```mermaid')
_close_fence_pat=$(printf '^%s$' '```')
mermaid_open=$(grep_count "$_open_fence_pat" "$ARCH")
mermaid_close_all=$(grep_count "$_close_fence_pat" "$ARCH")

_fence_literal='```mermaid'
if [[ "$mermaid_open" -eq 0 ]]; then
  gap "no-mermaid" "no mermaid code fences found (${_fence_literal})"
else
  pass "found $mermaid_open mermaid fence(s)"
fi

# Fence-balance check: each mermaid fence needs a closing triple-backtick.
# Count ALL close fences; if close < open, some mermaid block is unclosed.
if [[ "$mermaid_close_all" -lt "$mermaid_open" ]]; then
  gap "unclosed-mermaid" "$mermaid_open open mermaid fences but only $mermaid_close_all close fences"
fi

# -- Mermaid syntax sniff ---------------------------------------------------
# Check that every mermaid block starts with one of the known diagram keywords
# on its first non-empty line. Catches copy/paste errors where the fence is
# there but the body is free-text.
validate_mermaid_blocks() {
  local in_block=0
  local block_line_no=0
  local block_start=0
  local lineno=0
  local first_content=""
  # bash 3.2 (macOS default) mis-parses triple-backticks inside [[ ]] even
  # when single-quoted. Bind them to variables first.
  local open_fence
  local close_fence
  open_fence=$(printf '%s' '```mermaid')
  close_fence=$(printf '%s' '```')
  while IFS= read -r line; do
    lineno=$((lineno + 1))
    if [[ "$in_block" -eq 0 ]]; then
      if [[ "$line" == "$open_fence" ]]; then
        in_block=1
        block_line_no=0
        block_start=$lineno
        first_content=""
      fi
      continue
    fi
    # inside block
    if [[ "$line" == "$close_fence" ]]; then
      if [[ -z "$first_content" ]]; then
        gap "empty-mermaid" "mermaid block at line $block_start is empty"
      fi
      in_block=0
      continue
    fi
    block_line_no=$((block_line_no + 1))
    if [[ -z "$first_content" && -n "${line// }" ]]; then
      first_content="$line"
      # Known mermaid diagram keywords
      if ! [[ "$first_content" =~ ^[[:space:]]*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|quadrantChart|requirementDiagram|gitGraph|block-beta) ]]; then
        gap "invalid-mermaid" "mermaid block at line $block_start starts with '$first_content' -- not a recognized diagram keyword"
      fi
    fi
  done < "$ARCH"

  if [[ "$in_block" -eq 1 ]]; then
    gap "unclosed-mermaid" "mermaid block opened at line $block_start was never closed"
  fi
}
validate_mermaid_blocks

# -- ADR table --------------------------------------------------------------
if ! grep -qiE '(adr|architecture[[:space:]]+decision)' "$ARCH"; then
  warn "no ADR / Architecture Decision references found -- consider adding an ADR table"
fi

validator_exit
