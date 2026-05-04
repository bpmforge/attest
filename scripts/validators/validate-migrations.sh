#!/usr/bin/env bash
#
# validate-migrations.sh -- every migration file in the project must be
# documented in docs/DATABASE.md (migration log section) or referenced by
# filename. Catches schema-doc drift after rename / add / drop migrations.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-migrations"

ROOT="$(detect_project_root "${1:-}")"

DB_DOC=""
for f in "$ROOT/docs/DATABASE.md" "$ROOT/docs/database/MIGRATIONS.md" "$ROOT/docs/MIGRATIONS.md"; do
  [[ -f "$f" ]] && DB_DOC="$f" && break
done

# Find migration directories
MIG_DIRS=()
for d in "migrations" "prisma/migrations" "db/migrations" "alembic/versions" "src/migrations"; do
  [[ -d "$ROOT/$d" ]] && MIG_DIRS+=( "$ROOT/$d" )
done

if [[ "${#MIG_DIRS[@]}" -eq 0 ]]; then
  warn "no migration directory found — skipping"
  validator_exit
fi

if [[ -z "$DB_DOC" ]]; then
  gap "missing-db-doc" "migrations directory exists but no DATABASE.md / MIGRATIONS.md to document them"
  validator_exit
fi

MIGS=()
for d in "${MIG_DIRS[@]}"; do
  while IFS= read -r f; do
    [[ -n "$f" ]] && MIGS+=( "$(basename "$f" | sed 's/\.[^.]*$//')" )
  done < <(find "$d" -type f \( -name '*.sql' -o -name '*.py' -o -name '*.ts' -o -name '*.js' \) -not -name '__init__.py' 2>/dev/null)
  # Prisma uses subdirs with migration.sql inside
  while IFS= read -r d2; do
    [[ -n "$d2" ]] && MIGS+=( "$(basename "$d2")" )
  done < <(find "$d" -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
done

# Dedupe
MIGS_SORTED=$(printf '%s\n' "${MIGS[@]:-}" | awk 'NF' | sort -u)
MIG_COUNT=$(printf '%s\n' "$MIGS_SORTED" | grep -c . || true)

if [[ "$MIG_COUNT" -eq 0 ]]; then
  warn "no migration files discovered — skipping"
  validator_exit
fi

pass "discovered $MIG_COUNT migration(s) across ${#MIG_DIRS[@]} directory(ies)"

while IFS= read -r mig; do
  [[ -z "$mig" ]] && continue
  if ! grep -qF "$mig" "$DB_DOC" 2>/dev/null; then
    gap "undocumented-migration" "$mig not mentioned in $(basename "$DB_DOC")"
  fi
done <<< "$MIGS_SORTED"

validator_exit
