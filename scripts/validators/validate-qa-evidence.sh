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
  # No report. For a UI-bearing project this is a GAP, not a clean skip -- the
  # end-user V&V run was never done, and the expert must not be silently skipped.
  # For a non-UI project there is nothing to validate.
  UI_BEARING=0
  for sig in \
    "$ROOT/docs/design/UX_SPEC.md" \
    "$ROOT/docs/UX_SPEC.md" \
    "$ROOT/docs/design/tokens.json" \
    "$ROOT/docs/design/STYLE_GUIDE.md"; do
    [[ -f "$sig" ]] && UI_BEARING=1 && break
  done
  if [[ "$UI_BEARING" -eq 1 ]]; then
    # Escape hatch: a UI-bearing project may legitimately have no runnable app to
    # validate (component library, API-with-trivial-UI, pre-MVP). Rather than
    # hard-block release -- which pushes teams to rip the gate out -- accept a
    # DOCUMENTED waiver: a VNV_WAIVER.md with a stated reason, or an ARCHITECTURE
    # declaration that there is no runnable UI. A bare/empty waiver does NOT count
    # (must carry a rationale), so the escape hatch can't be used to silently skip.
    WAIVER_FILE="$VNV_DIR/VNV_WAIVER.md"
    ARCH="$ROOT/docs/ARCHITECTURE.md"
    if [[ -f "$WAIVER_FILE" ]] && grep -qiE 'reason|because|not applicable|no runnable ui|deferred to' "$WAIVER_FILE"; then
      warn "end-user V&V waived via docs/testing/vnv/VNV_WAIVER.md (rationale present) -- not a validated release"
    elif [[ -f "$ARCH" ]] && grep -qiE 'no runnable ui|v&v not applicable|no ui to validate' "$ARCH"; then
      warn "end-user V&V waived: ARCHITECTURE.md declares no runnable UI"
    else
      gap "missing-vnv-report" "UI-bearing project has no end-user V&V report (docs/testing/vnv/VNV_REPORT_*.md) and no waiver -- qa-vnv-engineer never ran. Add the report, or docs/testing/vnv/VNV_WAIVER.md with a rationale if there is no runnable app to validate"
    fi
  else
    note "no V&V report and no UI signal -- non-UI project, nothing to validate"
  fi
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

# -- 6. Substance: a report that CLAIMS journeys must SHOW them -------------
# Anti-hollowing: if the report has a Journey-findings section with a verdict,
# the evidence bundle must contain a trace (*.zip) and a screenshot (*.png) --
# otherwise "3 journeys PASS" is an unbacked assertion, exactly what this gate
# exists to prevent.
if [[ -d "$EVIDENCE_ROOT" ]] && grep -qiE '^#+.*journey' "$REPORT" && grep -qiE 'PASS|FAIL|✅|❌' "$REPORT"; then
  TRACES="$(find "$EVIDENCE_ROOT" -type f -iname '*.zip' 2>/dev/null | wc -l | tr -d ' ' || true)"
  SHOTS="$(find "$EVIDENCE_ROOT" -type f -iname '*.png' 2>/dev/null | wc -l | tr -d ' ' || true)"
  if [[ "${TRACES:-0}" -eq 0 ]]; then
    gap "journey-no-trace" "report claims journeys with verdicts but the evidence bundle has no trace (*.zip) -- a passing journey must be replayable"
  elif [[ "${SHOTS:-0}" -eq 0 ]]; then
    gap "journey-no-screenshot" "report claims journeys but the evidence bundle has no screenshot (*.png)"
  else
    pass "journey claims backed by evidence ($TRACES trace(s), $SHOTS screenshot(s))"
  fi
fi

validator_exit
