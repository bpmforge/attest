#!/usr/bin/env bash
#
# validate-feature-coverage.sh -- scoped Ralph Wiggum inventory for /sdlc feature.
#
# Inventory = source files changed on this branch vs the merge-base with the
# default branch. Coverage = every changed source file is mentioned in at least
# one review artifact under docs/reviews/ (CODE_REVIEW / SECURITY / PERF /
# UX_REVIEW / FIX_BACKLOG). A changed file no reviewer mentions is a gap.
#
# Used by run-coverage-loop.sh with the `feature` phase (2-iteration cap).

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

ROOT="$(detect_project_root "${1:-}")"
validator_init "feature-coverage"

REVIEWS_DIR="$ROOT/docs/reviews"

if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  gap "no-git" "not a git repository — feature coverage needs a branch diff"
  validator_exit
fi

# Find the base: merge-base with the default branch (main, then master).
BASE=""
for candidate in main master; do
  if git -C "$ROOT" rev-parse --verify "$candidate" >/dev/null 2>&1; then
    BASE=$(git -C "$ROOT" merge-base HEAD "$candidate" 2>/dev/null || true)
    [[ -n "$BASE" ]] && break
  fi
done
if [[ -z "$BASE" ]]; then
  gap "no-base-branch" "could not find main/master to diff against"
  validator_exit
fi

# Changed source files (code only — docs and lockfiles are not review inventory)
CHANGED=$(git -C "$ROOT" diff --name-only "$BASE"...HEAD -- \
  | grep -E '\.(ts|tsx|js|jsx|mjs|py|go|rs|java|rb|php|cs|swift|kt|c|cc|cpp|h|hpp|sql|prisma|tf|vue|svelte)$' \
  | grep -vE '(^|/)(node_modules|dist|build|vendor)/' || true)

if [[ -z "$CHANGED" ]]; then
  pass "no changed source files on this branch — nothing to cover"
  validator_exit
fi

if [[ ! -d "$REVIEWS_DIR" ]] || ! ls "$REVIEWS_DIR"/*.md >/dev/null 2>&1; then
  gap "no-reviews" "docs/reviews/ has no review artifacts — run the Step 4 review wave first"
  validator_exit
fi

TOTAL=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  TOTAL=$((TOTAL + 1))
  base_name=$(basename "$f")
  # Covered if any review artifact mentions the file by path or basename
  if grep -rqlF "$f" "$REVIEWS_DIR" 2>/dev/null || grep -rqlF "$base_name" "$REVIEWS_DIR" 2>/dev/null; then
    pass "covered: $f"
  else
    gap "uncovered-file" "$f: changed on this branch but no review artifact in docs/reviews/ mentions it"
  fi
done <<< "$CHANGED"

note "feature inventory: $TOTAL changed source file(s) checked against docs/reviews/"
validator_exit
