#!/usr/bin/env bash
#
# validate-use-cases.sh -- every use case in docs/USE_CASES.md (or
# docs/testing/USE_CASES.md) must be a complete record:
#   - ID present (UC-NN format)
#   - Persona non-empty
#   - Trigger non-empty
#   - Main flow non-empty
#   - Success criteria non-empty
#   - Priority is P0, P1, or P2 (case-insensitive)
#
# A record may be supplied EITHER as a table row OR as a `## UC-NN` section
# (any heading depth). A document may legitimately carry a short index table
# plus per-use-case detail sections -- that combination is valid, and each
# field is satisfied by whichever form provides it.
#
# Table columns are located BY HEADER NAME, never by position. An earlier
# version indexed fixed offsets (CELLS[5]=success, CELLS[6]=priority), which
# meant a differently-shaped table reported every row as "missing success
# criteria" while silently accepting whatever happened to sit in columns 2-4
# -- a story ID passed as a persona. Worse, the message named the wrong fault:
# the content was present, just not where the parser looked, so each repair
# attempt added more prose and the gate failed identically forever. When a
# column is genuinely absent, this reports it ONCE, naming the headers it did
# find, instead of once per row.

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

# ── Locate use-case rows together with THEIR OWN table's header row ──────────
# A file may hold several tables; each row is paired with the header of the
# table it actually belongs to (the line above that table's `|---|` separator).
UC_ROWS_WITH_HEADER=$(awk '
  {
    if ($0 ~ /^[[:space:]]*\|[[:space:]]*:?-{2,}/)      { header = prev }
    else if ($0 ~ /^[[:space:]]*\|[[:space:]]*UC-[0-9]+/) { print header "\t" $0 }
    prev = $0
  }
' "$UC")

TABLE_ROW_COUNT=$(printf '%s\n' "$UC_ROWS_WITH_HEADER" | grep -c . || true)

# Sections at ANY depth: `## UC-01`, `### UC-001 — Title`, etc. Requiring
# exactly `##` made every nested catalog (use cases grouped under a persona
# heading) invisible, so the section path silently never ran.
SECTION_COUNT=$(grep -cE '^#{2,}[[:space:]]+UC-[0-9]+' "$UC" || true)

if [[ "$TABLE_ROW_COUNT" -eq 0 && "$SECTION_COUNT" -eq 0 ]]; then
  gap "no-use-cases" "USE_CASES.md has no recognizable use cases (expected '| UC-NN | ...' table rows or '## UC-NN' section headings, any heading depth)"
  validator_exit
fi

pass "found $TABLE_ROW_COUNT table row(s) + $SECTION_COUNT section(s)"

# ── Which fields do the detail sections already supply? ─────────────────────
# Emphasis is stripped before matching so `**Priority:** P0` reads the same as
# `Priority: P0`; markdown bold is normal authoring, not a defect.
SECTION_FIELDS=""
if [[ "$SECTION_COUNT" -gt 0 ]]; then
  SECTION_FIELDS=$(awk '
    { line = $0; gsub(/[*_`]+/, "", line) }
    line ~ /[Pp]ersona[[:space:]]*:/                       { f["persona"]  = 1 }
    line ~ /[Tt]rigger[[:space:]]*:/                       { f["trigger"]  = 1 }
    line ~ /[Mm]ain[[:space:]]+[Ff]low|[Ff]low[[:space:]]*:|[Ss]teps[[:space:]]*:/ { f["flow"] = 1 }
    line ~ /[Ss]uccess[[:space:]]*[Cc]riteria/             { f["success"]  = 1 }
    line ~ /[Pp]riority[[:space:]]*:[[:space:]]*[Pp][012]/ { f["priority"] = 1 }
    END { for (k in f) printf "%s ", k }
  ' "$UC")
fi

section_supplies() { [[ " $SECTION_FIELDS " == *" $1 "* ]]; }

# ── Table form: map columns by header name ──────────────────────────────────
if [[ "$TABLE_ROW_COUNT" -gt 0 ]]; then
  HEADER_LINE=$(printf '%s\n' "$UC_ROWS_WITH_HEADER" | head -n 1 | cut -f1)

  # Build name→index map from the header cells.
  idx_id=-1; idx_persona=-1; idx_trigger=-1; idx_flow=-1; idx_success=-1; idx_priority=-1
  IFS='|' read -ra HCELLS <<< "$HEADER_LINE"
  for i in "${!HCELLS[@]}"; do
    h=$(printf '%s' "${HCELLS[$i]}" | sed 's/[*_`]//g; s/^ *//; s/ *$//')
    [[ -z "$h" ]] && continue
    shopt -s nocasematch
    if   [[ "$h" =~ ^(id|uc|use[[:space:]-]?case)$ ]];        then idx_id=$i
    elif [[ "$h" =~ (persona|actor) ]];                        then idx_persona=$i
    elif [[ "$h" =~ trigger ]];                                then idx_trigger=$i
    elif [[ "$h" =~ (main[[:space:]]*flow|^flow$|steps) ]];    then idx_flow=$i
    elif [[ "$h" =~ success ]];                                then idx_success=$i
    elif [[ "$h" =~ priority ]];                               then idx_priority=$i
    fi
    shopt -u nocasematch
  done

  HEADERS_FOUND=$(printf '%s' "$HEADER_LINE" | sed 's/^[[:space:]]*|//; s/|[[:space:]]*$//; s/[[:space:]]*|[[:space:]]*/, /g; s/^[[:space:]]*//; s/[[:space:]]*$//')

  # A column that is absent from the header AND not supplied by sections is a
  # single structural gap, reported once with the fix -- not N per-row gaps
  # claiming content is "missing" when it was never being read.
  for field in persona trigger flow success priority; do
    eval "col=\$idx_$field"
    if [[ "$col" -lt 0 ]] && ! section_supplies "$field"; then
      case "$field" in
        flow)    want="Main flow" ;;
        success) want="Success criteria" ;;
        *)       want="$(tr '[:lower:]' '[:upper:]' <<< "${field:0:1}")${field:1}" ;;
      esac
      gap "missing-uc-column" "USE_CASES.md: no '${want}' column in the use-case table and no '${want}:' line in the UC sections — - table headers found: [${HEADERS_FOUND}]. Add a '${want}' column, or give each '## UC-NN' section a '${want}:' line."
    fi
  done

  while IFS=$'\t' read -r _hdr row; do
    [[ -z "$row" ]] && continue
    IFS='|' read -ra CELLS <<< "$row"
    cell() { local n="$1"; [[ "$n" -lt 0 ]] && return 0; printf '%s' "${CELLS[$n]:-}" | sed 's/^ *//; s/ *$//'; }

    id=$(cell "$idx_id"); [[ -z "$id" ]] && id=$(printf '%s' "$row" | grep -oE 'UC-[0-9]+' | head -1)

    # Only judge a field when THIS table actually carries it. If the column is
    # absent the structural gap above already said so; the sections may supply
    # it, and re-reporting per row is what made this validator unactionable.
    for field in persona trigger flow success; do
      eval "col=\$idx_$field"
      [[ "$col" -lt 0 ]] && continue
      val=$(cell "$col")
      if [[ -z "$val" || "$val" == "TBD" || "$val" == "TODO" ]]; then
        case "$field" in
          flow)    label="main flow" ;;
          success) label="success criteria" ;;
          *)       label="$field" ;;
        esac
        gap "incomplete-uc" "$id: missing $label"
      fi
    done

    if [[ "$idx_priority" -ge 0 ]]; then
      priority=$(cell "$idx_priority")
      if ! [[ "$priority" =~ ^[Pp][012]$ ]]; then
        gap "invalid-priority" "$id: priority='$priority' (expected P0, P1, or P2)"
      fi
    fi
  done <<< "$UC_ROWS_WITH_HEADER"
fi

# ── Section form: each ## UC-NN (any depth) needs the required fields ────────
if [[ "$SECTION_COUNT" -gt 0 ]]; then
  # Process substitution, NOT a pipe: `cmd | while read; do gap ...; done`
  # runs the loop in a subshell, silently losing gap()'s GAP_COUNT increment
  # -- the same bug class as the missing-source loop below, found by
  # independent review in the same file (T22.5) after the missing-source
  # loop had already been fixed; this sibling loop was missed the first pass.
  while IFS=$'\t' read -r id key; do
    [[ -n "$id" ]] && gap "incomplete-uc-section" "$id: missing $key heading"
  done < <(awk '
    { line = $0; gsub(/[*_`]+/, "", line) }
    /^#{2,}[[:space:]]+UC-[0-9]+/ {
      if (current_id) {
        for (key in required) {
          if (!(key in seen)) {
            print current_id "\t" key
          }
        }
      }
      delete seen
      current_id = line
      sub(/^#+[[:space:]]*/, "", current_id)
      sub(/[[:space:]].*/, "", current_id)
      required["persona"] = 1
      required["trigger"] = 1
      required["main"] = 1
      required["success"] = 1
      required["priority"] = 1
      next
    }
    line ~ /[Pp]ersona[[:space:]]*:/ { seen["persona"] = 1 }
    line ~ /[Tt]rigger[[:space:]]*:/ { seen["trigger"] = 1 }
    line ~ /[Mm]ain[[:space:]]+[Ff]low|[Ff]low[[:space:]]*:|[Ss]teps[[:space:]]*:/ { seen["main"] = 1 }
    line ~ /[Ss]uccess[[:space:]]*[Cc]riteria/ { seen["success"] = 1 }
    line ~ /[Pp]riority[[:space:]]*:[[:space:]]*[Pp][012]/ { seen["priority"] = 1 }
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
    { line = $0; gsub(/[*_`]+/, "", line) }
    /^#{2,}[[:space:]]+UC-[0-9]+/ {
      if (current_id && !has_source) print current_id
      current_id = line; sub(/^#+[[:space:]]*/, "", current_id); sub(/[[:space:]].*/, "", current_id)
      has_source = 0; next
    }
    line ~ /[Ss]ource[[:space:]]*:/ { has_source = 1 }
    line ~ /[Tt]race[[:space:]]*:/  { has_source = 1 }
    line ~ /FR-[0-9]+/              { has_source = 1 }
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
