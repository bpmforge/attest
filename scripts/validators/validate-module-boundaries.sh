#!/usr/bin/env bash
#
# validate-module-boundaries.sh -- validates that source code does not violate
# the module import rules defined in docs/MODULE_DESIGN.md.
#
# Reads the Dependency Rules section of MODULE_DESIGN.md to get the allowed
# import graph, then checks source files for cross-module internal imports
# (imports from another module's non-index files).
#
# Works for: TypeScript/JavaScript (.ts/.tsx/.js/.jsx), Python (.py), Go (.go)
#
# A violation looks like:
#   TS:  import { foo } from '../users/repository'     ← internal, not index
#   TS:  import { bar } from '../../auth/service'      ← internal, not index
#   PY:  from auth.service import ...                  ← internal
#   GO:  import "myapp/auth/internal"                  ← internal package
#
# A clean import looks like:
#   TS:  import { foo } from '../users'                ← index (public API)
#   TS:  import { bar } from '../users/index'          ← explicit index
#   PY:  from auth import AuthService                  ← top-level (public)
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-module-boundaries"

ROOT="$(detect_project_root "${1:-}")"
MD="$ROOT/docs/MODULE_DESIGN.md"

# -- 1. MODULE_DESIGN.md must exist ------------------------------------------
if ! file_exists_nonempty "$MD"; then
  warn "docs/MODULE_DESIGN.md not found — skipping module boundary check (run architecture-designer first)"
  validator_exit
fi

# -- 2. Extract module directories from Module Inventory table ----------------
# Parse rows like: | auth | src/auth/ | ... |
declare -a MODULE_DIRS

while IFS='|' read -r _ mod_col dir_col _rest; do
  dir=$(printf '%s' "${dir_col:-}" | sed 's/^ *//;s/ *$//')
  mod=$(printf '%s' "${mod_col:-}" | sed 's/^ *//;s/ *$//')

  # Skip header/separator rows and empty
  [[ -z "$dir" || "$dir" == "Directory" || "$dir" =~ ^-+$ ]] && continue
  [[ -z "$mod" || "$mod" == "Module" || "$mod" =~ ^-+$ ]] && continue

  # Must look like a path (contains /)
  [[ "$dir" != */* ]] && continue

  # Normalise: strip leading / trailing slashes, resolve relative to ROOT
  dir="${dir#./}"
  dir="${dir%/}"
  MODULE_DIRS+=("$dir")
done < <(grep -E '^\|[^|]+\|[^|]+/' "$MD" 2>/dev/null || true)

if [[ "${#MODULE_DIRS[@]}" -eq 0 ]]; then
  warn "No module directories parsed from MODULE_DESIGN.md — check the Module Inventory table format"
  validator_exit
fi

note "Modules found: ${MODULE_DIRS[*]}"

# -- 3. For each module, check source files for cross-module internal imports -
VIOLATION_COUNT=0

for module_dir in "${MODULE_DIRS[@]}"; do
  full_module_path="$ROOT/$module_dir"
  [[ ! -d "$full_module_path" ]] && continue

  # Collect source files in this module
  while IFS= read -r src_file; do
    [[ -z "$src_file" ]] && continue

    # Determine file extension
    ext="${src_file##*.}"

    # For each OTHER module, check if this file imports from its internals
    for other_dir in "${MODULE_DIRS[@]}"; do
      [[ "$other_dir" == "$module_dir" ]] && continue

      other_name="${other_dir##*/}"  # last path component (e.g. "auth" from "src/auth")

      case "$ext" in
        ts|tsx|js|jsx|mts|mjs)
          # Match: import ... from '.../<other_name>/<anything_not_index>'
          # Allow: '.../<other_name>', '.../<other_name>/index', '.../<other_name>/index.ts'
          violations=$(grep -nE "from ['\"]([./]+)?${other_name}/[^'\"]+['\"]" "$src_file" \
            | grep -vE "${other_name}/index(\.[a-z]+)?['\"]" \
            | grep -vE "${other_name}['\"]" \
            || true)
          if [[ -n "$violations" ]]; then
            while IFS= read -r vline; do
              [[ -z "$vline" ]] && continue
              gap "module-boundary-violation" \
                "${src_file#"$ROOT/"}: imports from ${other_dir} internals (must import from ${other_dir}/index only) — $vline"
              VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
            done <<< "$violations"
          fi
          ;;

        py)
          # Match: from <other_name>.<something> import ...
          violations=$(grep -nE "^from ${other_name}\.[a-zA-Z_]+ import" "$src_file" || true)
          if [[ -n "$violations" ]]; then
            while IFS= read -r vline; do
              [[ -z "$vline" ]] && continue
              gap "module-boundary-violation" \
                "${src_file#"$ROOT/"}: Python internal import from ${other_dir} — ${vline}"
              VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
            done <<< "$violations"
          fi
          ;;

        go)
          # Match: import "<root>/<other_name>/<something>"
          # where the something is not the module root (treated as internal)
          violations=$(grep -nE "\"[a-zA-Z0-9._/-]+/${other_name}/[a-zA-Z0-9_/-]+\"" "$src_file" || true)
          if [[ -n "$violations" ]]; then
            while IFS= read -r vline; do
              [[ -z "$vline" ]] && continue
              gap "module-boundary-violation" \
                "${src_file#"$ROOT/"}: Go internal package import from ${other_dir} — ${vline}"
              VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
            done <<< "$violations"
          fi
          ;;
      esac
    done

  done < <(find "$full_module_path" \
    -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
       -o -name "*.mts" -o -name "*.mjs" -o -name "*.py" -o -name "*.go" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.next/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -name "*.d.ts" \
    2>/dev/null || true)
done

# -- 4. Check enforcement config exists in MODULE_DESIGN.md ------------------
if ! grep -qiE '^## Enforcement' "$MD" 2>/dev/null; then
  gap "missing-enforcement-config" "MODULE_DESIGN.md has no Enforcement Configuration section — add linter rules (ESLint import/no-internal-modules, import/no-cycle, import-linter, or equivalent)"
fi

# -- 5. Summary ---------------------------------------------------------------
if [[ "$VIOLATION_COUNT" -eq 0 ]]; then
  pass "No module boundary violations found across ${#MODULE_DIRS[@]} module(s)"
fi

validator_exit
