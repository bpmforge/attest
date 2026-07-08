#!/usr/bin/env bash
#
# validate-challenger-gate.sh -- any FIX_BACKLOG/review/security report
# containing a HIGH or CRITICAL finding requires a matching
# docs/reviews/CHALLENGE_REPORT_*.md, and every challenge report found must
# show zero unresolved CONTRADICTED verdicts (T27.3).
#
# CHALLENGER_PROTOCOL.md already defines the trigger table and report
# format (docs/reviews/CHALLENGE_REPORT_<slug>_<date>.md, a "## Summary"
# block with "- CONTRADICTED: N" and "- Action required: YES/NO" lines) --
# this validator is the enforcement side: confirmed 2026-07-07 that zero
# validators actually checked for a challenge report's existence, so the
# prose trigger table was opt-in in practice.
#
# Scope (deliberately narrower than CHALLENGER_PROTOCOL.md's full trigger
# table, matching this ticket's rescoped text): docs/reviews/*.md and
# docs/security/*.md, excluding CHALLENGE_REPORT_*.md files themselves.
# CONTRADICTED-count resolution is read from the report's own Summary block
# as written -- this validator does not track whether a CONTRADICTED
# finding was subsequently addressed in the original artifact; a report
# that still shows CONTRADICTED > 0 is unresolved by definition until the
# report itself is revised down to 0 (or a fresh report replaces it).
#
# Usage: validate-challenger-gate.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-challenger-gate"

ROOT="$(detect_project_root "${1:-}")"

SEVERITY_PATTERN='\b(CRITICAL|HIGH)\b'

# -- 1. find source reports with a HIGH/CRITICAL finding --------------------
SOURCE_HITS=()
for dir in "$ROOT/docs/reviews" "$ROOT/docs/security"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    base="$(basename "$f")"
    case "$base" in
      CHALLENGE_REPORT_*) continue ;;
    esac
    if grep -qE "$SEVERITY_PATTERN" "$f" 2>/dev/null; then
      SOURCE_HITS+=("$f")
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name '*.md' 2>/dev/null)
done

if [[ "${#SOURCE_HITS[@]}" -eq 0 ]]; then
  note "no FIX_BACKLOG/review/security report with a CRITICAL or HIGH finding found -- nothing to gate"
  validator_exit
fi

pass "found ${#SOURCE_HITS[@]} report(s) with a CRITICAL/HIGH finding"

# -- 2. at least one CHALLENGE_REPORT must exist -----------------------------
CHALLENGE_REPORTS=()
if [[ -d "$ROOT/docs/reviews" ]]; then
  while IFS= read -r f; do
    [[ -n "$f" ]] && CHALLENGE_REPORTS+=("$f")
  done < <(find "$ROOT/docs/reviews" -maxdepth 1 -type f -name 'CHALLENGE_REPORT_*.md' 2>/dev/null)
fi

if [[ "${#CHALLENGE_REPORTS[@]}" -eq 0 ]]; then
  gap "missing-challenge-report" "${#SOURCE_HITS[@]} report(s) contain a CRITICAL/HIGH finding but no docs/reviews/CHALLENGE_REPORT_*.md exists -- run the challenger agent per CHALLENGER_PROTOCOL.md before this gate passes: ${SOURCE_HITS[*]}"
  validator_exit
fi

pass "found ${#CHALLENGE_REPORTS[@]} CHALLENGE_REPORT file(s)"

# -- 3. every challenge report must show zero unresolved CONTRADICTED -------
for report in "${CHALLENGE_REPORTS[@]}"; do
  rel="${report#"$ROOT"/}"
  contradicted_line="$(grep -m1 -E '^-[[:space:]]*CONTRADICTED:' "$report" 2>/dev/null || true)"
  if [[ -z "$contradicted_line" ]]; then
    warn "$rel: no '- CONTRADICTED: N' line found in Summary -- can't verify resolution, skipping (malformed report?)"
    continue
  fi
  count="$(printf '%s' "$contradicted_line" | grep -oE '[0-9]+' | head -1)"
  if [[ -n "$count" && "$count" -gt 0 ]]; then
    gap "unresolved-contradicted" "$rel: Summary shows CONTRADICTED: $count -- the challenged artifact must be revised and this report updated to 0 (or replaced) before the gate passes"
  else
    pass "$rel: 0 CONTRADICTED"
  fi
done

validator_exit
