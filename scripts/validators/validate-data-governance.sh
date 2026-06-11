#!/usr/bin/env bash
#
# validate-data-governance.sh -- a schema with personal data must ship with
# a governance doc, not "we'll sort out GDPR later."
#
# data-steward produces docs/DATA_GOVERNANCE.md at Phase 3; this validator
# checks that it exists when the schema needs it and that its content is
# concrete:
#
#   trigger    — if docs/DATABASE.md has likely-PII columns (email, phone,
#                address, name, birth, ssn, passport, ip_address) and no
#                docs/DATA_GOVERNANCE.md exists, that is a gap
#   classify   — a classification table (every field gets a class)
#   retention  — retention periods with triggers; "indefinite" is a gap
#   erasure    — an erasure path (right to be forgotten / anonymization)
#   encryption — at-rest / in-transit statement per class
#   processors — third-party processor inventory
#
# Exit: 0 = clean / 1 = gaps / 2 = invocation error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-data-governance"

ROOT="$(detect_project_root "${1:-}")"

DB_DOC="$ROOT/docs/DATABASE.md"
GOV_DOC="$ROOT/docs/DATA_GOVERNANCE.md"

# 1. No schema yet -- nothing to govern.
if ! file_exists_nonempty "$DB_DOC"; then
  warn "no docs/DATABASE.md yet — skipping (classify after the schema exists)"
  validator_exit
fi

# 2. Schema exists but no governance doc -- gap only if the schema looks like
#    it holds personal data.
if ! file_exists_nonempty "$GOV_DOC"; then
  if grep -qiE '(email|phone|address|name|birth|ssn|passport|ip_address)' "$DB_DOC"; then
    gap "missing-governance-doc" "docs/DATABASE.md contains likely-PII columns (email/phone/address/name/birth/ssn/passport/ip_address) but no docs/DATA_GOVERNANCE.md exists — run data-steward --classify"
  else
    warn "docs/DATA_GOVERNANCE.md not found — schema shows no obvious PII columns, but classify anyway before shipping"
  fi
  validator_exit
fi

note "Checking: ${GOV_DOC#"$ROOT/"}"

CONTENT="$(cat "$GOV_DOC")"

has() { grep -qiE "$1" <<< "$CONTENT"; }

# 3a. Classification table -- every field gets a class
if ! has 'classif'; then
  gap "no-classification" "${GOV_DOC#"$ROOT/"}: no classification table — classify every column (public/internal/confidential/PII/special-category)"
fi

# 3b. Retention -- periods with triggers, not vibes
if ! has '(retention|delete after|days|months)'; then
  gap "no-retention" "${GOV_DOC#"$ROOT/"}: no retention content — every PII class needs a retention period with a trigger (e.g. 'account deletion + 30d')"
fi

# 3c. Erasure -- the actual procedure, not a policy sentence
if ! has '(erasure|right to be forgotten|anonymi)'; then
  gap "no-erasure" "${GOV_DOC#"$ROOT/"}: no erasure content — define the DELETE/anonymize path per PII class, including FK strategy"
fi

# 3d. Encryption -- stated per class, at-rest AND in-transit
if ! has 'encrypt'; then
  gap "no-encryption" "${GOV_DOC#"$ROOT/"}: no encryption content — state at-rest and in-transit mechanism per data class"
fi

# 3e. Processors -- every external API receiving user data
if ! has '(processor|third.part|sub-process)'; then
  gap "no-processors" "${GOV_DOC#"$ROOT/"}: no processor inventory — enumerate every external API receiving user data (analytics, email, error tracking, LLM APIs) with purpose + DPA status"
fi

# 3f. "indefinite" retention is never acceptable
if has 'indefinite'; then
  gap "indefinite-retention" "${GOV_DOC#"$ROOT/"}: contains 'indefinite' retention — every retention period needs a trigger + duration"
fi

validator_exit
