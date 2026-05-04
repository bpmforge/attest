#!/usr/bin/env bash
#
# validate-adrs.sh -- every ADR mentioned in ARCHITECTURE.md or DECISION_LOG.md
# must have a corresponding docs/adrs/ADR-NNN-*.md file with a recognized status
# (proposed, accepted, deprecated, superseded).
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-adrs"

ROOT="$(detect_project_root "${1:-}")"

ADR_DIR="$ROOT/docs/adrs"
[[ ! -d "$ADR_DIR" ]] && ADR_DIR="$ROOT/docs/architecture/decisions"

REFS=()
for f in "$ROOT/docs/ARCHITECTURE.md" "$ROOT/docs/DECISION_LOG.md"; do
  [[ ! -f "$f" ]] && continue
  while IFS= read -r ref; do
    [[ -n "$ref" ]] && REFS+=( "$ref" )
  done < <(grep -oE 'ADR-[0-9]+' "$f" | sort -u)
done

# Dedupe
REFS_SORTED=$(printf '%s\n' "${REFS[@]:-}" | awk 'NF' | sort -u)
REF_COUNT=$(printf '%s\n' "$REFS_SORTED" | grep -c . || true)

if [[ "$REF_COUNT" -eq 0 ]]; then
  warn "no ADR-NNN references found in ARCHITECTURE.md or DECISION_LOG.md — skipping"
  validator_exit
fi

if [[ ! -d "$ADR_DIR" ]]; then
  gap "no-adr-dir" "$REF_COUNT ADR(s) referenced but no docs/adrs/ directory exists"
  validator_exit
fi

pass "found $REF_COUNT ADR reference(s); ADR dir at ${ADR_DIR#"$ROOT/"}"

VALID_STATUSES_RE='\b(proposed|accepted|deprecated|superseded|rejected)\b'

while IFS= read -r ref; do
  [[ -z "$ref" ]] && continue
  # Look for ADR-NNN-*.md in the ADR dir
  adr_file=$(find "$ADR_DIR" -type f -iname "${ref}*.md" 2>/dev/null | head -1)
  if [[ -z "$adr_file" ]]; then
    gap "missing-adr-file" "$ref referenced but no $ADR_DIR/$ref-*.md file"
    continue
  fi
  # Check status line exists
  if ! grep -qiE "$VALID_STATUSES_RE" "$adr_file"; then
    gap "missing-status" "$ref ($(basename "$adr_file")) has no recognized status (proposed|accepted|deprecated|superseded|rejected)"
  fi
done <<< "$REFS_SORTED"

validator_exit
