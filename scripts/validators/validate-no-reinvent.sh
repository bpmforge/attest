#!/usr/bin/env bash
#
# validate-no-reinvent.sh -- guard against reinvention / canonical-overwrite drift (G-B).
#
# The Mode-4 class: an audit falsely reports a file "missing" or "wrong", and the
# agent rewrites a canonical / build-generated file with an inferior stub. This
# gate makes two concrete checks against the git working tree:
#
#   1. HARD FAIL: any file listed in GENERATED_FILES.txt that has local edits.
#      Generated files must be REGENERATED via the build, never hand-edited.
#   2. WARN: any tracked file that has been ~wholesale rewritten (≥90% of its
#      lines removed) -- confirm it is a deliberate refactor, not a reinvention of
#      canonical; justify the overwrite in the Completion Manifest.
#
# Usage: validate-no-reinvent.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-no-reinvent"

ROOT="$(detect_project_root "${1:-}")"

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  note "not a git work tree -- nothing to check"
  validator_exit
fi

# -- Check 1: hand-edited generated files (HARD FAIL) ------------------------
GEN_LIST="$ROOT/GENERATED_FILES.txt"
if [[ -f "$GEN_LIST" ]]; then
  while IFS= read -r gen; do
    [[ -z "$gen" || "$gen" == \#* ]] && continue
    st=$(git -C "$ROOT" status --porcelain -- "$gen" 2>/dev/null || true)
    if [[ -n "$st" ]]; then
      code=$(printf '%s' "$st" | cut -c1-2 | tr -d ' ')
      gap "generated-edit" "$gen is a build output (GENERATED_FILES.txt) but has local changes [${code}] -- regenerate via the build, do NOT hand-edit"
    fi
  done < "$GEN_LIST"
else
  note "no GENERATED_FILES.txt -- skipping generated-file guard"
fi

# -- Check 2: wholesale rewrites of tracked files (WARN) ---------------------
REWRITES=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  git -C "$ROOT" cat-file -e "HEAD:$f" 2>/dev/null || continue   # skip new files
  old=$(git -C "$ROOT" show "HEAD:$f" 2>/dev/null | wc -l | tr -d ' ')
  [[ "${old:-0}" -lt 20 ]] && continue                           # too small to judge
  rem=$(git -C "$ROOT" diff --numstat HEAD -- "$f" 2>/dev/null | awk '{print $2}')
  [[ "$rem" =~ ^[0-9]+$ ]] || continue                           # binary / no data
  if [[ "$rem" -ge $(( old * 9 / 10 )) ]]; then
    REWRITES=$((REWRITES + 1))
    warn "$f: ~all lines rewritten (${rem}/${old} removed) -- confirm this is a deliberate refactor, not a reinvention of canonical; justify in the manifest"
  fi
done < <(git -C "$ROOT" diff --name-only HEAD 2>/dev/null || true)

note "checked generated-file guard + ${REWRITES} wholesale-rewrite warning(s)"
validator_exit
