#!/usr/bin/env bash
#
# validate-use-cases.sh -- every row in docs/USE_CASES.md (or docs/testing/USE_CASES.md)
# must be a complete record:
#   - ID present (UC-NN format)
#   - Persona non-empty
#   - Trigger non-empty
#   - Main flow non-empty
#   - Success criteria non-empty
#   - Priority is P0, P1, or P2 (case-insensitive)
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-use-cases"

ROOT="$(detect_project_root "${1:-}")"

UC=""
for f in "$ROOT/docs/USE_CASES.md" "$ROOT/docs/testing/USE_CASES.md"; do
  [[ -f "$f" ]] && UC="$f" && break
done

if [[ -z "$UC" ]]; then
  warn "no USE_CASES.md found — skipping (Mode 2 onboard may not have produced one yet)"
  validator_exit
fi

# Look for table rows. Use the markdown table format with at least 6 columns:
# | ID | Persona | Trigger | Main flow | Success criteria | Priority | (optional cols)
# Or paragraph-style sections with required headings under each ## UC-NN heading.

# Try table form first
TABLE_ROWS=$(grep -E '^\|[[:space:]]*UC-[0-9]+' "$UC" || true)
TABLE_ROW_COUNT=$(printf '%s\n' "$TABLE_ROWS" | grep -c . || true)

# Try section form
SECTION_HEADINGS=$(grep -E '^##[[:space:]]+UC-[0-9]+' "$UC" || true)
SECTION_COUNT=$(printf '%s\n' "$SECTION_HEADINGS" | grep -c . || true)

if [[ "$TABLE_ROW_COUNT" -eq 0 && "$SECTION_COUNT" -eq 0 ]]; then
  gap "no-use-cases" "USE_CASES.md has no recognizable use case rows (expected '| UC-NN | ...' table or '## UC-NN' section headings)"
  validator_exit
fi

pass "found $TABLE_ROW_COUNT table row(s) + $SECTION_COUNT section(s)"

# Validate table-form rows
if [[ "$TABLE_ROW_COUNT" -gt 0 ]]; then
  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    # Split on |, trim each cell
    IFS='|' read -ra CELLS <<< "$row"
    # Cells indexes: 0 = leading empty, 1..N = data
    id=$(echo "${CELLS[1]:-}" | sed 's/^ *//;s/ *$//')
    persona=$(echo "${CELLS[2]:-}" | sed 's/^ *//;s/ *$//')
    trigger=$(echo "${CELLS[3]:-}" | sed 's/^ *//;s/ *$//')
    flow=$(echo "${CELLS[4]:-}" | sed 's/^ *//;s/ *$//')
    success=$(echo "${CELLS[5]:-}" | sed 's/^ *//;s/ *$//')
    priority=$(echo "${CELLS[6]:-}" | sed 's/^ *//;s/ *$//')

    [[ -z "$persona" || "$persona" == "TBD" || "$persona" == "TODO" ]] && gap "incomplete-uc" "$id: missing persona"
    [[ -z "$trigger" || "$trigger" == "TBD" || "$trigger" == "TODO" ]] && gap "incomplete-uc" "$id: missing trigger"
    [[ -z "$flow" || "$flow" == "TBD" || "$flow" == "TODO" ]] && gap "incomplete-uc" "$id: missing main flow"
    [[ -z "$success" || "$success" == "TBD" || "$success" == "TODO" ]] && gap "incomplete-uc" "$id: missing success criteria"
    if ! [[ "$priority" =~ ^[Pp][012]$ ]]; then
      gap "invalid-priority" "$id: priority='$priority' (expected P0, P1, or P2)"
    fi
  done <<< "$TABLE_ROWS"
fi

# Validate section-form: each ## UC-NN must be followed by required subheadings within 50 lines
if [[ "$SECTION_COUNT" -gt 0 ]]; then
  # Process substitution, NOT a pipe: `cmd | while read; do gap ...; done`
  # runs the loop in a subshell, silently losing gap()'s GAP_COUNT increment
  # -- the same bug class as the missing-source loop below, found by
  # independent review in the same file (T22.5) after the missing-source
  # loop had already been fixed; this sibling loop was missed the first pass.
  while IFS=$'\t' read -r id key; do
    [[ -n "$id" ]] && gap "incomplete-uc-section" "$id: missing $key heading"
  done < <(awk '
    /^## UC-[0-9]+/ {
      if (current_id) {
        for (key in required) {
          if (!(key in seen)) {
            print current_id "\t" key
          }
        }
      }
      delete seen
      current_id = $0
      sub(/^## /, "", current_id)
      sub(/[[:space:]].*/, "", current_id)
      required["persona"] = 1
      required["trigger"] = 1
      required["main"] = 1
      required["success"] = 1
      required["priority"] = 1
      next
    }
    /[Pp]ersona[[:space:]]*:/ { seen["persona"] = 1 }
    /[Tt]rigger[[:space:]]*:/ { seen["trigger"] = 1 }
    /[Mm]ain[[:space:]]+[Ff]low/ { seen["main"] = 1 }
    /[Ss]uccess[[:space:]]+[Cc]riteria/ { seen["success"] = 1 }
    /[Pp]riority[[:space:]]*:[[:space:]]*[Pp][012]/ { seen["priority"] = 1 }
    END {
      if (current_id) {
        for (key in required) {
          if (!(key in seen)) {
            print current_id "\t" key
          }
        }
      }
    }
  ' "$UC")
fi

# -- Traceability check: each use case should have a Source: field or
#    reference a persona/scope/risk/constraint/vision-goal ID
if [[ "$TABLE_ROW_COUNT" -gt 0 ]]; then
  source_refs=$(grep -cE '(FR-[0-9]+|SC-[0-9]+|RK-[0-9]+|CN-[0-9]+|Persona|SCOPE|RISK|CONSTRAINT)' "$UC" || true)
  if [[ "${source_refs:-0}" -eq 0 ]]; then
    gap "missing-traceability" "USE_CASES.md has no Source/Trace references back to FR-NN, SC-NN, RK-NN, or persona IDs — add traceability to SRS/SCOPE/RISKS artifacts"
  else
    pass "traceability references found ($source_refs)"
  fi
fi

if [[ "$SECTION_COUNT" -gt 0 ]]; then
  # Process substitution, NOT a pipe: `cmd | while read; do gap ...; done`
  # runs the loop in a subshell, silently losing gap()'s GAP_COUNT increment
  # (the parent shell still reports exit 0 even though a real gap was
  # written to the gap file and shown in the JSON `items` array).
  while IFS= read -r id; do
    [[ -n "$id" ]] && gap "missing-source" "$id: no Source: or traceability reference (add 'Source: FR-NN / SC-NN / RK-NN')"
  done < <(awk '
    /^## UC-[0-9]+/ {
      if (current_id && !has_source) print current_id
      current_id = $0; sub(/^## /, "", current_id); sub(/[[:space:]].*/, "", current_id)
      has_source = 0; next
    }
    /[Ss]ource[[:space:]]*:/ { has_source = 1 }
    /[Tt]race[[:space:]]*:/ { has_source = 1 }
    /FR-[0-9]+/ { has_source = 1 }
    END { if (current_id && !has_source) print current_id }
  ' "$UC")
fi

# -- REQUIREMENTS_MATRIX.md check (if present, validate it is non-empty)
MATRIX="$ROOT/docs/work/REQUIREMENTS_MATRIX.md"
if [[ -f "$MATRIX" ]]; then
  if ! file_exists_nonempty "$MATRIX"; then
    gap "empty-matrix" "docs/work/REQUIREMENTS_MATRIX.md exists but is empty"
  else
    pass "REQUIREMENTS_MATRIX.md present and non-empty"
  fi
fi

validator_exit
