#!/usr/bin/env bash
#
# validate-api-coverage.sh -- confirm every route in the codebase has a matching
# entry in docs/API_DESIGN.md AND docs/api/openapi.yaml.
#
# JSON-Schema contract mode (no HTTP API -- MCP servers, native messaging,
# CLIs). Selected by api_contract_mode() in _lib.sh when there is no
# docs/api/openapi.yaml, docs/API_DESIGN.md exists, docs/api/schemas/ holds
# >= 1 *.json, and docs/DESIGN_CONTEXT.md or docs/API_DESIGN.md declares the
# adaptation ("no HTTP API" / "JSON Schema contracts"). Then:
#   - Names: every markdown table in API_DESIGN.md whose header has a column
#     named Tool, Endpoint, Operation, Command, Method or RPC (optionally
#     followed by "name") contributes the cells of that column that are a
#     single backticked token, e.g. | 3 | `ack_feedback` | ... |.
#     Zero names found is itself a gap (nothing to check coverage against).
#   - Coverage (best-effort name match): a name is covered when some file
#     under docs/api/schemas/ (recursive) has a basename (minus .json) that,
#     split on ".", has a segment equal to the name -- compared
#     case-insensitively with "-" and "_" ignored. So `ack_feedback` is
#     covered by tool.ack_feedback.input.json or ack-feedback.json.
#   - Every *.json under docs/api/schemas/ must parse as JSON (python3, else
#     node; skipped with a warning if neither is available).
#   Source route discovery is skipped in this mode.
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

# -- JSON-Schema contract mode ----------------------------------------------
if [[ "$(api_contract_mode "$ROOT")" == "json-schema" ]]; then
  SCHEMA_DIR="$ROOT/docs/api/schemas"
  note "JSON-Schema contract mode: no HTTP API declared -- checking docs/api/schemas/ instead of openapi.yaml"

  NAMES_FILE=$(mktemp -t "apinames.XXXXXX")
  SCHEMAS_FILE=$(mktemp -t "apischemas.XXXXXX")
  trap 'rm -f "$GAP_FILE" "$NAMES_FILE" "$SCHEMAS_FILE"' EXIT

  # Names from the Tool/Endpoint/... column of every markdown table.
  awk '
    function trim(x) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", x); return x }
    !/^[[:space:]]*\|/ { col = 0; header_seen = 0; next }
    {
      n = split($0, cell, "|")
      if (!header_seen) {
        header_seen = 1; col = 0
        for (i = 2; i < n; i++) {
          h = tolower(trim(cell[i]))
          if (h ~ /^(tool|endpoint|operation|command|method|rpc)s?( name)?$/) { col = i; break }
        }
        next
      }
      if (col == 0) next
      c = trim(cell[col])
      if (c ~ /^`[^` ]+`$/) print substr(c, 2, length(c) - 2)
    }
  ' "$API_DESIGN" | sort -u > "$NAMES_FILE"

  find "$SCHEMA_DIR" -type f -name '*.json' 2>/dev/null | sort > "$SCHEMAS_FILE"
  SCHEMA_COUNT=$(wc -l < "$SCHEMAS_FILE" | tr -d ' ')
  NAME_COUNT=$(wc -l < "$NAMES_FILE" | tr -d ' ')

  # Every schema parses as JSON.
  PARSER=""
  if command -v python3 >/dev/null 2>&1; then PARSER="python3"
  elif command -v node >/dev/null 2>&1; then PARSER="node"
  fi
  if [[ -z "$PARSER" ]]; then
    warn "neither python3 nor node available -- skipping JSON parse check of $SCHEMA_COUNT schema(s)"
  else
    bad=0
    while IFS= read -r sf; do
      [[ -z "$sf" ]] && continue
      if [[ "$PARSER" == "python3" ]]; then
        parsed=0; python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$sf" >/dev/null 2>&1 || parsed=1
      else
        parsed=0; node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$sf" >/dev/null 2>&1 || parsed=1
      fi
      if [[ "$parsed" -ne 0 ]]; then
        gap "invalid-schema-json" "${sf#"$ROOT/"} does not parse as JSON"
        bad=$((bad + 1))
      fi
    done < "$SCHEMAS_FILE"
    [[ "$bad" -eq 0 ]] && pass "all $SCHEMA_COUNT schema file(s) parse as JSON"
  fi

  if [[ "$NAME_COUNT" -eq 0 ]]; then
    gap "no-contract-names" "API_DESIGN.md has no table with a Tool/Endpoint/Operation/Command/Method/RPC column listing backticked names -- nothing to check schema coverage against"
    validator_exit
  fi

  # Normalized "segment" index of every schema basename, one per line.
  SEGMENTS=$(while IFS= read -r sf; do
      [[ -z "$sf" ]] && continue
      b="${sf##*/}"; b="${b%.json}"
      printf '%s\n' "$b" | tr '.' '\n'
    done < "$SCHEMAS_FILE" | tr '[:upper:]' '[:lower:]' | tr -d '_-' | sort -u)

  missing=0
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    norm=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -d '_-')
    if ! grep -qxF "$norm" <<< "$SEGMENTS"; then
      gap "missing-schema" "\`$name\` is listed in API_DESIGN.md but no docs/api/schemas/*.json file is named for it"
      missing=$((missing + 1))
    fi
  done < "$NAMES_FILE"
  [[ "$missing" -eq 0 ]] && pass "all $NAME_COUNT contract name(s) in API_DESIGN.md have a schema file"

  validator_exit
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
