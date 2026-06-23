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

# --base <ref> -> merge-gate mode (branch vs <ref>); default -> working tree vs HEAD.
BASE=""
ROOT_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    *) [[ -z "$ROOT_ARG" ]] && ROOT_ARG="$1"; shift ;;
  esac
done
ROOT="$(detect_project_root "$ROOT_ARG")"

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  note "not a git work tree -- nothing to check"
  validator_exit
fi

# Changed-file set + the numstat/old-content range, per mode.
if [[ -n "$BASE" ]]; then
  note "merge-gate mode: comparing branch vs ${BASE}"
  CHANGED_SET=$(git -C "$ROOT" diff --name-only "${BASE}...HEAD" 2>/dev/null | sort -u)
  DIFF_RANGE="${BASE}...HEAD"
  OLD_REF="$BASE"
else
  CHANGED_SET=$( { git -C "$ROOT" diff --name-only HEAD 2>/dev/null; \
                   git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null; } | sort -u )
  DIFF_RANGE="HEAD"
  OLD_REF="HEAD"
fi
in_changed_set() { printf '%s\n' "$CHANGED_SET" | grep -qxF "$1"; }

# -- Check 1: modified generated files (HARD FAIL) --------------------------
GEN_LIST="$ROOT/GENERATED_FILES.txt"
if [[ -f "$GEN_LIST" ]]; then
  while IFS= read -r gen; do
    [[ -z "$gen" || "$gen" == \#* ]] && continue
    if in_changed_set "$gen"; then
      gap "generated-edit" "$gen is a build output (GENERATED_FILES.txt) but was modified -- regenerate via the build, do NOT hand-edit"
    fi
  done < "$GEN_LIST"
else
  note "no GENERATED_FILES.txt -- skipping generated-file guard"
fi

# -- Check 2: wholesale rewrites of tracked files (WARN) ---------------------
REWRITES=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  git -C "$ROOT" cat-file -e "${OLD_REF}:$f" 2>/dev/null || continue   # skip files new to this change
  old=$(git -C "$ROOT" show "${OLD_REF}:$f" 2>/dev/null | wc -l | tr -d ' ')
  [[ "${old:-0}" -lt 20 ]] && continue                                # too small to judge
  rem=$(git -C "$ROOT" diff --numstat "$DIFF_RANGE" -- "$f" 2>/dev/null | awk '{print $2}')
  [[ "$rem" =~ ^[0-9]+$ ]] || continue                                # binary / no data
  if [[ "$rem" -ge $(( old * 9 / 10 )) ]]; then
    REWRITES=$((REWRITES + 1))
    warn "$f: ~all lines rewritten (${rem}/${old} removed) -- confirm this is a deliberate refactor, not a reinvention of canonical; justify in the manifest"
  fi
done <<EOF
$CHANGED_SET
EOF

note "checked generated-file guard + ${REWRITES} wholesale-rewrite warning(s)"
validator_exit
