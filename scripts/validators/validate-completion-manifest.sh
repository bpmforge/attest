#!/usr/bin/env bash
#
# validate-completion-manifest.sh -- confirm a HANDOFF completion manifest has
# the required sections AND that its claims are actually true (T27.2 v2).
#
# v1 only checked schema (do the required headings exist). That closes
# "cannot be faked by omission" but not "cannot be faked by content" -- a
# manifest could claim files that were never written, or "tests pass" with
# nothing to check that against, and v1 would happily pass it. v2 adds three
# objective, deterministic checks on top of the v1 schema check:
#
#   1. Every path cited in "Files produced" must exist on disk.
#   2. "Verify result" must cite at least one concrete artifact path (a test
#      log, a receipt, a VERIFY_*.md, etc) and every cited path must exist.
#      This is a receipt-CHECK, not a re-run: re-executing an arbitrary
#      command string extracted from prose is both an injection vector and
#      non-reproducible in this validator's context, so v2 deliberately
#      checks "the evidence you cited is real" rather than "re-derive the
#      evidence yourself."
#   3. The manifest must declare Maker: and Verifier: identity lines, and
#      they must differ (trim+lowercase compared, same normalization as
#      scripts/lib/tickets-lifecycle.mjs's sameActor() and waive-gate.sh) --
#      self-verification defeats the entire point of a verify step.
#
# None of this proves the CONTENT is truthful (a fabricated file with real
# content still exists; a cited receipt could itself be stale) -- that's
# CHALLENGER_PROTOCOL.md's job (veracity), not this validator's (existence).
# What v2 closes is the cheaper, more common failure: claiming an artifact
# that was simply never produced.
#
# Known limitation (independent review, 2026-07-08): path extraction
# requires a backtick-quoted token containing "/". A root-level bare
# filename with no slash (`` `test.log` ``) is invisible to the extractor
# and can't be checked; a non-file backtick reference that happens to
# contain a slash (a URL like `` `https://example.com/docs` ``) is treated
# as a path candidate and false-positives as file-not-found. Both are
# accepted asymmetric tradeoffs of a cheap grep-based extractor, not a
# real parser -- fails toward stricter (URL) in one direction and toward
# permissive (bare filename) in the other, rather than either uniformly.
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
#   validate-completion-manifest.sh <manifest-path> [project-root]
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-completion-manifest"

MANIFEST="${1:-}"
if [[ -z "$MANIFEST" ]]; then
  fatal "missing manifest path. Usage: validate-completion-manifest.sh <path> [project-root]"
fi

ROOT="$(detect_project_root "${2:-}")"

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

# -- extract a heading's body: every line after the matching heading up to
# the next heading line or EOF. Used by both the Files-produced and
# Verify-result checks below.
section_body() {
  local pattern="$1"
  # This machine's system awk (onetrueawk) has no gawk IGNORECASE special
  # variable -- setting it is a silent no-op, not an error, so a naive
  # BEGIN{IGNORECASE=1} looks like it works and doesn't (same portability
  # trap as T22.19's \b-in-awk bug). tolower() on both sides is POSIX and
  # portable everywhere.
  awk -v pat="$(printf '%s' "$pattern" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { in_section = 0 }
    { line = tolower($0) }
    line ~ ("^#+[[:space:]]+" pat) { in_section = 1; next }
    line ~ /^#+[[:space:]]/ { if (in_section) exit }
    in_section { print }
  ' "$MANIFEST"
}

# extract backtick-quoted, path-looking tokens (must contain a "/") from a
# block of text -- this repo's manifest convention always backtick-quotes
# file paths (see every agent's own Completion Manifest examples).
extract_paths() {
  grep -oE '`[^`]*/[^`]*`' | tr -d '`'
}

# Symlink/traversal-safe existence check (Shipwright field run 2026-07-12,
# W1-07 escape class): a bare `-e "$ROOT/$p"` (a) resolves `../` traversal
# outside ROOT and (b) FOLLOWS a symlink the session created inside its own
# scope pointing outside (src/leak.txt -> ~/.ssh/id_rsa) -- so a manifest
# could "prove" files it never produced, or probe paths outside the worktree.
# Resolve the REAL path of both ROOT and the candidate and require prefix
# containment; a cited path that escapes is a gap, never stat'd further.
#   prints: "ok" | "missing" | "escapes"
resolve_in_root() {
  python3 - "$ROOT" "$1" 2>/dev/null <<'PYEOF'
import os, sys
root = os.path.realpath(sys.argv[1])
cand = sys.argv[2]
if os.path.isabs(cand):
    print("escapes"); sys.exit(0)
# Containment BEFORE any filesystem touch: probing existence of an outside
# path first would itself leak information (missing vs escapes reveals
# whether the outside target exists).
lexical = os.path.normpath(os.path.join(root, cand))
if not (lexical == root or lexical.startswith(root + os.sep)):
    print("escapes"); sys.exit(0)
if not os.path.lexists(lexical):
    print("missing"); sys.exit(0)
real = os.path.realpath(lexical)
inside = real == root or real.startswith(root + os.sep)
print("ok" if inside else "escapes")
PYEOF
}

# -- 1. Files produced: every cited path must exist on disk -----------------
files_body="$(section_body '(files[[:space:]]+produced|files[[:space:]]+created|outputs)')"
files_checked=0
if [[ -n "$files_body" ]]; then
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    files_checked=$((files_checked + 1))
    case "$(resolve_in_root "$p")" in
      ok) : ;;
      escapes)
        gap "file-escapes-root" "'Files produced' cites '$p' -- resolves outside $ROOT (traversal or symlink escape); refused, never read" ;;
      *)
        gap "file-not-found" "'Files produced' cites '$p' -- does not exist at $ROOT/$p" ;;
    esac
  done < <(printf '%s\n' "$files_body" | extract_paths)
fi
if [[ -n "$files_body" && "$files_checked" -eq 0 ]]; then
  # Found by independent review (2026-07-08): a "Files produced" section
  # with pure prose and no backtick-quoted paths at all trivially evaded
  # the stat check below -- nothing was ever extracted to check, so it
  # silently passed with zero gaps despite this being the exact claim v2
  # exists to verify. Mirrors the equivalent "Verify result" no-artifact
  # gap a few lines down, which already had this guard.
  gap "files-no-artifact" "'Files produced' section has no backtick-quoted path -- an unchecked prose claim like 'I wrote some TypeScript files' isn't verifiable"
elif [[ "$files_checked" -gt 0 ]]; then
  pass "checked $files_checked cited file(s) against disk"
fi

# -- 2. Verify result: must cite >=1 artifact, every cited artifact exists --
verify_body="$(section_body '(verify[[:space:]]+result|verification|test[[:space:]]+result|tests?)')"
verify_artifacts=0
if [[ -n "$verify_body" ]]; then
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    verify_artifacts=$((verify_artifacts + 1))
    if [[ ! -e "$ROOT/$p" ]]; then
      gap "verify-artifact-not-found" "'Verify result' cites '$p' -- does not exist at $ROOT/$p"
    fi
  done < <(printf '%s\n' "$verify_body" | extract_paths)
fi
if [[ -n "$verify_body" && "$verify_artifacts" -eq 0 ]]; then
  gap "verify-no-artifact" "'Verify result' section has no concrete artifact reference (a backtick-quoted path to a test log, receipt, or VERIFY_*.md) -- a bare claim like 'tests pass' isn't checkable"
elif [[ "$verify_artifacts" -gt 0 ]]; then
  pass "checked $verify_artifacts cited verify artifact(s) against disk"
fi

# -- 3. Maker / Verifier identity: both present, must differ ----------------
maker_line="$(grep -m1 -iE '^[[:space:]]*[*-]?[[:space:]]*maker[[:space:]]*:' "$MANIFEST" || true)"
verifier_line="$(grep -m1 -iE '^[[:space:]]*[*-]?[[:space:]]*verifier[[:space:]]*:' "$MANIFEST" || true)"

maker="$(printf '%s' "$maker_line" | sed -E 's/^[[:space:]]*[*-]?[[:space:]]*[Mm]aker[[:space:]]*:[[:space:]]*//')"
verifier="$(printf '%s' "$verifier_line" | sed -E 's/^[[:space:]]*[*-]?[[:space:]]*[Vv]erifier[[:space:]]*:[[:space:]]*//')"

if [[ -z "$maker_line" ]]; then
  gap "missing-maker" "manifest lacks a 'Maker: <name>' line -- who produced this artifact?"
fi
if [[ -z "$verifier_line" ]]; then
  gap "missing-verifier" "manifest lacks a 'Verifier: <name>' line -- who independently checked it? (MODEL_ADAPTER.md maker/verifier split)"
fi
if [[ -n "$maker_line" && -n "$verifier_line" ]]; then
  maker_norm="$(printf '%s' "$maker" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  verifier_norm="$(printf '%s' "$verifier" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -n "$maker_norm" && "$maker_norm" == "$verifier_norm" ]]; then
    gap "maker-verifier-same" "Maker ('$maker') and Verifier ('$verifier') are the same identity -- self-verification defeats the point of a verify step"
  else
    pass "maker ('$maker') and verifier ('$verifier') are distinct identities"
  fi
fi

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
