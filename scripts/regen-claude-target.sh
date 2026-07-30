#!/usr/bin/env bash
#
# regen-claude-target.sh — the SINGLE post-merge step that regenerates the
# generated attest-claude repo from attest and commits + pushes it.
#
# Run this ONCE after merging source PRs to main — NEVER per-executor. Parallel
# executors each running `build:claude` into the shared ../attest-claude sibling
# race each other: one leaves a stray skill that spuriously fails another's local
# tests, and a regen committed at a different moment than it was generated ships a
# STALE generated file that fails CI (both observed 2026-07-13). Generating and
# committing in one atomic step here is what prevents that.
#
# Usage:  scripts/regen-claude-target.sh [sibling-path]   (default ../attest-claude)
#
set -euo pipefail
cd "$(dirname "$0")/.."
SIBLING="${1:-../attest-claude}"

if [[ ! -d "$SIBLING/.git" ]]; then
  echo "✗ no git repo at $SIBLING — clone attest-claude as a sibling first" >&2
  exit 2
fi

# Sibling must be on a clean main so we commit only the regen, never someone
# else's in-flight work (the cross-contamination guard).
sib_branch="$(git -C "$SIBLING" branch --show-current)"
if [[ "$sib_branch" != "main" ]]; then
  echo "✗ $SIBLING is on '$sib_branch', not main — refusing to regen onto a non-main branch" >&2
  exit 2
fi
if [[ -n "$(git -C "$SIBLING" status --porcelain | grep -vE '^\?\?' || true)" ]]; then
  echo "✗ $SIBLING has uncommitted tracked changes — reconcile them before regen" >&2
  git -C "$SIBLING" status --short >&2
  exit 2
fi
git -C "$SIBLING" pull --rebase --quiet origin main || true

echo "→ regenerating claude target into $SIBLING (from $(git rev-parse --short HEAD))"
npm run build:claude >/dev/null

# awk (not grep) so a clean sibling — zero non-untracked lines — yields 0, not a
# pipefail exit that would kill this assignment under `set -o pipefail`.
changed="$(git -C "$SIBLING" status --porcelain | awk '!/^\?\?/' | wc -l | tr -d ' ')"
if [[ "$changed" -eq 0 ]]; then
  echo "✓ claude target already in sync — nothing to regen"
  exit 0
fi

echo "→ $changed generated file(s) changed; committing the fresh output"
git -C "$SIBLING" add -A
git -C "$SIBLING" commit -q -m "build: regen claude target from attest $(git rev-parse --short HEAD)"
git -C "$SIBLING" push --quiet origin main
git -C "$SIBLING" push --quiet github main

# Final gate: the sync check must now pass against the just-committed sibling.
if npm run build:claude:check >/dev/null 2>&1; then
  echo "✓ claude target regenerated, pushed both remotes, sync gate clean"
else
  echo "✗ build:claude:check still drifts after regen — investigate before releasing" >&2
  exit 1
fi
