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

# -- Second pass: re-derive ROUTE/TABLE/SERVICE from source and diff vs -----
# INVENTORY.md (T22.6). The first pass above only proves that every row
# ALREADY IN INVENTORY.md has a matching artifact -- it says nothing about
# whether INVENTORY.md itself is complete. An inventory that quietly omits a
# route, table, or service is invisible to a check that only ever walks
# rows that exist. This second pass re-derives the same three ground-truth
# sets validate-api-coverage.sh (routes), validate-erd-coverage.sh (tables),
# and validate-c3-coverage.sh (top-level src/ subdirs as services) already
# derive from source, and flags anything discovered there but absent from
# INVENTORY.md.
SRC_DIRS=()
for d in src app routes api server internal pkg; do
  [[ -d "$ROOT/$d" ]] && SRC_DIRS+=("$ROOT/$d")
done

if [[ "${#SRC_DIRS[@]}" -eq 0 ]]; then
  note "no standard source directories found (src, app, routes, api, server, internal, pkg) -- second-pass source re-derivation skipped"
else
  # -- ROUTE (same discovery as validate-api-coverage.sh) --
  DERIVED_ROUTES="$(mktemp -t "inv-routes.XXXXXX")"
  grep -rEoh --include='*.ts' --include='*.js' --include='*.mjs' \
    '(app|router|fastify|server)\.(get|post|put|patch|delete|head|options)\(["'"'"'][^"'"'"']+["'"'"']' \
    "${SRC_DIRS[@]}" 2>/dev/null | \
    sed -E 's/.*\.(get|post|put|patch|delete|head|options)\(["'"'"']([^"'"'"']+).*/\2/' \
    >> "$DERIVED_ROUTES" || true
  grep -rEoh --include='*.py' \
    '@(app|router|bp|blueprint)\.(get|post|put|patch|delete|head|options)\(["'"'"'][^"'"'"']+["'"'"']' \
    "${SRC_DIRS[@]}" 2>/dev/null | \
    sed -E 's/.*\.(get|post|put|patch|delete|head|options)\(["'"'"']([^"'"'"']+).*/\2/' \
    >> "$DERIVED_ROUTES" || true
  sort -u "$DERIVED_ROUTES" -o "$DERIVED_ROUTES"

  ROUTE_COUNT2=$(wc -l < "$DERIVED_ROUTES" | tr -d ' ')
  if [[ "$ROUTE_COUNT2" -eq 0 ]]; then
    note "no routes discovered in source -- second-pass ROUTE re-derivation skipped"
  else
    ROUTE_ROWS=$(awk -F'\t' '$2=="ROUTE"{print $3"\t"$4}' "$ROWS")
    while IFS= read -r route; do
      [[ -z "$route" ]] && continue
      if ! printf '%s\n' "$ROUTE_ROWS" | grep -qF "$route"; then
        gap "inventory-missing-route" "route '$route' discovered in source but not present in any ROUTE row of INVENTORY.md"
      fi
    done < "$DERIVED_ROUTES"
  fi
  rm -f "$DERIVED_ROUTES"

  # -- TABLE (same discovery as validate-erd-coverage.sh) --
  DERIVED_TABLES="$(mktemp -t "inv-tables.XXXXXX")"
  grep -rEoh --include='*.prisma' '^model[[:space:]]+[A-Za-z_][A-Za-z0-9_]+' \
    "${SRC_DIRS[@]}" 2>/dev/null | awk '{print $2}' >> "$DERIVED_TABLES" || true
  grep -rEoh --include='*.py' \
    "__tablename__[[:space:]]*=[[:space:]]*['\"][A-Za-z0-9_]+['\"]" \
    "${SRC_DIRS[@]}" 2>/dev/null | \
    sed -E "s/.*['\"]([A-Za-z0-9_]+).*/\1/" >> "$DERIVED_TABLES" || true
  grep -rEoh --include='*.sql' --include='*.ts' --include='*.js' -i \
    'CREATE[[:space:]]+TABLE([[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS)?[[:space:]]+[A-Za-z_][A-Za-z0-9_]+' \
    "${SRC_DIRS[@]}" 2>/dev/null | \
    sed -E 's/.*CREATE[[:space:]]+TABLE([[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS)?[[:space:]]+([A-Za-z0-9_]+).*/\2/i' \
    >> "$DERIVED_TABLES" || true
  awk '{ print tolower($0) }' "$DERIVED_TABLES" | sort -u > "${DERIVED_TABLES}.sorted"
  mv "${DERIVED_TABLES}.sorted" "$DERIVED_TABLES"

  TABLE_COUNT2=$(wc -l < "$DERIVED_TABLES" | tr -d ' ')
  if [[ "$TABLE_COUNT2" -eq 0 ]]; then
    note "no tables/models discovered in source -- second-pass TABLE re-derivation skipped"
  else
    TABLE_ROWS=$(awk -F'\t' '$2=="TABLE"{print tolower($3) "\t" tolower($4)}' "$ROWS")
    while IFS= read -r table; do
      [[ -z "$table" ]] && continue
      if ! printf '%s\n' "$TABLE_ROWS" | grep -qF "$table"; then
        gap "inventory-missing-table" "table '$table' discovered in source but not present in any TABLE row of INVENTORY.md"
      fi
    done < "$DERIVED_TABLES"
  fi
  rm -f "$DERIVED_TABLES"

  # -- SERVICE (same discovery as validate-c3-coverage.sh: top-level src/
  #    subdirs, checked in the same directory-name priority order) --
  # Known limitation (independent review, T22.6): top-level-subdirs-only is
  # the right granularity for a flat layout, but on a project that nests
  # services one level deeper (e.g. src/modules/orders, src/modules/users)
  # it derives "modules" as the one service, not "orders"/"users" -- a
  # false positive against an INVENTORY.md that correctly documents the
  # nested names. This is not a new invention: it deliberately matches
  # validate-c3-coverage.sh's existing convention rather than diverging.
  # Disclosed as a follow-up candidate, not fixed here (scope discipline).
  SRC_ROOT=""
  for candidate in src app server internal pkg packages services modules; do
    if [[ -d "$ROOT/$candidate" ]]; then
      SRC_ROOT="$ROOT/$candidate"
      break
    fi
  done

  if [[ -z "$SRC_ROOT" ]]; then
    note "no source directory found (src, app, server, internal, pkg, packages, services, modules) -- second-pass SERVICE re-derivation skipped"
  else
    DERIVED_SERVICES="$(mktemp -t "inv-services.XXXXXX")"
    { find "$SRC_ROOT" -mindepth 1 -maxdepth 1 -type d \
      -not -name 'node_modules' -not -name '__tests__' -not -name '__mocks__' \
      -not -name '.cache' 2>/dev/null || true; } \
      | while IFS= read -r d; do basename "$d"; done \
      | sort -u > "$DERIVED_SERVICES"

    SERVICE_COUNT2=$(wc -l < "$DERIVED_SERVICES" | tr -d ' ')
    if [[ "$SERVICE_COUNT2" -eq 0 ]]; then
      note "no subdirectories under $SRC_ROOT -- second-pass SERVICE re-derivation skipped"
    else
      SERVICE_ROWS=$(awk -F'\t' '$2=="SERVICE"{print tolower($3) "\t" tolower($4)}' "$ROWS")
      while IFS= read -r svc; do
        [[ -z "$svc" ]] && continue
        svc_lc=$(printf '%s' "$svc" | tr '[:upper:]' '[:lower:]')
        if ! printf '%s\n' "$SERVICE_ROWS" | grep -qF "$svc_lc"; then
          gap "inventory-missing-service" "service/module '$svc' discovered in source ($SRC_ROOT) but not present in any SERVICE row of INVENTORY.md"
        fi
      done < "$DERIVED_SERVICES"
    fi
    rm -f "$DERIVED_SERVICES"
  fi

  note "second-pass source re-derivation complete (routes=$ROUTE_COUNT2 tables=$TABLE_COUNT2 services=${SERVICE_COUNT2:-0})"
fi

validator_exit
