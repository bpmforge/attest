#!/usr/bin/env bash
#
# validate-completion-manifest.sh -- confirm a HANDOFF completion manifest has
# the required sections.
#
# Every specialist agent, at the end of a HANDOFF, writes a Completion Manifest
# to docs/reviews/ or docs/work/. sdlc-lead uses it to decide pass/fail/redo.
# This validator enforces the schema so sdlc-lead doesn't have to eyeball it.
#
# Required sections (any heading level, case-insensitive):
#   - Files produced
#   - Decisions (or Decisions made)
#   - Known issues (or Deferred)
#   - Verify result (or Test result / Verification)
#
# Optional but recommended (warn only):
#   - Tech stack compliance
#   - Anti-slop audit
#
# Usage:
#   validate-completion-manifest.sh <manifest-path>
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-completion-manifest"

MANIFEST="${1:-}"
if [[ -z "$MANIFEST" ]]; then
  fatal "missing manifest path. Usage: validate-completion-manifest.sh <path>"
fi

if ! file_exists_nonempty "$MANIFEST"; then
  gap "missing-file" "$MANIFEST does not exist or is empty"
  validator_exit
fi

pass "found manifest: $MANIFEST ($(line_count "$MANIFEST") lines)"

# -- Required sections ------------------------------------------------------
require_section() {
  local label="$1"
  local pattern="$2"
  if grep -qiE "^#+[[:space:]]+${pattern}" "$MANIFEST"; then
    pass "section: $label"
  else
    gap "missing-section" "no '$label' heading (pattern: $pattern)"
  fi
}

require_section "Files produced"  '(files[[:space:]]+produced|files[[:space:]]+created|outputs)'
require_section "Decisions"       '(decisions(\s+made)?|design[[:space:]]+decisions)'
require_section "Known issues"    '(known[[:space:]]+issues|deferred|caveats)'
require_section "Verify result"   '(verify[[:space:]]+result|verification|test[[:space:]]+result|tests?)'

# -- Tracker updated (G-D: tracking-as-gate) --------------------------------
# A step must state where it was tracked so work isn't lost between steps.
# The git-based validate-tracker-fresh.sh proves the tracker actually changed;
# this proves the manifest declares it.
if ! grep -qiE '^[[:space:]]*[*-]?[[:space:]]*tracker[[:space:]]+updated[[:space:]]*:' "$MANIFEST"; then
  gap "no-tracker-line" "manifest lacks a 'Tracker updated: <file>' line — record where this step was tracked (SDLC_TRACKER / PROGRESS / DELEGATION_LOG / CHANGELOG)"
fi

# -- Recommended sections (warn, not fail) ----------------------------------
if ! grep -qiE '^#+[[:space:]]+(tech[[:space:]]+stack|stack[[:space:]]+compliance)' "$MANIFEST"; then
  warn "no 'Tech stack compliance' section (recommended for coding-agent HANDOFFs)"
fi
if ! grep -qiE '^#+[[:space:]]+(anti-?slop|anti[[:space:]]+slop)' "$MANIFEST"; then
  warn "no 'Anti-slop audit' section (recommended for coding-agent HANDOFFs)"
fi

# -- Placeholder check ------------------------------------------------------
if has_placeholder "$MANIFEST"; then
  gap "placeholder" "manifest contains PLACEHOLDER / [TODO] / [TBD] markers"
fi

# -- Completion phrase ------------------------------------------------------
# Per HANDOFF protocol: the manifest must end with a completion phrase of form
# "<agent> done -- <one sentence>" or "<agent> done — <one sentence>"
# (em-dash variant). Use alternation instead of a character class so the
# multi-byte em-dash matches cleanly across greps.
#
# Patterns accepted:
#   "foo done -- bar"        ASCII double-hyphen
#   "foo done --- bar"       ASCII triple-hyphen
#   "foo done — bar"         Unicode em-dash (U+2014, 3-byte UTF-8)
#   "foo done: bar"          Colon separator (permissive)
# First try ASCII patterns via grep -E; fall back to Perl for the em-dash
# which requires UTF-8-aware regex.
# Accept any of: ASCII double-hyphen, colon, or literal em-dash (byte sequence
# E2 80 94) as the separator. Build a grep pattern via printf so the em-dash
# lands in the regex as three literal bytes under any LC_ALL setting.
_em_dash=$(printf '\xE2\x80\x94')
if ! LC_ALL=C tail -20 "$MANIFEST" | LC_ALL=C grep -qE "(done|complete)[[:space:]]+(-{2,}|:|${_em_dash})"; then
  gap "no-completion-phrase" "manifest does not end with a recognizable completion phrase (e.g. 'agent done -- ...')"
fi

validator_exit
