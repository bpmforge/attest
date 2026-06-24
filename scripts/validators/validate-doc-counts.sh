#!/usr/bin/env bash
#
# validate-doc-counts.sh -- docs must not claim a stale count.
#
# release-manager step 5 ("re-derive every count claimed in README/docs from the
# filesystem") was agent-only prose -- a manual release (git tag / gh release
# without dispatching release-manager) bypassed it, and "48 validators" drifted
# to a real 53 unnoticed. This makes that audit a deterministic gate: for each
# countable artifact directory that exists, re-derive the count and fail any
# "<N> <noun>" claim in README/docs that disagrees.
#
# Generalizable-safe: a project without these conventional dirs simply has
# nothing to check (clean). Wire it into the merge gate when README/docs change.
#
# Usage: validate-doc-counts.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-doc-counts"

ROOT="$(detect_project_root "${1:-}")"

# Docs that make count claims (only those that exist are scanned).
DOC_FILES=()
for d in "README.md" "docs/FEATURES.md" "docs/USERGUIDE.md" "docs/SETUP.md"; do
  [[ -f "$ROOT/$d" ]] && DOC_FILES+=("$ROOT/$d")
done
if [[ ${#DOC_FILES[@]} -eq 0 ]]; then
  note "no README/docs to check at $ROOT"
  validator_exit; exit $?
fi

# noun -> derived count (only nouns whose source exists are checked).
declare -a NOUNS=() COUNTS=()
add_count() { # <noun> <count>
  NOUNS+=("$1"); COUNTS+=("$2")
}

# validators: scripts/validators/validate-*.sh
if compgen -G "$ROOT/scripts/validators/validate-*.sh" >/dev/null; then
  add_count "validators" "$(find "$ROOT/scripts/validators" -name 'validate-*.sh' -type f | wc -l | tr -d ' ')"
fi
# references: references/*.md
if [[ -d "$ROOT/references" ]]; then
  add_count "references" "$(find "$ROOT/references" -maxdepth 1 -name '*.md' -type f | wc -l | tr -d ' ')"
fi
# NOTE: only CLEAN directory counts are auto-derived (validators / references /
# skills). Curated catalog counts — "shared protocols", "agents", "custom tools"
# in FEATURES — mix directories and exclude items by editorial judgement (e.g.
# PARALLEL_WAVE_PROTOCOL lives in agents/sdlc/, blocks/ is excluded), so they are
# NOT dir-derivable and stay release-manager's manual audit. Auto-deriving them
# would false-positive.
# skills: skills/*/ (each skill is a directory) — fall back to skills/*.md
if [[ -d "$ROOT/skills" ]]; then
  sc=$(find "$ROOT/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  [[ "$sc" -eq 0 ]] && sc=$(find "$ROOT/skills" -maxdepth 1 -name '*.md' -type f | wc -l | tr -d ' ')
  add_count "skills" "$sc"
fi

checked=0
for i in "${!NOUNS[@]}"; do
  noun="${NOUNS[$i]}"; actual="${COUNTS[$i]}"
  # Find every "<N> <noun>" claim across the docs and compare.
  for f in "${DOC_FILES[@]}"; do
    while IFS= read -r claim; do
      [[ -z "$claim" ]] && continue
      checked=$((checked + 1))
      if [[ "$claim" != "$actual" ]]; then
        gap "stale-count" "$(basename "$f") claims $claim ${noun} but the repo has $actual -- re-derive before tagging (release-manager step 5)."
      fi
    done < <(
      # Matches both "<N> <noun>" (e.g. "54 validators") and "<Noun> (<N>)"
      # (e.g. a "Shared protocols (23)" table-of-contents heading). `|| true`
      # keeps a no-match (grep exit 1) from aborting the block under set -e.
      { grep -oiE "[0-9]+ +${noun}\b" "$f" 2>/dev/null | grep -oE '^[0-9]+' || true;
        grep -oiE "${noun} +\([0-9]+\)" "$f" 2>/dev/null | grep -oE '[0-9]+' || true; }
    )
  done
done

note "checked $checked count-claim(s) across ${#DOC_FILES[@]} doc file(s)"
validator_exit
