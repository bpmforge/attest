#!/usr/bin/env bash
#
# validate-module-design.sh -- validates docs/MODULE_DESIGN.md for
# completeness and structural integrity.
#
# Checks:
#   1. MODULE_DESIGN.md exists and is non-empty
#   2. Architecture Pattern section with justification
#   3. ADR table present
#   4. Module Inventory table with required columns
#   5. Each module row has a non-empty directory path
#   6. Public Interface Contracts section
#   7. Plugin/Extension Points section
#   8. Dependency Rules section (allowed import graph)
#   9. Circular dependency check (simple bidirectional scan)
#  10. New Feature Addition Recipe section
#  11. Enforcement Configuration section (linter rules)
#  12. No technical-layer module names (controllers/, services/, etc.)
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-module-design"

ROOT="$(detect_project_root "${1:-}")"

MD="$ROOT/docs/MODULE_DESIGN.md"

# -- 1. File existence ---------------------------------------------------------
if ! file_exists_nonempty "$MD"; then
  gap "missing-module-design" "docs/MODULE_DESIGN.md not found or empty — run architecture-designer HANDOFF"
  validator_exit
fi
pass "MODULE_DESIGN.md present"

# -- 2. Architecture Pattern section ------------------------------------------
if ! grep -qiE '^## Architecture Pattern' "$MD" 2>/dev/null; then
  gap "missing-pattern-section" "MODULE_DESIGN.md missing '## Architecture Pattern' section"
else
  pass "Architecture Pattern section present"
  # Must have a justification line citing DESIGN_CONTEXT
  if ! grep -qiE '(justif|because|DESIGN_CONTEXT|constraint|chose|chosen)' "$MD" 2>/dev/null; then
    gap "missing-pattern-justification" "Architecture Pattern section must justify the choice (cite DESIGN_CONTEXT.md constraints)"
  else
    pass "Architecture Pattern has justification"
  fi
fi

# -- 3. ADR table --------------------------------------------------------------
if ! grep -qiE 'ADR-[0-9]+' "$MD" 2>/dev/null; then
  gap "missing-adrs" "MODULE_DESIGN.md has no ADR entries (ADR-001, ADR-002, ...) — document key architecture decisions"
else
  adr_count=$(grep -cE 'ADR-[0-9]+' "$MD" || echo 0)
  pass "ADRs present ($adr_count entries)"
fi

# -- 4. Module Inventory -------------------------------------------------------
if ! grep -qiE '^## Module Inventory' "$MD" 2>/dev/null; then
  gap "missing-module-inventory" "MODULE_DESIGN.md missing '## Module Inventory' section"
else
  pass "Module Inventory section present"

  # Count module rows (table rows with a directory path)
  module_rows=$(grep -E '^\|[^|]+\|[[:space:]]*src/' "$MD" | grep -v -E '^\|[[:space:]]*(Module|---|\*\*)' || true)
  module_count=$(printf '%s\n' "$module_rows" | grep -c . || echo 0)

  if [[ "$module_count" -eq 0 ]]; then
    gap "empty-module-inventory" "Module Inventory has no module rows with src/ directory paths"
  else
    pass "Module Inventory has $module_count module(s)"
  fi
fi

# -- 5. Check for technical-layer naming antipattern --------------------------
TECHNICAL_LAYERS="controllers services repositories models utils helpers middleware"
for layer in $TECHNICAL_LAYERS; do
  # Check if a module's directory IS a technical layer (e.g. src/controllers/)
  if grep -qiE "src/${layer}/" "$MD" 2>/dev/null; then
    # Check it's not in a code example or enforcement config block
    outside_code=$(grep -v '^\s*```' "$MD" | grep -v '^\s*//' | grep -iE "src/${layer}/" | grep -v -E '(Bad|anti|avoid|do not|example of wrong|NOT)' || true)
    if [[ -n "$outside_code" ]]; then
      gap "technical-layer-naming" "Module uses technical layer name 'src/${layer}/' — modules should be named after business domains, not technical layers"
    fi
  fi
done

# -- 6. Public Interface Contracts --------------------------------------------
if ! grep -qiE '^## Public Interface' "$MD" 2>/dev/null; then
  gap "missing-interface-contracts" "MODULE_DESIGN.md missing '## Public Interface Contracts' section — each module needs a defined public API"
else
  pass "Public Interface Contracts section present"
  # Check at least one interface/type definition is present
  if ! grep -qE '(interface |class |type |Protocol |ABC|abstract )' "$MD" 2>/dev/null; then
    gap "no-interface-definitions" "Public Interface Contracts section has no interface/type definitions — define the actual public API in the project's language"
  else
    pass "Interface definitions present"
  fi
fi

# -- 7. Plugin/Extension Points -----------------------------------------------
if ! grep -qiE '^## Plugin' "$MD" 2>/dev/null; then
  gap "missing-plugin-points" "MODULE_DESIGN.md missing '## Plugin / Extension Points' section — document where implementations can be swapped"
else
  pass "Plugin/Extension Points section present"
fi

# -- 8. Dependency Rules -------------------------------------------------------
if ! grep -qiE '^## Dependency Rules' "$MD" 2>/dev/null; then
  gap "missing-dependency-rules" "MODULE_DESIGN.md missing '## Dependency Rules' section — define the allowed import graph"
else
  pass "Dependency Rules section present"
fi

# -- 9. Circular dependency check (simple bidirectional scan) -----------------
# Extract "Module | Depends On" pairs from the inventory table
# Look for rows like: | auth | ... | shared-types, users |
declare -A dep_map

while IFS='|' read -r _ mod _ _ _ deps _; do
  mod=$(printf '%s' "${mod:-}" | sed 's/^ *//;s/ *$//')
  deps=$(printf '%s' "${deps:-}" | sed 's/^ *//;s/ *$//')
  [[ -z "$mod" || "$mod" == "Module" || "$mod" == "---" ]] && continue
  [[ -z "$deps" || "$deps" == "Depends On" || "$deps" == "—" || "$deps" == "-" ]] && continue
  dep_map["$mod"]="$deps"
done < <(grep -E '^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|' "$MD" 2>/dev/null || true)

# Check for bidirectional deps (A→B and B→A)
for mod_a in "${!dep_map[@]}"; do
  deps_a="${dep_map[$mod_a]}"
  for mod_b in "${!dep_map[@]}"; do
    [[ "$mod_a" == "$mod_b" ]] && continue
    deps_b="${dep_map[$mod_b]}"
    # Does A depend on B?
    if printf '%s' "$deps_a" | grep -qiE "(^|,| )${mod_b}($|,| )"; then
      # Does B depend on A?
      if printf '%s' "$deps_b" | grep -qiE "(^|,| )${mod_a}($|,| )"; then
        gap "circular-dependency" "Circular dependency: ${mod_a} ↔ ${mod_b} — each lists the other as a dependency"
      fi
    fi
  done
done

[[ "$GAP_COUNT" -eq 0 || ! "${dep_map[*]+set}" ]] && pass "No circular dependencies found"

# -- 10. New Feature Addition Recipe ------------------------------------------
if ! grep -qiE '^## New Feature Addition' "$MD" 2>/dev/null; then
  gap "missing-feature-recipe" "MODULE_DESIGN.md missing '## New Feature Addition Recipe' section — document the exact steps to add a new feature"
else
  pass "New Feature Addition Recipe present"
  # Should have numbered steps
  step_count=$(grep -cE '^[0-9]+\.' "$MD" || echo 0)
  if [[ "$step_count" -lt 3 ]]; then
    gap "thin-feature-recipe" "New Feature Addition Recipe has fewer than 3 numbered steps — be specific"
  fi
fi

# -- 11. Enforcement Configuration --------------------------------------------
if ! grep -qiE '^## Enforcement' "$MD" 2>/dev/null; then
  gap "missing-enforcement-config" "MODULE_DESIGN.md missing '## Enforcement Configuration' section — document the linter rules that enforce module boundaries"
else
  pass "Enforcement Configuration section present"
  # Should have actual config content (code fence or specific rule syntax)
  if ! grep -qE '^\s*```' "$MD" 2>/dev/null; then
    gap "no-enforcement-code" "Enforcement Configuration has no code block — include actual linter config (ESLint rules, import-linter config, etc.)"
  else
    pass "Enforcement config has code block"
  fi
fi

# -- 12. Check ARCHITECTURE.md references MODULE_DESIGN.md -------------------
ARCH="$ROOT/docs/ARCHITECTURE.md"
if file_exists_nonempty "$ARCH"; then
  if ! grep -qi "MODULE_DESIGN" "$ARCH" 2>/dev/null; then
    gap "arch-missing-module-ref" "docs/ARCHITECTURE.md does not reference MODULE_DESIGN.md — architecture synthesis must cite module structure"
  else
    pass "ARCHITECTURE.md references MODULE_DESIGN.md"
  fi
fi

validator_exit
