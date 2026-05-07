#!/usr/bin/env bash
#
# validate-ux-spec.sh -- validates docs/design/UX_SPEC.md for completeness.
#
# Checks:
#   1. UX_SPEC.md exists in docs/design/ and is non-empty
#   2. DESIGN_PRINCIPLES.md and STYLE_GUIDE.md exist alongside it
#   3. Component library selection is documented (not "TBD")
#   4. Component Inventory section with table rows
#   5. User Workflows section with at least one Mermaid diagram
#   6. Every P0 use case from USE_CASES.md is referenced
#   7. Accessibility Plan section (WCAG 2.2)
#   8. Responsive Strategy section
#   9. Screen Hierarchy / Information Architecture section
#  10. No placeholder text ([TODO], [TBD], PLACEHOLDER)
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-ux-spec"

ROOT="$(detect_project_root "${1:-}")"

DESIGN_DIR="$ROOT/docs/design"
UX_SPEC="$DESIGN_DIR/UX_SPEC.md"
PRINCIPLES="$DESIGN_DIR/DESIGN_PRINCIPLES.md"
STYLE="$DESIGN_DIR/STYLE_GUIDE.md"

# -- 1. UX_SPEC.md exists ------------------------------------------------------
if ! file_exists_nonempty "$UX_SPEC"; then
  gap "missing-ux-spec" "docs/design/UX_SPEC.md not found or empty — run ux-engineer HANDOFF"
  validator_exit
fi
pass "UX_SPEC.md present"

# -- 2. Companion docs exist ---------------------------------------------------
if ! file_exists_nonempty "$PRINCIPLES"; then
  gap "missing-design-principles" "docs/design/DESIGN_PRINCIPLES.md not found — ux-engineer must produce all three design docs"
fi
if ! file_exists_nonempty "$STYLE"; then
  gap "missing-style-guide" "docs/design/STYLE_GUIDE.md not found — ux-engineer must produce all three design docs"
fi
[[ -f "$PRINCIPLES" ]] && pass "DESIGN_PRINCIPLES.md present"
[[ -f "$STYLE" ]] && pass "STYLE_GUIDE.md present"

# -- 3. Component library selection -------------------------------------------
if grep -qiE '(component[[:space:]]+library|## Component[[:space:]]+Library|Selected[[:space:]]*:|Library[[:space:]]*:)' "$UX_SPEC" 2>/dev/null; then
  # Exists — check it's not TBD
  lib_line=$(grep -iE '(Selected|Library)[[:space:]]*:' "$UX_SPEC" | head -1 || true)
  if printf '%s' "$lib_line" | grep -qiE '(TBD|TODO|PLACEHOLDER|\[)'; then
    gap "component-library-tbd" "UX_SPEC.md component library selection is still TBD — choose a specific library (shadcn/ui, MUI, Ant Design, etc.) and justify the choice"
  else
    pass "Component library selected: $lib_line"
  fi
else
  gap "missing-component-library" "UX_SPEC.md missing component library selection — add a '## Component Library' section specifying which library and why"
fi

# -- 4. Component Inventory ----------------------------------------------------
if ! grep -qiE '^## Component[[:space:]]+Inventory' "$UX_SPEC" 2>/dev/null; then
  gap "missing-component-inventory" "UX_SPEC.md missing '## Component Inventory' section — list every reusable UI component"
else
  pass "Component Inventory section present"
  # Count table rows (non-header rows)
  comp_count=$(grep -E '^\|[^|]+\|[^|]+\|' "$UX_SPEC" | grep -v -E '(Component|---|Purpose|----)' | grep -c . || echo 0)
  if [[ "${comp_count:-0}" -lt 3 ]]; then
    gap "thin-component-inventory" "Component Inventory has fewer than 3 components — list all reusable UI components (Button, Input, Modal, etc.)"
  else
    pass "Component Inventory has $comp_count component(s)"
  fi
fi

# -- 5. User Workflows with Mermaid diagrams -----------------------------------
if ! grep -qiE '^## (User[[:space:]]+Workflow|Workflow|User[[:space:]]+Flow)' "$UX_SPEC" 2>/dev/null; then
  gap "missing-workflows-section" "UX_SPEC.md missing User Workflows section"
else
  pass "User Workflows section present"
fi

mermaid_count=$(grep -c '```mermaid' "$UX_SPEC" || echo 0)
if [[ "${mermaid_count:-0}" -eq 0 ]]; then
  gap "missing-ux-diagrams" "UX_SPEC.md has no Mermaid diagrams — add one flowchart per primary user story"
else
  pass "Mermaid diagrams present ($mermaid_count)"
fi

# -- 6. Every P0 use case referenced ------------------------------------------
UC=""
for f in "$ROOT/docs/USE_CASES.md" "$ROOT/docs/testing/USE_CASES.md"; do
  [[ -f "$f" ]] && UC="$f" && break
done

if [[ -n "$UC" ]]; then
  p0_ids=$(grep -iE '\|[[:space:]]*P0[[:space:]]*\|' "$UC" | grep -oE 'UC-[0-9]+' || true)
  if [[ -n "$p0_ids" ]]; then
    p0_covered=0
    p0_missing=0
    while IFS= read -r uc_id; do
      [[ -z "$uc_id" ]] && continue
      if grep -qi "$uc_id" "$UX_SPEC" 2>/dev/null; then
        p0_covered=$((p0_covered + 1))
      else
        gap "uncovered-p0-ux" "P0 use case $uc_id has no UX workflow in UX_SPEC.md"
        p0_missing=$((p0_missing + 1))
      fi
    done <<< "$p0_ids"
    pass "P0 use case coverage: $p0_covered covered, $p0_missing missing"
  fi
fi

# -- 7. Accessibility Plan (WCAG) ----------------------------------------------
if ! grep -qiE '^## (Accessibility|WCAG|A11y)' "$UX_SPEC" 2>/dev/null; then
  gap "missing-accessibility-plan" "UX_SPEC.md missing Accessibility Plan section (WCAG 2.2 AA requirements)"
else
  pass "Accessibility Plan section present"
  # Check for key WCAG topics
  for topic in "keyboard\|tab" "contrast\|color" "screen[[:space:]]\+reader\|aria\|ARIA" "focus"; do
    if ! grep -qiE "$topic" "$UX_SPEC" 2>/dev/null; then
      gap "thin-accessibility-plan" "Accessibility Plan missing: $topic — WCAG 2.2 requires keyboard navigation, color contrast, screen reader support, focus indicators"
    fi
  done
fi

# -- 8. Responsive Strategy ---------------------------------------------------
if ! grep -qiE '^## (Responsive|Breakpoint|Mobile)' "$UX_SPEC" 2>/dev/null; then
  gap "missing-responsive-strategy" "UX_SPEC.md missing Responsive Strategy section (breakpoints + layout approach)"
else
  pass "Responsive Strategy section present"
fi

# -- 9. Screen Hierarchy / Information Architecture ---------------------------
if ! grep -qiE '^## (Screen[[:space:]]+Hierarchy|Information[[:space:]]+Architecture|Navigation|Page[[:space:]]+Structure|Sitemap)' "$UX_SPEC" 2>/dev/null; then
  gap "missing-screen-hierarchy" "UX_SPEC.md missing Screen Hierarchy / Information Architecture section — show how pages/screens are organized"
else
  pass "Screen Hierarchy section present"
fi

# -- 10. No placeholder text ---------------------------------------------------
if has_placeholder "$UX_SPEC"; then
  gap "placeholder-text" "UX_SPEC.md still contains placeholder text ([TODO]/[TBD]/PLACEHOLDER) — complete all sections before gate can pass"
else
  pass "No placeholder text in UX_SPEC.md"
fi

if file_exists_nonempty "$PRINCIPLES" && has_placeholder "$PRINCIPLES"; then
  gap "placeholder-text" "DESIGN_PRINCIPLES.md still contains placeholder text"
fi

if file_exists_nonempty "$STYLE" && has_placeholder "$STYLE"; then
  gap "placeholder-text" "STYLE_GUIDE.md still contains placeholder text"
fi

validator_exit
