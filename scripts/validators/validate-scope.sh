#!/usr/bin/env bash
#
# validate-scope.sh -- confirm git writes (staged + unstaged + untracked) are
# confined to the assigned write-scope directory.
#
# Used as a post-HANDOFF gate during parallel waves: every coding-agent
# HANDOFF is assigned an exclusive directory (e.g. src/auth/); this script
# proves the agent stayed inside its lane.
#
# Usage:
#   validate-scope.sh <assigned-dir> [assigned-dir2 ...] [--root <project-root>]
#
# The assigned-dir(s) are relative to the project root. Pass multiple to
# allow writes across several directories (e.g. src/auth/ AND tests/auth/).
#
# Files ALWAYS allowed regardless of scope:
#   - docs/work/**       (sdlc-state, context packets, manifests)
#   - docs/reviews/**    (completion manifests, review reports)
#   - .sdlc-state        (legacy)
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-scope"

# -- parse args -------------------------------------------------------------
ALLOWED_DIRS=()
PROJECT_ROOT_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      PROJECT_ROOT_ARG="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '3,22p' "$0" | sed 's/^# //; s/^#$//'
      exit 0
      ;;
    *)
      ALLOWED_DIRS+=("$1")
      shift
      ;;
  esac
done

if [[ "${#ALLOWED_DIRS[@]}" -eq 0 ]]; then
  fatal "no assigned directories provided. Usage: validate-scope.sh <dir> [dir2 ...]"
fi

ROOT="$(detect_project_root "$PROJECT_ROOT_ARG")"

# Normalize allowed dirs: strip leading ./, strip trailing /
NORMALIZED=()
for d in "${ALLOWED_DIRS[@]}"; do
  d="${d#./}"
  d="${d%/}"
  NORMALIZED+=("$d")
done

# Always-allowed dirs (tracker + manifest + review output)
ALWAYS_ALLOWED=(
  "docs/work"
  "docs/reviews"
)

note "project root: $ROOT"
note "assigned scope(s): ${NORMALIZED[*]}"
note "always allowed: ${ALWAYS_ALLOWED[*]}"

# -- enumerate changed/untracked files --------------------------------------
if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  fatal "not inside a git repository: $ROOT"
fi

# Include tracked modifications, staged changes, and untracked files
CHANGED=$(mktemp -t "changed.XXXXXX")
trap 'rm -f "$CHANGED"' EXIT

git -C "$ROOT" status --porcelain 2>/dev/null | \
  awk '
    # Two chars of status, space, path. Renames look like "R  old -> new".
    {
      line = substr($0, 4)
      if (index(line, " -> ") > 0) {
        split(line, parts, " -> ")
        print parts[2]
      } else {
        print line
      }
    }
  ' > "$CHANGED"

CHANGED_COUNT=$(wc -l < "$CHANGED" | tr -d ' ')
if [[ "$CHANGED_COUNT" -eq 0 ]]; then
  pass "no changes -- scope trivially clean"
  validator_exit
fi

pass "found $CHANGED_COUNT changed file(s) -- checking scope"

# -- classify each changed path ---------------------------------------------
while IFS= read -r path; do
  [[ -z "$path" ]] && continue

  # always-allowed?
  for ok in "${ALWAYS_ALLOWED[@]}"; do
    if [[ "$path" == "$ok" || "$path" == "$ok/"* ]]; then
      continue 2
    fi
  done

  # inside any assigned dir?
  for ok in "${NORMALIZED[@]}"; do
    if [[ "$path" == "$ok" || "$path" == "$ok/"* ]]; then
      continue 2
    fi
  done

  # fell through -- out of scope
  gap "out-of-scope" "$path written outside assigned scope"
done < "$CHANGED"

validator_exit
