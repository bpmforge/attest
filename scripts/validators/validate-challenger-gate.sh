#!/usr/bin/env bash
#
# validate-challenger-gate.sh -- any FIX_BACKLOG/review/security report
# containing a HIGH or CRITICAL finding requires a matching
# docs/reviews/CHALLENGE_REPORT_*.md, and every challenge report found must
# show zero unresolved CONTRADICTED verdicts (T27.3).
#
# CHALLENGER_PROTOCOL.md already defines the trigger table and report
# format (docs/reviews/CHALLENGE_REPORT_<slug>_<date>.md, a header line
# "**Date:** <date> | **Artifact:** <path> | **Challenger:** ..." followed
# by a "## Summary" block with "- CONTRADICTED: N" and "- Action required:
# YES/NO" lines) -- this validator is the enforcement side: confirmed
# 2026-07-07 that zero validators actually checked for a challenge report's
# existence, so the prose trigger table was opt-in in practice.
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
# Slug/date correlation (T22.20): T27.3 shipped a pure existence count --
# "at least one CHALLENGE_REPORT exists anywhere" -- which independent
# review (2026-07-08) showed is bypassable: a stale, unrelated, clean
# challenge report satisfies the gate forever, even for a brand-new
# never-challenged CRITICAL finding in a different report. This validator
# now requires each SOURCE report (the one with the HIGH/CRITICAL finding)
# to be individually matched to a challenge report that declares it via the
# header's "**Artifact:** <path>" field. The Artifact field is already
# mandatory in CHALLENGER_PROTOCOL.md's report template, so no new slug
# convention needed inventing. Matching: if the declared path contains a
# "/" it is compared as a full ROOT-relative path (exact string, after
# stripping a leading "./") -- this avoids a same-basename collision
# between, say, docs/reviews/FINDINGS.md and docs/security/FINDINGS.md,
# which a pure-basename compare would incorrectly conflate (that would be
# the exact bug class this ticket exists to close, just one level down).
# If the declared path is a bare filename (no "/"), it is compared against
# the source's basename -- but ONLY when that basename is unique among all
# of THIS run's source reports. Two source reports sharing a basename in
# different directories (docs/reviews/FINDINGS.md, docs/security/FINDINGS.md)
# make a bare "FINDINGS.md" declaration genuinely ambiguous: it cannot say
# which one was actually challenged, so it satisfies NEITHER (fail closed,
# same "ambiguous -> gate red" posture the rest of this validator already
# takes for a malformed report). Either way the comparison is exact-string,
# no fuzzy matching, so a near-miss filename does not accidentally match. A
# challenge report with no parseable Artifact field cannot satisfy any
# source's requirement (same treatment as a missing CONTRADICTED line --
# see "malformed-challenge-report" below).
#
# Non-goal: this does not fall back to matching by date proximity or by
# a slug parsed out of the CHALLENGE_REPORT_<slug>_<date>.md filename --
# the ticket allowed either approach and the Artifact-field basename match
# was judged more robust (no regex on human-chosen slugs) and simpler to
# reason about. A challenge report MUST declare its Artifact field for its
# clean verdict to count toward any source's requirement.
#
# Usage: validate-challenger-gate.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-challenger-gate"

ROOT="$(detect_project_root "${1:-}")"

SEVERITY_PATTERN='\b(CRITICAL|HIGH)\b'

# extract_artifact_declared <file> -- prints the file's declared
# "**Artifact:** <path>" header field, trimmed and with a leading "./"
# stripped, or "" if none/unparseable. Prints the value AS DECLARED (full
# path or bare filename) -- callers decide how to compare it.
extract_artifact_declared() {
  local report="$1" line val
  line="$(grep -m1 -oE '\*\*Artifact:\*\*[^|]*' "$report" 2>/dev/null || true)"
  [[ -z "$line" ]] && { printf ''; return; }
  val="${line#\*\*Artifact:\*\*}"
  val="$(printf '%s' "$val" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  val="${val#\`}"; val="${val%\`}"
  val="${val#./}"
  printf '%s' "$val"
}

# is_ambiguous_basename <base> -- true if 2+ of this run's SOURCE_HITS
# share the given basename (populated after step 1). Bash-3.2-safe empty-
# array guard, same pattern as the CHALLENGE_REPORTS loop below.
is_ambiguous_basename() {
  local b="$1" x
  if [[ "${#AMBIGUOUS_BASENAMES[@]}" -gt 0 ]]; then
    for x in "${AMBIGUOUS_BASENAMES[@]}"; do
      [[ "$x" == "$b" ]] && return 0
    done
  fi
  return 1
}

# artifact_matches_source <declared> <src_rel> -- true if a challenge
# report's declared Artifact value correlates to a given source report's
# ROOT-relative path. A declared value containing "/" is compared as a
# full path (exact match against src_rel); a bare filename is compared
# against the source's basename, but only accepted when that basename is
# not ambiguous (see is_ambiguous_basename above) -- an ambiguous bare
# filename cannot be trusted to name this specific source.
artifact_matches_source() {
  local declared="$1" src_rel="$2" src_base
  src_base="$(basename "$src_rel")"
  case "$declared" in
    */*) [[ "$declared" == "$src_rel" ]] ;;
    *)
      [[ -z "$declared" || "$declared" != "$src_base" ]] && return 1
      ! is_ambiguous_basename "$src_base"
      ;;
  esac
}

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
  done < <(find "$dir" -type f -name '*.md' 2>/dev/null)
done

if [[ "${#SOURCE_HITS[@]}" -eq 0 ]]; then
  note "no FIX_BACKLOG/review/security report with a CRITICAL or HIGH finding found -- nothing to gate"
  validator_exit
fi

pass "found ${#SOURCE_HITS[@]} report(s) with a CRITICAL/HIGH finding"

# -- 1b. detect basenames shared by 2+ source reports (see
# is_ambiguous_basename / artifact_matches_source above for why this
# matters: a bare-filename Artifact declaration can't disambiguate them).
AMBIGUOUS_BASENAMES=()
i=0
while [[ "$i" -lt "${#SOURCE_HITS[@]}" ]]; do
  bi="$(basename "${SOURCE_HITS[$i]}")"
  if ! is_ambiguous_basename "$bi"; then
    count=0
    j=0
    while [[ "$j" -lt "${#SOURCE_HITS[@]}" ]]; do
      [[ "$(basename "${SOURCE_HITS[$j]}")" == "$bi" ]] && count=$((count + 1))
      j=$((j + 1))
    done
    [[ "$count" -gt 1 ]] && AMBIGUOUS_BASENAMES+=("$bi")
  fi
  i=$((i + 1))
done
if [[ "${#AMBIGUOUS_BASENAMES[@]}" -gt 0 ]]; then
  warn "basename(s) shared by 2+ source reports (bare Artifact filenames can't disambiguate these -- declare a full path): ${AMBIGUOUS_BASENAMES[*]}"
fi

# -- 2. collect CHALLENGE_REPORT files ---------------------------------------
CHALLENGE_REPORTS=()
if [[ -d "$ROOT/docs/reviews" ]]; then
  while IFS= read -r f; do
    [[ -n "$f" ]] && CHALLENGE_REPORTS+=("$f")
  done < <(find "$ROOT/docs/reviews" -type f -name 'CHALLENGE_REPORT_*.md' 2>/dev/null)
fi

if [[ "${#CHALLENGE_REPORTS[@]}" -eq 0 ]]; then
  note "no docs/reviews/CHALLENGE_REPORT_*.md files exist yet"
else
  pass "found ${#CHALLENGE_REPORTS[@]} CHALLENGE_REPORT file(s)"
fi

# -- 3. classify each challenge report: malformed / unresolved / clean ------
# Only "clean" reports (parseable CONTRADICTED:0 AND a parseable Artifact
# field) are eligible to satisfy a source report's matching requirement in
# step 4. Malformed and unresolved reports still get their own gap here,
# same as T27.3, but are excluded from matching -- an unresolved or
# unattributable challenge report cannot vouch for any source.
OK_CR_FILE=()
OK_CR_ARTIFACT_DECLARED=()

# Guard against bash 3.2's "${arr[@]}" unbound-variable error under `set -u`
# when the array is empty (fixed upstream in bash 4.4+, but macOS system
# bash is 3.2) -- only enter the loop when there's something to iterate.
if [[ "${#CHALLENGE_REPORTS[@]}" -gt 0 ]]; then
  for report in "${CHALLENGE_REPORTS[@]}"; do
    rel="${report#"$ROOT"/}"
    contradicted_line="$(grep -m1 -E '^-[[:space:]]*CONTRADICTED:' "$report" 2>/dev/null || true)"
    if [[ -z "$contradicted_line" ]]; then
      # A challenge report with no parseable Summary is indistinguishable
      # from a trivial placeholder ("touch CHALLENGE_REPORT_x.md") that
      # satisfies the existence check without ever actually challenging
      # anything -- found by independent review (2026-07-08). Malformed,
      # not silently tolerated: a real challenge report always has this
      # line per CHALLENGER_PROTOCOL.md's format.
      gap "malformed-challenge-report" "$rel: no '- CONTRADICTED: N' line found in its Summary -- doesn't follow CHALLENGER_PROTOCOL.md's report format, can't verify resolution"
      continue
    fi

    artifact_declared="$(extract_artifact_declared "$report")"
    if [[ -z "$artifact_declared" ]]; then
      # Same rationale as the missing-Summary case: CHALLENGER_PROTOCOL.md's
      # report template requires "**Artifact:** <path>" on the header line.
      # Without it this report cannot be correlated to the source report it
      # is meant to challenge (T22.20), so it can't count toward step 4
      # even if its own CONTRADICTED count is 0.
      gap "malformed-challenge-report" "$rel: no '**Artifact:** <path>' field found on its header line -- doesn't declare which source report it challenges, can't correlate it (CHALLENGER_PROTOCOL.md report format, T22.20)"
      continue
    fi

    count="$(printf '%s' "$contradicted_line" | grep -oE '[0-9]+' | head -1)"
    if [[ -n "$count" && "$count" -gt 0 ]]; then
      gap "unresolved-contradicted" "$rel: Summary shows CONTRADICTED: $count -- the challenged artifact must be revised and this report updated to 0 (or replaced) before the gate passes"
      continue
    fi

    pass "$rel: 0 CONTRADICTED, declares Artifact: $artifact_declared"
    OK_CR_FILE+=("$rel")
    OK_CR_ARTIFACT_DECLARED+=("$artifact_declared")
  done
fi

# -- 4. every source report needs its OWN matching clean challenge report ---
for src in "${SOURCE_HITS[@]}"; do
  src_rel="${src#"$ROOT"/}"
  matched_file=""
  i=0
  while [[ "$i" -lt "${#OK_CR_ARTIFACT_DECLARED[@]}" ]]; do
    if artifact_matches_source "${OK_CR_ARTIFACT_DECLARED[$i]}" "$src_rel"; then
      matched_file="${OK_CR_FILE[$i]}"
      break
    fi
    i=$((i + 1))
  done

  if [[ -n "$matched_file" ]]; then
    pass "$src_rel: matched by clean challenge report $matched_file (Artifact: $(basename "$src_rel"))"
  else
    gap "missing-challenge-report" "$src_rel: contains a CRITICAL/HIGH finding but no docs/reviews/CHALLENGE_REPORT_*.md declares '**Artifact:** $src_rel' (or a bare '$(basename "$src_rel")') with 0 unresolved CONTRADICTED -- an unrelated challenge report elsewhere does not satisfy this gate (T22.20); run the challenger agent on this specific report per CHALLENGER_PROTOCOL.md"
  fi
done

validator_exit
