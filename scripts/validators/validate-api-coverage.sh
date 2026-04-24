#!/usr/bin/env bash
#
# validate-api-coverage.sh -- confirm every route in the codebase has a matching
# entry in docs/API_DESIGN.md AND docs/api/openapi.yaml.
#
# Route discovery is best-effort across common frameworks:
#   - Express/Fastify: app.get(...), router.post(...), fastify.route({method:...})
#   - Next.js app router: files under app/api/**/route.{ts,js}
#   - Go net/http: http.HandleFunc("/path", ...)
#   - Python FastAPI/Flask: @app.get("/path") / @router.post("/path")
#
# Usage:
#   validate-api-coverage.sh [project-root]
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-api-coverage"

ROOT="$(detect_project_root "${1:-}")"
API_DESIGN="$ROOT/docs/API_DESIGN.md"
OPENAPI="$ROOT/docs/api/openapi.yaml"

if ! file_exists_nonempty "$API_DESIGN"; then
  gap "missing-file" "docs/API_DESIGN.md not found"
fi

if ! file_exists_nonempty "$OPENAPI"; then
  gap "missing-file" "docs/api/openapi.yaml not found"
fi

# Short-circuit if either spec is missing -- can't check coverage.
if [[ "$GAP_COUNT" -gt 0 ]]; then
  validator_exit
fi

# -- Discover routes from source --------------------------------------------
ROUTES_FILE=$(mktemp -t "routes.XXXXXX")
trap 'rm -f "$ROUTES_FILE"' EXIT

# Restrict to typical source directories to avoid scanning node_modules/.
SRC_DIRS=()
for d in src app routes api server internal pkg; do
  [[ -d "$ROOT/$d" ]] && SRC_DIRS+=("$ROOT/$d")
done

if [[ "${#SRC_DIRS[@]}" -eq 0 ]]; then
  warn "no standard source directories found (src, app, routes, api, server, internal, pkg)"
  validator_exit
fi

# Express / Fastify / Koa style
grep -rEoh --include='*.ts' --include='*.js' --include='*.mjs' \
  '(app|router|fastify|server)\.(get|post|put|patch|delete|head|options)\(["'"'"'][^"'"'"']+["'"'"']' \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E 's/.*\.(get|post|put|patch|delete|head|options)\(["'"'"']([^"'"'"']+).*/\1 \2/' | \
  awk '{print toupper($1) " " $2}' >> "$ROUTES_FILE" || true

# Python FastAPI / Flask decorators
grep -rEoh --include='*.py' \
  '@(app|router|bp|blueprint)\.(get|post|put|patch|delete|head|options)\(["'"'"'][^"'"'"']+["'"'"']' \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E 's/.*\.(get|post|put|patch|delete|head|options)\(["'"'"']([^"'"'"']+).*/\1 \2/' | \
  awk '{print toupper($1) " " $2}' >> "$ROUTES_FILE" || true

# Go net/http
grep -rEoh --include='*.go' \
  '(http|mux|router)\.(HandleFunc|Handle)\(["'"'"'][^"'"'"']+["'"'"']' \
  "${SRC_DIRS[@]}" 2>/dev/null | \
  sed -E 's/.*(HandleFunc|Handle)\(["'"'"']([^"'"'"']+).*/ANY \2/' >> "$ROUTES_FILE" || true

# Next.js app router: app/api/**/route.ts
if [[ -d "$ROOT/app/api" ]]; then
  while IFS= read -r f; do
    rel="${f#"$ROOT/app/api"}"
    rel="${rel%/route.*}"
    [[ -z "$rel" ]] && rel="/"
    # Extract exported HTTP methods
    while IFS= read -r m; do
      printf '%s /api%s\n' "$m" "$rel" >> "$ROUTES_FILE"
    done < <(grep -oE 'export[[:space:]]+(async[[:space:]]+)?function[[:space:]]+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)' "$f" 2>/dev/null | grep -oE '(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)' || true)
  done < <(find "$ROOT/app/api" -type f \( -name 'route.ts' -o -name 'route.js' -o -name 'route.mjs' \) 2>/dev/null)
fi

# Dedupe
sort -u "$ROUTES_FILE" -o "$ROUTES_FILE"

ROUTE_COUNT=$(wc -l < "$ROUTES_FILE" | tr -d ' ')
if [[ "$ROUTE_COUNT" -eq 0 ]]; then
  warn "no routes discovered in source -- nothing to coverage-check"
  validator_exit
fi

pass "discovered $ROUTE_COUNT route(s) in source"

# -- Check each route is documented -----------------------------------------
MISSING_DESIGN=0
MISSING_SPEC=0

while IFS=' ' read -r method path; do
  [[ -z "${method:-}" || -z "${path:-}" ]] && continue

  # API_DESIGN.md -- substring match of the path (case-insensitive method)
  if ! grep -qE "${path}" "$API_DESIGN" 2>/dev/null; then
    gap "missing-in-design" "$method $path not documented in API_DESIGN.md"
    MISSING_DESIGN=$((MISSING_DESIGN + 1))
  fi

  # openapi.yaml -- require the literal path to appear
  if ! grep -qE "${path}:" "$OPENAPI" 2>/dev/null && ! grep -qE "${path}\"" "$OPENAPI" 2>/dev/null; then
    gap "missing-in-openapi" "$method $path not in openapi.yaml paths"
    MISSING_SPEC=$((MISSING_SPEC + 1))
  fi
done < "$ROUTES_FILE"

if [[ "$MISSING_DESIGN" -eq 0 && "$MISSING_SPEC" -eq 0 ]]; then
  pass "all $ROUTE_COUNT routes covered"
fi

validator_exit
