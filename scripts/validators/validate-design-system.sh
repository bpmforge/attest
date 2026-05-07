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
  style_colors=$(grep -oE '(--[a-z-]+|[a-z]+-[0-9]{3}|primary|secondary|accent|background|foreground|muted|destructive|success|warning|error)' "$STYLE" \
    | grep -iv '(example\|note\|see\|also)' | sort -u | head -20 || true)

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

    if [[ "$total" -gt 0 && "$matched" -eq 0 ]]; then
      gap "tokens-dont-match-styleguide" "Token file has no color names from STYLE_GUIDE.md — design tokens must implement the color palette defined in STYLE_GUIDE.md"
    else
      pass "Token file references STYLE_GUIDE color names ($matched/$total matched)"
    fi
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
  components=$(awk '/^## Component Inventory/,/^## [A-Z]/' "$UX_SPEC" 2>/dev/null \
    | grep -E '^\|[[:space:]]*[A-Z][a-zA-Z]+' \
    | awk -F'|' '{print $2}' \
    | sed 's/^ *//;s/ *$//' \
    | grep -v -E '^(Component|---)' \
    | head -10 || true)

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
