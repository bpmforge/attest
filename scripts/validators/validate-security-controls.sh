#!/usr/bin/env bash
#
# validate-security-controls.sh -- ensures SECURITY_CONTROLS.md exists and
# that every HIGH/CRITICAL threat in THREAT_MODEL.md has a corresponding
# control entry, and that DATABASE.md, API_DESIGN.md, and ARCHITECTURE.md
# each contain a security section incorporating the controls.
#
# Part of Phase 3 gate -- runs after threat model feedback loop completes.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-security-controls"

ROOT="$(detect_project_root "${1:-}")"

SC="$ROOT/docs/SECURITY_CONTROLS.md"
TM="$ROOT/docs/THREAT_MODEL.md"

# -- 1. SECURITY_CONTROLS.md must exist and be non-empty ----------------------
if ! file_exists_nonempty "$SC"; then
  gap "missing-security-controls" "docs/SECURITY_CONTROLS.md not found or empty — run security-auditor HANDOFF to produce it"
  validator_exit
fi
pass "SECURITY_CONTROLS.md present"

# -- 2. THREAT_MODEL.md must exist --------------------------------------------
if ! file_exists_nonempty "$TM"; then
  warn "no THREAT_MODEL.md found — skipping threat coverage check"
  validator_exit
fi
pass "THREAT_MODEL.md present"

# -- 3. Every HIGH/CRITICAL threat must have a control entry ------------------
# Extract threat IDs that appear on lines containing CRITICAL or HIGH
high_critical_threats=$(grep -iE '(CRITICAL|HIGH)' "$TM" | grep -oE '(T-[0-9]+|THR-[0-9]+|THREAT-[0-9]+|T[0-9]+)' | sort -u || true)

if [[ -n "$high_critical_threats" ]]; then
  covered=0
  missing=0
  while IFS= read -r threat_id; do
    [[ -z "$threat_id" ]] && continue
    if grep -qi "$threat_id" "$SC" 2>/dev/null; then
      pass "$threat_id covered in SECURITY_CONTROLS.md"
      covered=$((covered + 1))
    else
      gap "uncovered-threat" "HIGH/CRITICAL threat $threat_id not addressed in SECURITY_CONTROLS.md"
      missing=$((missing + 1))
    fi
  done <<< "$high_critical_threats"
  note "threat coverage: $covered covered, $missing missing"
else
  pass "no HIGH/CRITICAL threats found in THREAT_MODEL.md (or no threat IDs with T-NN format)"
fi

# -- 4. DATABASE.md must have a security section ------------------------------
DB="$ROOT/docs/DATABASE.md"
if file_exists_nonempty "$DB"; then
  if grep -qiE '(## [Ss]ecurity|## [Ee]ncryption|[Ss]ecurity[[:space:]]+[Cc]ontrols|[Ee]ncryption[[:space:]]+[Aa]t[[:space:]]+[Rr]est|[Ss]ensitive[[:space:]]+[Ff]ields|[Aa]ccess[[:space:]]+[Cc]ontrol)' "$DB"; then
    pass "DATABASE.md has security/encryption section"
  else
    gap "db-missing-security" "docs/DATABASE.md has no security section — add encryption-at-rest, sensitive fields, and access control notes from SECURITY_CONTROLS.md"
  fi
else
  warn "docs/DATABASE.md not found — skipping database security check"
fi

# -- 5. API_DESIGN.md must have a security section ----------------------------
API="$ROOT/docs/API_DESIGN.md"
if file_exists_nonempty "$API"; then
  if grep -qiE '(## [Ss]ecurity|[Rr]ate[[:space:]]+[Ll]imit|[Ii]nput[[:space:]]+[Vv]alid|[Aa]uth[[:space:]]+[Rr]equirement|[Cc]SRF|[Cc]ors[[:space:]]+[Pp]olicy)' "$API"; then
    pass "API_DESIGN.md has security section"
  else
    gap "api-missing-security" "docs/API_DESIGN.md has no security section — add rate limits, input validation, and auth requirements from SECURITY_CONTROLS.md"
  fi
else
  warn "docs/API_DESIGN.md not found — skipping API security check"
fi

# -- 6. ARCHITECTURE.md must reference security controls ----------------------
ARCH="$ROOT/docs/ARCHITECTURE.md"
if file_exists_nonempty "$ARCH"; then
  if grep -qiE '(SECURITY_CONTROLS|[Ss]ecurity[[:space:]]+[Cc]ontrol|[Tt]hreat[[:space:]]+[Mm]itigation|[Ss]ecurity[[:space:]]+[Aa]rchitecture)' "$ARCH"; then
    pass "ARCHITECTURE.md references security controls"
  else
    gap "arch-missing-security" "docs/ARCHITECTURE.md does not reference security controls or mitigations — add a Security Architecture section citing SECURITY_CONTROLS.md"
  fi
else
  warn "docs/ARCHITECTURE.md not found — skipping architecture security check"
fi

validator_exit
