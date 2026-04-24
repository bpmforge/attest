#!/usr/bin/env bash
#
# validate-inventory.sh -- confirm every row in the onboard INVENTORY has a
# corresponding artifact file (sequence diagram, ERD entry, C3 diagram, etc.)
#
# Reads docs/onboard/INVENTORY.md and expects a table (or structured list) of
# rows with an ID and a category. Supported categories:
#
#   ROUTE      -- expect an API_DESIGN.md row containing the route id
#   TABLE      -- expect an ERD row (see validate-erd-coverage.sh)
#   SERVICE    -- expect a C3 diagram section in ARCHITECTURE.md
#   FLOW       -- expect a sequence diagram (see validate-sequence-coverage.sh)
#   ENTRY      -- expect a "Entry Point" section in ARCHITECTURE.md or ONBOARDING.md
#
# Expected row format in INVENTORY.md (markdown table):
#   | ID       | Category | Description      | Artifact           | Status |
#   | R-01     | ROUTE    | POST /api/login  | /api/login         | ⏳     |
#   | T-01     | TABLE    | users            | users              | ⏳     |
#
# Usage:
#   validate-inventory.sh [project-root]
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-inventory"

ROOT="$(detect_project_root "${1:-}")"
INVENTORY="$ROOT/docs/onboard/INVENTORY.md"
ARCH="$ROOT/docs/ARCHITECTURE.md"
API_DESIGN="$ROOT/docs/API_DESIGN.md"
ONBOARDING="$ROOT/docs/ONBOARDING.md"

if ! file_exists_nonempty "$INVENTORY"; then
  gap "missing-file" "docs/onboard/INVENTORY.md not found -- run /onboard-inventory first"
  validator_exit
fi

pass "found docs/onboard/INVENTORY.md ($(line_count "$INVENTORY") lines)"

# -- Parse inventory rows ---------------------------------------------------
# We accept any markdown table row with at least 4 pipe-separated cells where
# cell 2 is one of the known categories.
ROWS=$(mktemp -t "inv.XXXXXX")
trap 'rm -f "$ROWS"' EXIT

awk -F'|' '
  /^\|/ {
    id = $2; gsub(/^[ \t]+|[ \t]+$/, "", id)
    cat = $3; gsub(/^[ \t]+|[ \t]+$/, "", cat)
    desc = $4; gsub(/^[ \t]+|[ \t]+$/, "", desc)
    artifact = $5; gsub(/^[ \t]+|[ \t]+$/, "", artifact)
    # Skip header and separator rows
    if (id == "ID" || id ~ /^-+$/ || id == "") next
    if (cat !~ /^(ROUTE|TABLE|SERVICE|FLOW|ENTRY)$/) next
    printf "%s\t%s\t%s\t%s\n", id, cat, desc, artifact
  }
' "$INVENTORY" > "$ROWS"

ROW_COUNT=$(wc -l < "$ROWS" | tr -d ' ')
if [[ "$ROW_COUNT" -eq 0 ]]; then
  gap "empty-inventory" "INVENTORY.md has 0 parseable rows (expected markdown table with ID|Category|Description|Artifact|Status)"
  validator_exit
fi

pass "parsed $ROW_COUNT inventory row(s)"

# -- For each row, confirm an artifact exists -------------------------------
while IFS=$'\t' read -r id cat desc artifact; do
  [[ -z "$id" || -z "$cat" ]] && continue

  case "$cat" in
    ROUTE)
      if [[ ! -f "$API_DESIGN" ]]; then
        gap "no-api-design" "$id ($cat: $desc) -- docs/API_DESIGN.md does not exist"
      elif ! grep -qF "$artifact" "$API_DESIGN" 2>/dev/null && ! grep -qF "$desc" "$API_DESIGN" 2>/dev/null; then
        gap "uncovered-route" "$id ($cat: $desc) -- not found in docs/API_DESIGN.md"
      fi
      ;;
    TABLE)
      if [[ ! -f "$ARCH" && ! -f "$ROOT/docs/DATABASE.md" ]]; then
        gap "no-erd-source" "$id ($cat: $desc) -- no ARCHITECTURE.md or DATABASE.md"
      else
        found=0
        for src in "$ARCH" "$ROOT/docs/DATABASE.md"; do
          [[ -f "$src" ]] && grep -qiE "\b${artifact}\b" "$src" 2>/dev/null && found=1 && break
        done
        [[ "$found" -eq 0 ]] && gap "uncovered-table" "$id ($cat: $desc) -- '$artifact' not in any ERD source"
      fi
      ;;
    SERVICE)
      if [[ ! -f "$ARCH" ]]; then
        gap "no-architecture" "$id ($cat: $desc) -- no ARCHITECTURE.md"
      elif ! grep -qiE "\b${desc}\b|\b${artifact}\b" "$ARCH" 2>/dev/null; then
        gap "uncovered-service" "$id ($cat: $desc) -- no matching C3/service section in ARCHITECTURE.md"
      fi
      ;;
    FLOW)
      # Defer to sequence-coverage validator logic -- just check mention
      if [[ ! -f "$ARCH" ]] && [[ ! -d "$ROOT/docs/sequences" ]]; then
        gap "no-flow-source" "$id ($cat: $desc) -- no ARCHITECTURE.md or docs/sequences/"
      else
        found=0
        # Accept any of: inventory ID, full desc, or UC-NN substring inside desc.
        # Full-desc match fails when ARCHITECTURE uses "Login (UC-01)" but
        # inventory desc is "UC-01 user login" -- extract the UC-NN stem.
        uc_stem=$(printf '%s' "$desc" | grep -oE '(UC|FL|SC)-[0-9]+' | head -1)
        [[ -f "$ARCH" ]] && grep -qiE "\b${id}\b|\b${desc}\b" "$ARCH" 2>/dev/null && found=1
        if [[ "$found" -eq 0 && -f "$ARCH" && -n "$uc_stem" ]]; then
          grep -qE "\b${uc_stem}\b" "$ARCH" 2>/dev/null && found=1
        fi
        if [[ "$found" -eq 0 && -d "$ROOT/docs/sequences" ]]; then
          find "$ROOT/docs/sequences" -type f -name "*${id}*" 2>/dev/null | head -1 | grep -q . && found=1
          if [[ "$found" -eq 0 && -n "$uc_stem" ]]; then
            find "$ROOT/docs/sequences" -type f -name "*${uc_stem}*" 2>/dev/null | head -1 | grep -q . && found=1
          fi
        fi
        [[ "$found" -eq 0 ]] && gap "uncovered-flow" "$id ($cat: $desc) -- no sequence diagram mentioning it"
      fi
      ;;
    ENTRY)
      found=0
      for src in "$ARCH" "$ONBOARDING"; do
        [[ -f "$src" ]] && grep -qiE "\b${desc}\b|\b${artifact}\b" "$src" 2>/dev/null && found=1 && break
      done
      [[ "$found" -eq 0 ]] && gap "uncovered-entry" "$id ($cat: $desc) -- no mention in ARCHITECTURE.md or ONBOARDING.md"
      ;;
  esac
done < "$ROWS"

validator_exit
