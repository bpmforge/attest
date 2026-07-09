#!/usr/bin/env bash
#
# validate-design-system.sh -- validates Phase 4 Wave 0 design system output.
#
# Checks:
#   1. Design token file exists (tailwind.config, theme.ts, tokens.css, etc.)
#   2. Token file references color names from STYLE_GUIDE.md
#   3. Typography scale referenced in token file
#   4. src/components/ui/ (or equivalent) exists with component files
#   5. Components from UX_SPEC.md Component Inventory exist as files
#   6. DESIGN_SYSTEM.md exists in docs/design/
#   7. Spot-check for hardcoded hex colors in component files (warning)
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-design-system"

ROOT="$(detect_project_root "${1:-}")"

DESIGN_DIR="$ROOT/docs/design"
UX_SPEC="$DESIGN_DIR/UX_SPEC.md"
STYLE="$DESIGN_DIR/STYLE_GUIDE.md"
DS_DOC="$DESIGN_DIR/DESIGN_SYSTEM.md"

# -- 1. Locate design token file -----------------------------------------------
TOKEN_FILE=""
TOKEN_FILE_DESC=""

# Check common token file locations in priority order
declare -a CANDIDATE_TOKEN_FILES=(
  "tailwind.config.ts"
  "tailwind.config.js"
  "src/styles/tokens.ts"
  "src/styles/tokens.css"
  "src/theme/index.ts"
  "src/theme/theme.ts"
  "src/design-tokens.ts"
  "src/tokens.ts"
  "tokens.json"
  "design-tokens.json"
  "src/styles/variables.css"
  "src/styles/globals.css"
)

for candidate in "${CANDIDATE_TOKEN_FILES[@]}"; do
  if [[ -f "$ROOT/$candidate" ]]; then
    TOKEN_FILE="$ROOT/$candidate"
    TOKEN_FILE_DESC="$candidate"
    break
  fi
done

# Also try finding by pattern
if [[ -z "$TOKEN_FILE" ]]; then
  found=$(find "$ROOT/src" -maxdepth 4 -name "*token*" -o -name "*theme*" 2>/dev/null | grep -v node_modules | head -1 || true)
  if [[ -n "$found" ]]; then
    TOKEN_FILE="$found"
    TOKEN_FILE_DESC="${found#"$ROOT/"}"
  fi
fi

if [[ -z "$TOKEN_FILE" ]]; then
  gap "missing-token-file" "No design token file found — expected tailwind.config.ts, src/styles/tokens.ts, src/theme/index.ts, or similar. Frontend Wave 0 must produce a token file."
else
  pass "Token file found: $TOKEN_FILE_DESC"
fi

# -- 2. Token file references colors from STYLE_GUIDE.md ----------------------
if [[ -n "$TOKEN_FILE" ]] && file_exists_nonempty "$STYLE"; then
  # Extract color identifiers from STYLE_GUIDE.md (hex values or color names)
  # Look for lines with color definitions: "primary: #...", "--color-primary:", etc.
  # T22.6: this used to cap extraction at `head -20` -- a STYLE_GUIDE.md with
  # more than 20 color identifiers silently dropped the rest from the
  # denominator before the match count was even computed. No cap: the full
  # extracted set is the ground truth, not a sample of it.
  style_colors=$(grep -oE '(--[a-z-]+|[a-z]+-[0-9]{3}|primary|secondary|accent|background|foreground|muted|destructive|success|warning|error)' "$STYLE" \
    | grep -iv '(example\|note\|see\|also)' | sort -u || true)

  if [[ -n "$style_colors" ]]; then
    matched=0
    total=0
    while IFS= read -r color_name; do
      [[ -z "$color_name" ]] && continue
      total=$((total + 1))
      if grep -qi "$color_name" "$TOKEN_FILE" 2>/dev/null; then
        matched=$((matched + 1))
      fi
    done <<< "$style_colors"

    # T22.6: this used to pass as long as a SINGLE color matched out of N
    # (`matched -eq 0` was the only failure condition) -- a token file that
    # implemented 1 of 15 STYLE_GUIDE colors reported clean. Require at
    # least half the declared colors to be present; still tolerant of
    # heuristic-grep near-misses ("background" in prose vs "bg-" in code),
    # not demanding a literal 100% match.
    if [[ "$total" -gt 0 ]]; then
      half=$(( (total + 1) / 2 ))
      if [[ "$matched" -lt "$half" ]]; then
        gap "tokens-dont-match-styleguide" "Token file matches only $matched/$total color names from STYLE_GUIDE.md (need >= $half) — design tokens must implement the color palette defined in STYLE_GUIDE.md"
      else
        pass "Token file references STYLE_GUIDE color names ($matched/$total matched)"
      fi
    fi
  else
    note "no color identifiers extracted from STYLE_GUIDE.md — color-match check skipped"
  fi

  # Check typography is referenced
  if ! grep -qiE '(font|typography|typeface|fontFamily|font-family|fontSize|font-size)' "$TOKEN_FILE" 2>/dev/null; then
    gap "missing-typography-tokens" "Token file has no typography definitions — add font family, size scale, and weight tokens from STYLE_GUIDE.md"
  else
    pass "Typography tokens present"
  fi
fi

# -- 3. Component directory exists --------------------------------------------
COMP_DIR=""
for candidate_dir in "src/components/ui" "src/components" "src/ui" "components/ui" "app/components"; do
  if [[ -d "$ROOT/$candidate_dir" ]]; then
    COMP_DIR="$ROOT/$candidate_dir"
    note "component directory: $candidate_dir"
    break
  fi
done

if [[ -z "$COMP_DIR" ]]; then
  gap "missing-component-dir" "No component directory found (checked src/components/ui, src/components, src/ui) — frontend Wave 0 must create the shared component directory"
else
  comp_file_count=$(find "$COMP_DIR" -maxdepth 2 -name "*.tsx" -o -name "*.jsx" -o -name "*.vue" -o -name "*.svelte" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${comp_file_count:-0}" -eq 0 ]]; then
    gap "empty-component-dir" "$COMP_DIR exists but has no component files — frontend Wave 0 must implement base components"
  else
    pass "Component directory has $comp_file_count component file(s)"
  fi
fi

# -- 4. UX_SPEC component inventory: check key components exist ---------------
if file_exists_nonempty "$UX_SPEC" && [[ -n "$COMP_DIR" ]]; then
  # Extract component names from UX_SPEC.md inventory table
  # Look for table rows in the Component Inventory section
  # T22.6: two stacked bugs found here. (1) The awk range pattern
  # `/^## Component Inventory/,/^## [A-Z]/` closes on its OWN start line --
  # "## Component Inventory" itself matches the end pattern `/^## [A-Z]/`
  # (any "## " heading starting with a capital letter), so on real awk
  # (verified against /usr/bin/awk, not just $AWK) the range always
  # collapsed to that single heading line. `components` was therefore
  # EMPTY on every real invocation and this whole section was dead code --
  # a case of the ticket's named cap (`head -10`) never even being reached.
  # Fixed with a flag-based scan (grab everything strictly AFTER the
  # heading, stop at the next "## " heading) that doesn't have a same-line
  # start/end collision. (2) On top of that, extraction was ALSO capped at
  # `head -10` -- removed, every declared component is now checked.
  # Known limitation (independent review, T22.6): this check only
  # recognizes the markdown-TABLE Component Inventory shape (`| Name |
  # Purpose |` rows). references/design-review-checklist.md's own
  # greenfield template uses a bracketed comma-list shape instead
  # (`- [Table (...), DetailCard, ...]` under subheadings like
  # `### Data Display`) -- a UX_SPEC.md written in that shape extracts 0
  # components here, silently. The new § 4b STATES check below DOES parse
  # that bracket-list shape for data components specifically, but this
  # older per-component existence check does not cover it. Disclosed as a
  # follow-up candidate, not fixed here (scope discipline) -- pre-T22.6 this
  # whole section was dead code for EVERY shape via the range-pattern bug
  # above, so table-format projects are strictly better off than before.
  components_block=$(awk '
    /^## Component Inventory/ { grab=1; next }
    grab && /^## / { grab=0 }
    grab { print }
  ' "$UX_SPEC" 2>/dev/null || true)
  components=$(printf '%s\n' "$components_block" \
    | grep -E '^\|[[:space:]]*[A-Z][a-zA-Z]+' \
    | awk -F'|' '{print $2}' \
    | sed 's/^ *//;s/ *$//' \
    | grep -v -E '^(Component|---)' || true)

  if [[ -n "$components" ]]; then
    found_comps=0
    missing_comps=0
    while IFS= read -r comp_name; do
      [[ -z "$comp_name" ]] && continue
      # Check if a file matching this component name exists
      comp_file_pattern=$(printf '%s' "$comp_name" | tr '[:upper:]' '[:lower:]')
      if find "$COMP_DIR" -maxdepth 3 -iname "${comp_name}*" -o -iname "${comp_file_pattern}*" 2>/dev/null | grep -q .; then
        pass "Component '$comp_name' present in component directory"
        found_comps=$((found_comps + 1))
      else
        gap "missing-component" "Component '$comp_name' listed in UX_SPEC.md Component Inventory but not found in $COMP_DIR"
        missing_comps=$((missing_comps + 1))
      fi
    done <<< "$components"
    note "Component inventory coverage: $found_comps found, $missing_comps missing"
  fi
fi

# -- 4b. Data component STATES: loading/loaded/error/empty + hover/disabled --
# T22.6: ground truth = every component listed under the "### Data Display"
# subsection of UX_SPEC.md's "## Component Inventory" (the producer format
# defined in references/design-review-checklist.md's greenfield template).
# For each one, require a row in the "## State Matrix" table with all 4
# state cells (Loading/Loaded/Error/Empty) populated, AND hover/disabled
# evidence in its component file. Previously nothing checked this dimension
# at all -- a design system could ship with zero loading/error/empty states
# defined for any data component and no validator would notice.
if file_exists_nonempty "$UX_SPEC"; then
  data_display_block=$(awk '
    { line = tolower($0) }
    line ~ /^### data display/ { grab=1; next }
    grab && line ~ /^###/ { grab=0 }
    grab && line ~ /^## / { grab=0 }
    grab { print }
  ' "$UX_SPEC" 2>/dev/null || true)

  data_components=$(printf '%s\n' "$data_display_block" \
    | sed -E 's/^[[:space:]]*[-*][[:space:]]*//' \
    | tr ',' '\n' \
    | sed -E 's/\([^)]*\)//g' \
    | sed -E 's/^[[:space:]]*\[?//; s/\]?[[:space:]]*$//' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | grep -v '^$' \
    | sort -u || true)

  if [[ -z "$data_components" ]]; then
    note "no '### Data Display' subsection found under Component Inventory in UX_SPEC.md — data-component STATES check skipped (0 data components declared)"
  else
    data_comp_count=$(printf '%s\n' "$data_components" | grep -c . || true)
    note "found $data_comp_count data component(s) in Component Inventory § Data Display"

    state_matrix_block=$(awk '
      { line = tolower($0) }
      line ~ /^## state matrix/ { grab=1; next }
      grab && line ~ /^## / { grab=0 }
      grab { print }
    ' "$UX_SPEC" 2>/dev/null || true)

    if [[ -z "$state_matrix_block" ]]; then
      gap "missing-state-matrix" "$data_comp_count data component(s) declared in Component Inventory § Data Display but UX_SPEC.md has no '## State Matrix' table — add a Loading/Loaded/Error/Empty row for each"
    else
      states_complete=0
      hover_disabled_covered=0
      while IFS= read -r comp; do
        [[ -z "$comp" ]] && continue

        row=$(printf '%s\n' "$state_matrix_block" | grep -iF "| $comp " | head -1 || true)
        if [[ -z "$row" ]]; then
          row=$(printf '%s\n' "$state_matrix_block" | grep -i "$comp" | grep -v -E '^[[:space:]]*\|[-: ]*\|' | head -1 || true)
        fi

        if [[ -z "$row" ]]; then
          gap "missing-state-row" "data component '$comp' has no row in the State Matrix table — add Loading/Loaded/Error/Empty specs"
        else
          IFS='|' read -ra cells <<< "$row"
          empty_cells=0
          for idx in 2 3 4 5; do
            cell="${cells[$idx]:-}"
            trimmed=$(printf '%s' "$cell" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            trimmed_uc=$(printf '%s' "$trimmed" | tr '[:lower:]' '[:upper:]')
            if [[ -z "$trimmed" || "$trimmed" == "-" || "$trimmed_uc" == "TBD" || "$trimmed_uc" == "TODO" ]]; then
              empty_cells=$((empty_cells + 1))
            fi
          done
          if [[ "$empty_cells" -gt 0 ]]; then
            gap "incomplete-state-row" "data component '$comp' State Matrix row has $empty_cells/4 empty state cell(s) — every data component needs loading/loaded/error/empty specified"
          else
            states_complete=$((states_complete + 1))
          fi
        fi

        # hover/disabled evidence in the component's own source file.
        if [[ -n "$COMP_DIR" ]]; then
          comp_file=$(find "$COMP_DIR" -maxdepth 3 -iname "${comp}*" 2>/dev/null | head -1 || true)
          if [[ -n "$comp_file" ]] \
              && grep -qiE '(hover|:hover|hover:)' "$comp_file" 2>/dev/null \
              && grep -qiE 'disabled' "$comp_file" 2>/dev/null; then
            hover_disabled_covered=$((hover_disabled_covered + 1))
          else
            gap "missing-hover-disabled-state" "data component '$comp' has no hover/disabled state evidence in its component file (file $( [[ -n "$comp_file" ]] && echo "found: ${comp_file#"$ROOT/"}" || echo "not found in $COMP_DIR" )) — add hover and disabled handling"
          fi
        fi
      done <<< "$data_components"

      note "State Matrix completeness: $states_complete/$data_comp_count data component(s) have all 4 states populated"
      if [[ -n "$COMP_DIR" ]]; then
        note "hover/disabled state coverage: $hover_disabled_covered/$data_comp_count data component(s)"
      fi
    fi
  fi
fi

# -- 5. DESIGN_SYSTEM.md exists -----------------------------------------------
if ! file_exists_nonempty "$DS_DOC"; then
  gap "missing-design-system-doc" "docs/design/DESIGN_SYSTEM.md not found — frontend Wave 0 must produce documentation of what was implemented (token inventory, naming conventions, usage examples)"
else
  pass "DESIGN_SYSTEM.md present"
  if has_placeholder "$DS_DOC"; then
    gap "placeholder-in-design-system" "DESIGN_SYSTEM.md still has placeholder text — complete the documentation"
  fi
fi

# -- 6. Spot-check for hardcoded hex colors in component files (warning) ------
if [[ -n "$COMP_DIR" ]]; then
  hardcoded_count=0
  while IFS= read -r comp_file; do
    [[ -z "$comp_file" ]] && continue
    # Look for hardcoded colors not in comments or string content
    matches=$(grep -nE '(color|background|border):[[:space:]]*#[0-9a-fA-F]{3,6}' "$comp_file" \
      | grep -v '^\s*//' | grep -v "//.*color" | head -3 || true)
    if [[ -n "$matches" ]]; then
      hardcoded_count=$((hardcoded_count + 1))
      warn "Possible hardcoded color in ${comp_file#"$ROOT/"} — use design tokens instead of hex values"
    fi
  done < <(find "$COMP_DIR" -maxdepth 3 -name "*.tsx" -o -name "*.jsx" -o -name "*.vue" 2>/dev/null | head -20)

  if [[ "$hardcoded_count" -eq 0 ]]; then
    pass "No hardcoded hex colors detected in component files"
  else
    warn "$hardcoded_count component file(s) may have hardcoded colors — review and replace with design tokens (non-blocking warning)"
  fi
fi

validator_exit
