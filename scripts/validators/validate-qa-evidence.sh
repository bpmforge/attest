#!/usr/bin/env bash
#
# validate-qa-evidence.sh -- enforces that a qa-vnv-engineer V&V report is
# EVIDENCE-backed, not prose. The whole thesis of the QA/V&V discipline is
# "measure, don't eyeball" -- so a report with no traceability and no attached
# artifacts is a gap, however confident its wording.
#
# Skips clean when there is no V&V report yet (nothing to validate) -- same
# graceful-fallback shape as validate-design-tokens.sh.
#
# Checks (against the newest docs/testing/vnv/VNV_REPORT_*.md):
#   1. A V&V report exists                        -> else skip clean
#   2. Report has a Traceability matrix section   (requirement -> test -> evidence)
#   3. Report has an Exit-criteria scorecard
#   4. Report names an evidence bundle directory  AND that dir is non-empty
#   5. Report contains at least one measured finding (a number: px / :1 / % / rect)
#      -- guards against adjective-only "looks fine" findings
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-qa-evidence"

ROOT="$(detect_project_root "${1:-}")"
VNV_DIR="$ROOT/docs/testing/vnv"

# -- 1. Locate the newest V&V report ---------------------------------------
REPORT=""
if [[ -d "$VNV_DIR" ]]; then
  REPORT="$(ls -t "$VNV_DIR"/VNV_REPORT_*.md 2>/dev/null | head -1 || true)"
fi

if [[ -z "$REPORT" ]]; then
  note "no V&V report (docs/testing/vnv/VNV_REPORT_*.md) -- nothing to validate"
  validator_exit
fi

note "validating $(basename "$REPORT")"

# -- 2. Traceability matrix ------------------------------------------------
if grep -qiE '^#+.*traceability matrix' "$REPORT"; then
  pass "traceability matrix present"
else
  gap "traceability" "report has no 'Traceability matrix' section (requirement -> test -> evidence)"
fi

# -- 3. Exit-criteria scorecard --------------------------------------------
if grep -qiE '^#+.*exit.?criteria' "$REPORT"; then
  pass "exit-criteria scorecard present"
else
  gap "exit-criteria" "report has no 'Exit-criteria' scorecard"
fi

# -- 4. Evidence bundle named AND non-empty --------------------------------
# Report should reference docs/testing/vnv/evidence/<something>/ .
BUNDLE_REF="$(grep -oiE 'docs/testing/vnv/evidence/[A-Za-z0-9._/-]+' "$REPORT" | head -1 || true)"
EVIDENCE_ROOT="$VNV_DIR/evidence"

if [[ -z "$BUNDLE_REF" ]]; then
  gap "evidence-ref" "report does not name an evidence bundle (docs/testing/vnv/evidence/<date>/)"
elif [[ ! -d "$EVIDENCE_ROOT" ]]; then
  gap "evidence-missing" "evidence directory $EVIDENCE_ROOT does not exist -- report claims artifacts that were never written"
else
  # Any real artifact anywhere under evidence/ (trace/video/screenshot/diff/report).
  ARTIFACTS="$(find "$EVIDENCE_ROOT" -type f \
    \( -iname '*.png' -o -iname '*.zip' -o -iname '*.webm' -o -iname '*.mp4' \
       -o -iname '*.xml' -o -iname '*.json' -o -iname '*.html' \) 2>/dev/null | wc -l | tr -d ' ' || true)"
  if [[ "${ARTIFACTS:-0}" -eq 0 ]]; then
    gap "evidence-empty" "evidence directory exists but holds no artifacts (trace/video/screenshot/diff/report)"
  else
    pass "evidence bundle non-empty ($ARTIFACTS artifact(s))"
  fi
fi

# -- 5. At least one MEASURED finding (number, not adjective) ---------------
# px overlap, contrast ratio (n:1 / n.n:1), percentage, or a rect/scrollWidth mention.
if grep -qiE '[0-9]+ ?px|[0-9]+(\.[0-9]+)? ?: ?1|[0-9]+(\.[0-9]+)? ?%|scrollwidth|getboundingclientrect|diff [0-9]' "$REPORT"; then
  pass "report contains measured findings (numbers, not adjectives)"
else
  warn "no measured value (px / ratio / % ) found -- verify findings are quantified, not 'looks fine'"
fi

validator_exit
