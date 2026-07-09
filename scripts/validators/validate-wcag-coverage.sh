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
#   interactive   -- (T22.6) re-derive the interactive-element inventory from
#                    component source (buttons, links, inputs, selects,
#                    onClick/role="button" handlers) and require every audit
#                    that exists to actually mention each one -- "an a11y
#                    audit exists" and "the a11y audit covers what's on
#                    screen" are different claims; this checks the second
#                    against a real ground-truth denominator instead of just
#                    the first. Only runs once at least one audit exists (a
#                    project with no audit yet already gets the skip/warn
#                    below -- this isn't a second way to demand one).
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

# 3. Interactive-element inventory as the a11y denominator (T22.6).
#    Ground truth = every interactive element pattern found in component
#    source (buttons, links, inputs/selects/textareas, click/keydown
#    handlers, explicit interactive ARIA roles). "Covered" = the component
#    file it lives in is mentioned by name in at least one audit report --
#    doc-level and grep-based, same charter as the rest of this validator,
#    just checked against a real denominator instead of a bare existence
#    check. Only runs when at least one audit exists; a project with none
#    yet is already handled by the warn above.
if [[ -s "$AUDIT_LIST_FILE" ]]; then
  COMP_DIR=""
  for candidate_dir in "src/components/ui" "src/components" "src/ui" "components/ui" "app/components"; do
    if [[ -d "$ROOT/$candidate_dir" ]]; then
      COMP_DIR="$ROOT/$candidate_dir"
      break
    fi
  done

  if [[ -z "$COMP_DIR" ]]; then
    note "no component source directory found (checked src/components/ui, src/components, src/ui, components/ui, app/components) -- interactive-element inventory check skipped"
  else
    INTERACTIVE_FILES="$(mktemp -t "validate-wcag.interactive.XXXXXX")"
    find "$COMP_DIR" -maxdepth 3 -type f \
      \( -name "*.tsx" -o -name "*.jsx" -o -name "*.vue" -o -name "*.svelte" \) \
      2>/dev/null > "$INTERACTIVE_FILES" || true

    INTERACTIVE_NAMES="$(mktemp -t "validate-wcag.interactive-names.XXXXXX")"
    while IFS= read -r comp_file; do
      [[ -n "$comp_file" ]] || continue
      if grep -qiE '(<button|<a[[:space:]]|<input|<select|<textarea|onclick=|onkeydown=|role=["'"'"'](button|link|checkbox|switch|tab|menuitem))' "$comp_file" 2>/dev/null; then
        basename "$comp_file" | sed -E 's/\.(tsx|jsx|vue|svelte)$//' >> "$INTERACTIVE_NAMES"
      fi
    done < "$INTERACTIVE_FILES"
    sort -u "$INTERACTIVE_NAMES" -o "$INTERACTIVE_NAMES"

    INTERACTIVE_COUNT=$(wc -l < "$INTERACTIVE_NAMES" | tr -d ' ')
    if [[ "$INTERACTIVE_COUNT" -eq 0 ]]; then
      note "no interactive elements discovered in $COMP_DIR -- interactive-element inventory check skipped"
    else
      # Concatenate all audit content once for the coverage check.
      AUDIT_CONTENT="$(mktemp -t "validate-wcag.audit-content.XXXXXX")"
      while IFS= read -r audit; do
        [[ -n "$audit" ]] || continue
        cat "$audit" >> "$AUDIT_CONTENT" 2>/dev/null || true
      done < "$AUDIT_LIST_FILE"

      covered=0
      while IFS= read -r elem; do
        [[ -n "$elem" ]] || continue
        if grep -qiF "$elem" "$AUDIT_CONTENT" 2>/dev/null; then
          covered=$((covered + 1))
        else
          gap "uncovered-interactive-element" "interactive component '$elem' (in $COMP_DIR) is not mentioned in any docs/reviews/A11Y_AUDIT_*.md -- the audit does not demonstrably cover it"
        fi
      done < "$INTERACTIVE_NAMES"

      if [[ "$covered" -eq "$INTERACTIVE_COUNT" ]]; then
        pass "interactive-element inventory: all $INTERACTIVE_COUNT/$INTERACTIVE_COUNT covered by an audit"
      else
        note "interactive-element inventory: $covered/$INTERACTIVE_COUNT covered by an audit"
      fi
      rm -f "$AUDIT_CONTENT"
    fi
    rm -f "$INTERACTIVE_FILES" "$INTERACTIVE_NAMES"
  fi
fi

cleanup_tmp
validator_exit
