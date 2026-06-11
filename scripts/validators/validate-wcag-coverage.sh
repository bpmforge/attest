#!/usr/bin/env bash
#
# validate-wcag-coverage.sh -- accessibility evidence must exist for UI-bearing
# projects, and blocker findings must be defensible (doc-level, grep-based).
#
#   spec-a11y     -- if docs/design/UX_SPEC.md exists it must mention
#                    accessibility/WCAG/a11y; if docs/design/ exists with no
#                    a11y mention in ANY design doc -> gap
#   blocker-cite  -- every "blocker" finding row in docs/reviews/A11Y_AUDIT_*.md
#                    must cite a WCAG criterion number (N.N.N, e.g. 1.4.3) AND
#                    a file:line citation -> one gap per violation
#   skip          -- neither docs/design/ nor an A11Y_AUDIT exists -> warn
#                    "no UI artifacts -- skipping" and exit 0
#
# Exit: 0 = clean or skipped / 1 = gaps / 2 = invocation error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-wcag-coverage"

ROOT="$(detect_project_root "${1:-}")"

DESIGN_DIR="$ROOT/docs/design"
UX_SPEC="$DESIGN_DIR/UX_SPEC.md"

# Collect audit reports into a temp file (avoids command substitution over
# content and word-splitting on paths with spaces).
AUDIT_LIST_FILE="$(mktemp -t "validate-wcag.audits.XXXXXX")"
find "$ROOT/docs/reviews" -type f -name "A11Y_AUDIT_*.md" 2>/dev/null \
  > "$AUDIT_LIST_FILE" || true

cleanup_tmp() { rm -f "$AUDIT_LIST_FILE"; }

# 0. No UI evidence at all -> not a UI-bearing project (yet); skip cleanly.
if [[ ! -d "$DESIGN_DIR" && ! -s "$AUDIT_LIST_FILE" ]]; then
  warn "no UI artifacts -- skipping (no docs/design/ and no docs/reviews/A11Y_AUDIT_*.md)"
  cleanup_tmp
  validator_exit
fi

# 1. Design spec must carry an accessibility position.
if [[ -d "$DESIGN_DIR" ]]; then
  if file_exists_nonempty "$UX_SPEC"; then
    if grep -qiE '(accessib|wcag|a11y)' "$UX_SPEC"; then
      pass "docs/design/UX_SPEC.md mentions accessibility"
    else
      gap "spec-no-a11y" "docs/design/UX_SPEC.md: no accessibility/WCAG mention -- specify focus styles, contrast tokens, target sizes (run /a11y --spec)"
    fi
  else
    note "docs/design/ exists but no UX_SPEC.md -- checking all design docs"
    if grep -rqiE '(accessib|wcag|a11y)' "$DESIGN_DIR" 2>/dev/null; then
      pass "docs/design/ has an accessibility mention"
    else
      gap "design-no-a11y" "docs/design/ exists but no design doc mentions accessibility/WCAG -- a11y was never considered at design time (run /a11y --spec)"
    fi
  fi
fi

# 2. Every blocker row in every audit must cite criterion + file:line.
#    Blocker rows = markdown table rows with BLOCKER as a whole cell (avoids
#    matching prose that merely mentions the word).
while IFS= read -r audit; do
  [[ -n "$audit" ]] || continue
  rel="${audit#"$ROOT/"}"
  note "Checking: $rel"

  ROWS_FILE="$(mktemp -t "validate-wcag.rows.XXXXXX")"
  grep -niE '^\|.*\|[[:space:]]*blocker[[:space:]]*\|' "$audit" > "$ROWS_FILE" 2>/dev/null || true

  if [[ ! -s "$ROWS_FILE" ]]; then
    pass "$rel: no blocker rows"
    rm -f "$ROWS_FILE"
    continue
  fi

  while IFS= read -r row; do
    [[ -n "$row" ]] || continue
    lineno="${row%%:*}"
    body="${row#*:}"

    if ! printf '%s\n' "$body" | grep -qE '[0-9]\.[0-9]+\.[0-9]+'; then
      gap "blocker-no-criterion" "$rel:$lineno: blocker row has no WCAG criterion number (expected N.N.N + level, e.g. 1.4.3 AA)"
    fi

    if ! printf '%s\n' "$body" | grep -qE '[A-Za-z0-9_/.-]+\.[A-Za-z]+:[0-9]+'; then
      gap "blocker-no-file" "$rel:$lineno: blocker row has no file:line citation -- findings without locations are not actionable"
    fi
  done < "$ROWS_FILE"
  rm -f "$ROWS_FILE"
done < "$AUDIT_LIST_FILE"

if [[ ! -s "$AUDIT_LIST_FILE" ]]; then
  warn "no docs/reviews/A11Y_AUDIT_*.md found -- design exists but the UI was never audited (run /a11y after implementation)"
fi

cleanup_tmp
validator_exit
