#!/usr/bin/env bash
#
# validate-doc-catalog.sh -- the catalog must list what actually exists.
#
# validate-doc-counts.sh checks the NUMBERS in docs; this checks the BODY: every
# real artifact (validator, shared protocol, reference) is actually listed in the
# catalog (FEATURES.md). It catches the body-drift that count-checking misses --
# e.g. claude-experts' FEATURES listing 16 of 23 shared protocols, or a new
# validator that ships undocumented.
#
# No false positives: a category is only checked if the catalog ALREADY documents
# SOME of it (so a deliberately-uncatalogued category is skipped). A *partial*
# catalog -- some listed, some not -- is the drift signal; the missing items gap.
#
# Usage: validate-doc-catalog.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-doc-catalog"

ROOT="$(detect_project_root "${1:-}")"
CATALOG="$ROOT/docs/FEATURES.md"
if [[ ! -f "$CATALOG" ]]; then
  note "no docs/FEATURES.md catalog at $ROOT -- nothing to check"
  validator_exit; exit $?
fi

# category label -> list of artifact basenames that should be catalogued.
# Each function prints one basename per line, or nothing if the dir is absent.
# Only categories that FEATURES catalogs in a *dedicated comprehensive table* are
# checked. References are excluded: they appear incidentally in agent prose, not a
# catalog section, so a completeness check on them would false-positive.
list_validators()  { [[ -d "$ROOT/scripts/validators" ]] && find "$ROOT/scripts/validators" -name 'validate-*.sh' -type f -exec basename {} \; ; }
list_protocols()   { [[ -d "$ROOT/agents/shared" ]] && find "$ROOT/agents/shared" -maxdepth 1 -name '*.md' -type f -exec basename {} \; ; }

check_category() { # <label> <lister-fn>
  local label="$1" lister="$2"
  local files; files="$($lister)"
  [[ -z "$files" ]] && return 0
  local total=0 documented=0 missing=()
  while IFS= read -r b; do
    [[ -z "$b" ]] && continue
    total=$((total + 1))
    if grep -qF "$b" "$CATALOG"; then documented=$((documented + 1)); else missing+=("$b"); fi
  done <<< "$files"

  if [[ "$documented" -eq 0 ]]; then
    note "$label: not catalogued in FEATURES.md (0/$total) -- skipped (catalogued by choice)"
    return 0
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    for m in "${missing[@]}"; do
      gap "uncatalogued-${label}" "FEATURES.md documents $label but is missing \`$m\` ($documented/$total listed) -- add it to the catalog so the docs track what actually ships."
    done
  else
    pass "$label fully catalogued ($total/$total)"
  fi
}

check_category "validator" list_validators
check_category "shared-protocol" list_protocols

validator_exit
