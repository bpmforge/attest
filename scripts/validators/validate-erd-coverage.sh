#!/usr/bin/env bash
#
# validate-erd-coverage.sh -- confirm every table/model in the codebase appears
# in the ERD inside docs/ARCHITECTURE.md OR docs/DATABASE.md.
#
# Table discovery across common ORMs / migration tools:
#   - Prisma (schema.prisma): `model Foo {`
#   - TypeORM / Sequelize: @Entity('foo') or @Table({...})
#   - Knex / raw migrations: knex.schema.createTable('foo',
#   - Go (GORM): type Foo struct { ... } with `gorm:` tags
#   - Python SQLAlchemy: `class Foo(Base):` with `__tablename__ = 'foo'`
#   - Django: `class Foo(models.Model):`
#   - Raw SQL: CREATE TABLE IF NOT EXISTS foo
#
# Usage:
#   validate-erd-coverage.sh [project-root]
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-erd-coverage"

ROOT="$(detect_project_root "${1:-}")"

ERD_SOURCES=()
for candidate in \
  "$ROOT/docs/DATABASE.md" \
  "$ROOT/docs/ARCHITECTURE.md" \
  "$ROOT/docs/database/ERD.md" \
  "$ROOT/docs/erd.md"; do
  [[ -f "$candidate" ]] && ERD_SOURCES+=("$candidate")
done

if [[ "${#ERD_SOURCES[@]}" -eq 0 ]]; then
  gap "missing-file" "no ERD source found (checked docs/DATABASE.md, docs/ARCHITECTURE.md, docs/database/ERD.md)"
  validator_exit
fi

# -- Discover tables/models from source -------------------------------------
TABLES_FILE=$(mktemp -t "tables.XXXXXX")
trap 'rm -f "$TABLES_FILE"' EXIT

SRC_DIRS=()
for d in src app server internal pkg prisma migrations db models; do
  [[ -d "$ROOT/$d" ]] && SRC_DIRS+=("$ROOT/$d")
done

if [[ "${#SRC_DIRS[@]}" -eq 0 ]]; then
  warn "no standard source directories found"
  validator_exit
fi

# Prisma
grep -rEoh --include='*.prisma' '^model[[:space:]]+[A-Za-z_][A-Za-z0-9_]+' \
  "${SRC_DIRS[@]}" 2>/dev/null | awk '{print $2}' >> "$TABLES_FILE" || true

# Decorators: @Entity('name') or @Table('name')
grep -rEoh --include='*.ts' --include='*.js' \
  "@(Entity|Table)\(['\"][A-Za-z0-9_]+['\"]" \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E "s/.*\(['\"]([A-Za-z0-9_]+).*/\1/" >> "$TABLES_FILE" || true

# Knex: knex.schema.createTable('foo', ...)
grep -rEoh --include='*.ts' --include='*.js' \
  "createTable\(['\"][A-Za-z0-9_]+['\"]" \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E "s/createTable\(['\"]([A-Za-z0-9_]+).*/\1/" >> "$TABLES_FILE" || true

# SQLAlchemy: __tablename__ = 'foo'
grep -rEoh --include='*.py' \
  "__tablename__[[:space:]]*=[[:space:]]*['\"][A-Za-z0-9_]+['\"]" \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E "s/.*['\"]([A-Za-z0-9_]+).*/\1/" >> "$TABLES_FILE" || true

# Django: class Foo(models.Model)  -> class name
grep -rEoh --include='*.py' \
  'class[[:space:]]+[A-Z][A-Za-z0-9_]+\(models\.Model\)' \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E 's/class[[:space:]]+([A-Za-z0-9_]+).*/\1/' >> "$TABLES_FILE" || true

# Raw SQL: CREATE TABLE IF NOT EXISTS foo
grep -rEoh --include='*.sql' --include='*.ts' --include='*.js' --include='*.go' --include='*.py' \
  -i 'CREATE[[:space:]]+TABLE([[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS)?[[:space:]]+[A-Za-z_][A-Za-z0-9_]+' \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E 's/.*CREATE[[:space:]]+TABLE([[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS)?[[:space:]]+([A-Za-z0-9_]+).*/\2/i' >> "$TABLES_FILE" || true

# Dedupe case-insensitive
awk '{ print tolower($0) }' "$TABLES_FILE" | sort -u > "${TABLES_FILE}.sorted"
mv "${TABLES_FILE}.sorted" "$TABLES_FILE"

TABLE_COUNT=$(wc -l < "$TABLES_FILE" | tr -d ' ')
if [[ "$TABLE_COUNT" -eq 0 ]]; then
  warn "no tables/models discovered in source -- nothing to coverage-check"
  validator_exit
fi

pass "discovered $TABLE_COUNT table/model(s) in source"

# -- Check each appears in at least one ERD source --------------------------
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  found=0
  for src in "${ERD_SOURCES[@]}"; do
    if grep -qiE "\b${table}\b" "$src"; then
      found=1
      break
    fi
  done
  if [[ "$found" -eq 0 ]]; then
    gap "missing-in-erd" "table '$table' not found in any ERD source"
  fi
done < "$TABLES_FILE"

# -- Require at least one erDiagram mermaid block in ERD source ------------
has_er_diagram=0
for src in "${ERD_SOURCES[@]}"; do
  if grep -q 'erDiagram' "$src"; then
    has_er_diagram=1
    break
  fi
done

if [[ "$has_er_diagram" -eq 0 ]]; then
  gap "no-mermaid-erd" "no 'erDiagram' mermaid block found in any ERD source"
fi

validator_exit
