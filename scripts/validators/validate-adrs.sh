#!/usr/bin/env bash
#
# validate-adrs.sh -- two checks over docs/ARCHITECTURE.md, docs/TECH_STACK.md
# and docs/DECISION_LOG.md:
#
#   1. (pre-existing) every ADR-NNN mentioned in ARCHITECTURE.md or
#      DECISION_LOG.md must have a corresponding docs/adrs/ADR-NNN-*.md file
#      with a recognized status (proposed, accepted, deprecated, superseded).
#
#   2. (T29.5) a hard-to-reverse choice asserted in ARCHITECTURE.md or
#      TECH_STACK.md -- the ticket names datastore, auth model, core
#      framework, vendoring strategy as examples, HARD_CHOICE_CATEGORIES
#      below is deliberately extensible, not an exhaustive closed list --
#      must be backed by an ADR whose own content actually documents that
#      category (not just any ADR reference anywhere in the doc). A "hard
#      choice assertion" is a line containing both a category keyword and
#      decision language (chose/selected/decided/adopted/etc.) -- this
#      keeps the check from firing on incidental mentions ("Postgres is
#      mentioned in the appendix") while still catching the real pattern
#      ("We chose PostgreSQL as our datastore because...").
#
# NOTE (ordering): check 2 runs BEFORE the pre-existing "no ADR-NNN
# references found -- skipping" early exit. A hard-choice assertion with
# ZERO ADR-NNN references anywhere is exactly the gap this check exists to
# catch -- if it hit the old early exit first, it would silently pass.
#
# Usage: validate-adrs.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-adrs"

ROOT="$(detect_project_root "${1:-}")"

ADR_DIR="$ROOT/docs/adrs"
[[ ! -d "$ADR_DIR" ]] && ADR_DIR="$ROOT/docs/architecture/decisions"

# -- hard-to-reverse choice categories (extensible) --------------------------
# "name|keyword-regex" -- keyword-regex is matched case-insensitively (grep -iE)
# against both the design doc and candidate ADR file content.
HARD_CHOICE_CATEGORIES=(
  "datastore|\b(datastore|database)\b"
  "auth-model|\bauth(entication)?[[:space:]]+(model|strategy|scheme)\b"
  "core-framework|\b(core|application|web)[[:space:]]+framework\b"
  "vendoring-strategy|\bvendor(ing|ed)?\b"
)
DECISION_VERBS_RE='\b(chose|choosing|chosen|select(ed)?|decided|decision|will use|using|adopt(ed|ing)?|opted for|going with|standardiz(e|ing)|migrat(e|ing|ed)[[:space:]]+to)\b'

# hard_choice_lines <file> <category-re> -- prints lines matching both the
# category keyword and decision-language regex (case-insensitive).
hard_choice_lines() {
  local file="$1" cat_re="$2"
  [[ -f "$file" ]] || return 0
  grep -iE "$cat_re" "$file" 2>/dev/null | grep -iE "$DECISION_VERBS_RE" || true
}

# doc_adr_refs <file> -- ADR-NNN tokens mentioned in this specific file, deduped.
doc_adr_refs() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  grep -oE 'ADR-[0-9]+' "$file" 2>/dev/null | sort -u || true
}

DESIGN_DOCS=("$ROOT/docs/ARCHITECTURE.md" "$ROOT/docs/TECH_STACK.md")
HARD_CHOICE_HITS=0

for doc in "${DESIGN_DOCS[@]}"; do
  [[ -f "$doc" ]] || continue
  doc_rel="${doc#"$ROOT"/}"
  refs="$(doc_adr_refs "$doc")"

  for entry in "${HARD_CHOICE_CATEGORIES[@]}"; do
    cat_name="${entry%%|*}"
    cat_re="${entry#*|}"
    lines="$(hard_choice_lines "$doc" "$cat_re")"
    [[ -z "$lines" ]] && continue

    HARD_CHOICE_HITS=$((HARD_CHOICE_HITS + 1))

    matched=""
    if [[ -n "$refs" ]]; then
      while IFS= read -r ref; do
        [[ -z "$ref" ]] && continue
        adr_file=$(find "$ADR_DIR" -type f -iname "${ref}*.md" 2>/dev/null | head -1)
        [[ -z "$adr_file" ]] && continue
        if grep -iqE "$cat_re" "$adr_file" 2>/dev/null; then
          matched="$adr_file"
          break
        fi
      done <<< "$refs"
    fi

    if [[ -n "$matched" ]]; then
      pass "$doc_rel: $cat_name decision backed by ${matched#"$ROOT"/}"
    else
      gap "missing-adr-for-hard-choice" "$doc_rel asserts a $cat_name decision (\"$(printf '%s' "$lines" | head -1 | sed -E 's/^[[:space:]]+//')\") but no referenced ADR (in docs/adrs/ or docs/architecture/decisions/) documents it -- hard-to-reverse choices need a recorded ADR (references/adr-template.md)"
    fi
  done
done

if [[ "$HARD_CHOICE_HITS" -eq 0 ]]; then
  note "no hard-to-reverse choice assertions (datastore/auth-model/core-framework/vendoring-strategy + decision language) found in ARCHITECTURE.md/TECH_STACK.md"
fi

# -- pre-existing check: every ADR-NNN mentioned in ARCHITECTURE.md or
# DECISION_LOG.md must have a file with a recognized status -------------------
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
  warn "no ADR-NNN references found in ARCHITECTURE.md or DECISION_LOG.md — skipping the file/status check"
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
