#!/usr/bin/env bash
#
# validate-owasp.sh -- confirm the OWASP Top 10 tracker has all 10 categories,
# every category has confidence ≥ 7, and every category is marked DONE.
#
# Looks for the tracker at (first match wins):
#   docs/security/OWASP_TRACKER.md
#   docs/security/owasp-tracker.md
#   docs/reviews/OWASP_TRACKER.md
#
# Usage:
#   validate-owasp.sh [project-root]
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-owasp"

ROOT="$(detect_project_root "${1:-}")"

# OWASP Top 10: 2021 categories A01–A10
OWASP_CATEGORIES=(
  "A01"  # Broken Access Control
  "A02"  # Cryptographic Failures
  "A03"  # Injection
  "A04"  # Insecure Design
  "A05"  # Security Misconfiguration
  "A06"  # Vulnerable and Outdated Components
  "A07"  # Identification and Authentication Failures
  "A08"  # Software and Data Integrity Failures
  "A09"  # Security Logging and Monitoring Failures
  "A10"  # Server-Side Request Forgery
)

TRACKER=""
for candidate in \
  "$ROOT/docs/security/OWASP_TRACKER.md" \
  "$ROOT/docs/security/owasp-tracker.md" \
  "$ROOT/docs/reviews/OWASP_TRACKER.md"; do
  if file_exists_nonempty "$candidate"; then
    TRACKER="$candidate"
    break
  fi
done

if [[ -z "$TRACKER" ]]; then
  gap "missing-file" "no OWASP tracker found (looked in docs/security/, docs/reviews/)"
  validator_exit
fi

pass "found tracker: ${TRACKER#"$ROOT/"}"

# -- Every category present -------------------------------------------------
for cat in "${OWASP_CATEGORIES[@]}"; do
  if ! grep -qE "\b${cat}\b" "$TRACKER"; then
    gap "missing-category" "$cat not found in tracker"
  fi
done

# -- Per-category status ----------------------------------------------------
# Expected row format (flexible):
#   | A01 | Broken Access Control | 8/10 | ✅ DONE | ... |
#   | A01 | Broken Access Control | 8 | DONE | ... |
#
# We scan row-by-row, extract confidence score and status marker.

while IFS= read -r cat; do
  # Find the row for this category
  row=$(grep -E "\b${cat}\b" "$TRACKER" | head -1 || true)
  if [[ -z "$row" ]]; then
    continue  # missing-category already reported above
  fi

  # Extract confidence score: first number of form N/10 OR bare N in the 3rd+
  # pipe-separated column. Handle both.
  confidence=""
  if [[ "$row" =~ ([0-9]+)/10 ]]; then
    confidence="${BASH_REMATCH[1]}"
  else
    # Pull the 3rd pipe-separated column and sniff a number
    col3=$(printf '%s' "$row" | awk -F'|' '{print $4}' | tr -d ' ')
    if [[ "$col3" =~ ^[0-9]+$ ]]; then
      confidence="$col3"
    fi
  fi

  if [[ -z "$confidence" ]]; then
    gap "missing-confidence" "$cat has no confidence score"
  elif [[ "$confidence" -lt 7 ]]; then
    gap "low-confidence" "$cat confidence is ${confidence}/10 (requires ≥7)"
  fi

  # Status check -- require a DONE marker or ✅
  if ! [[ "$row" =~ (DONE|✅|completed|COMPLETE) ]]; then
    gap "not-done" "$cat row does not show DONE/✅ status"
  fi
done < <(printf '%s\n' "${OWASP_CATEGORIES[@]}")

# -- Attack chain analysis present? (Phase 5b output) ----------------------
CHAINS_FILE=""
for candidate in \
  "$ROOT/docs/security/attack-chains.md" \
  "$ROOT/docs/security/ATTACK_CHAINS.md"; do
  if file_exists_nonempty "$candidate"; then
    CHAINS_FILE="$candidate"
    break
  fi
done

if [[ -z "$CHAINS_FILE" ]]; then
  gap "missing-attack-chains" "no attack chain analysis (docs/security/attack-chains.md)"
else
  pass "attack-chain analysis found: ${CHAINS_FILE#"$ROOT/"}"
fi

validator_exit
