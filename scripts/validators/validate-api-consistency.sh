#!/usr/bin/env bash
#
# validate-api-consistency.sh -- the OpenAPI spec and the implemented routes
# must agree (backlog C2). An OpenAPI file that drifts from the code is worse
# than none: consumers build against documented endpoints that 404.
#
# Compares docs/api/openapi.yaml paths×methods against routes found in source:
#   GAP  spec-only endpoint  — documented but no route in code (unimplemented
#                              or removed without updating the spec)
#   GAP  code-only route     — implemented but undocumented (invisible to
#                              consumers, skipped by contract tests)
#
# Route detection is grep-based and framework-aware (Express/Fastify/Koa,
# Flask/FastAPI, Go net-http/chi/gin, NestJS decorators). Dynamic or
# programmatically-registered routes can evade it — those go to the warning
# list, not silent omission. Response-SCHEMA conformance is intentionally out
# of scope for a grep gate; it belongs to contract tests (see TEST_DESIGN
# integration rows).
#
# Path params normalize for comparison: {id} == :id == <id> == <int:id>.
#
# Exit: 0 = spec and code agree / 1 = drift / 2 = invocation error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-api-consistency"

ROOT="$(detect_project_root "${1:-}")"

SPEC=""
for f in "$ROOT/docs/api/openapi.yaml" "$ROOT/docs/api/openapi.yml" "$ROOT/openapi.yaml" "$ROOT/openapi.yml" "$ROOT/docs/openapi.yaml"; do
  [[ -f "$f" ]] && SPEC="$f" && break
done

if [[ -z "$SPEC" ]]; then
  warn "no openapi.yaml found (docs/api/ or project root) — skipping API consistency check"
  validator_exit
fi
note "Spec: ${SPEC#"$ROOT/"}"

SRC_DIRS=()
for candidate in "src" "app" "lib" "api" "server" "routes" "internal" "cmd"; do
  [[ -d "$ROOT/$candidate" ]] && SRC_DIRS+=("$ROOT/$candidate")
done
if [[ "${#SRC_DIRS[@]}" -eq 0 ]]; then
  warn "no source directory found — skipping (spec exists but nothing to compare)"
  validator_exit
fi

COMPARISON=$(python3 - "$SPEC" "${SRC_DIRS[@]}" <<'PYEOF'
import os, re, sys

spec_file, src_dirs = sys.argv[1], sys.argv[2:]
METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}

def norm(path):
    # {id} / :id / <id> / <int:id> all become {}
    p = re.sub(r"\{[^}]*\}", "{}", path)
    p = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", "{}", p)
    p = re.sub(r"<[^>]*>", "{}", p)
    return p.rstrip("/") or "/"

# ── spec endpoints ───────────────────────────────────────────────────────
spec = set()
try:
    import yaml  # type: ignore
    doc = yaml.safe_load(open(spec_file, encoding="utf-8"))
    for path, item in (doc.get("paths") or {}).items():
        if isinstance(item, dict):
            for m in item:
                if m.lower() in METHODS:
                    spec.add((m.upper(), norm(path)))
except Exception:
    # regex fallback: "  /path:" lines, then deeper-indented method keys
    cur, cur_indent = None, 0
    for line in open(spec_file, encoding="utf-8"):
        mp = re.match(r"^(\s{2,6})(/[^\s:]*):\s*$", line)
        if mp:
            cur, cur_indent = mp.group(2), len(mp.group(1))
            continue
        mm = re.match(r"^(\s+)(get|post|put|patch|delete|head|options)\s*:", line, re.I)
        if mm and cur and len(mm.group(1)) > cur_indent:
            spec.add((mm.group(2).upper(), norm(cur)))

# ── code routes ──────────────────────────────────────────────────────────
code = set()
dynamic_files = set()
EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go")

PATTERNS = [
    # Express / Fastify / Koa / Hono: app.get('/x'), router.post("/x")
    (re.compile(r"\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['\"\x60]([^'\"\x60]+)['\"\x60]"), None),
    # Flask: @app.route("/x", methods=["GET","POST"])  (default GET)
    (re.compile(r"@\w+\.route\(\s*['\"]([^'\"]+)['\"](?:.*methods\s*=\s*\[([^\]]*)\])?", re.S), "flask"),
    # FastAPI decorators: @app.get("/x")
    (re.compile(r"@\w+\.(get|post|put|patch|delete|head|options)\(\s*['\"]([^'\"]+)['\"]"), None),
    # Go: HandleFunc("/x", ...) — method often checked inside; record as ANY
    (re.compile(r"HandleFunc\(\s*\"([^\"]+)\""), "go-any"),
    # Go chi/gin: r.GET("/x"), r.Post("/x")
    (re.compile(r"\.\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Get|Post|Put|Patch|Delete)\s*\(\s*\"([^\"]+)\""), None),
    # NestJS: @Get('x') — controller prefix not resolved; best-effort leaf
    (re.compile(r"@(Get|Post|Put|Patch|Delete|Head|Options)\(\s*['\"]?([^'\")]*)['\"]?\)"), "nest"),
]

for d in src_dirs:
    for root, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in ("node_modules", "dist", "build", ".git", "vendor", "__pycache__")]
        for fn in files:
            if not fn.endswith(EXTS) or ".test." in fn or ".spec." in fn:
                continue
            fp = os.path.join(root, fn)
            try:
                text = open(fp, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for rx, kind in PATTERNS:
                for m in rx.finditer(text):
                    if kind == "flask":
                        path = m.group(1)
                        methods = re.findall(r"['\"](\w+)['\"]", m.group(2) or "") or ["GET"]
                        for meth in methods:
                            code.add((meth.upper(), norm(path)))
                    elif kind == "go-any":
                        for meth in METHODS:
                            code.add((meth.upper(), norm(m.group(1))))
                    elif kind == "nest":
                        path = "/" + (m.group(2) or "")
                        code.add((m.group(1).upper(), norm(path)))
                        dynamic_files.add(os.path.relpath(fp))  # prefix unresolved
                    else:
                        meth, path = m.group(1).upper(), m.group(2)
                        if path.startswith("/") or path == "":
                            code.add((meth, norm(path)))
            if re.search(r"(registerRoutes|createRouter|router\.use\(|include_router)", text):
                dynamic_files.add(os.path.relpath(fp))

if not spec:
    print("WARN\tno endpoints parsed from the spec — check paths: section format")
if not code:
    print("WARN\tno routes detected in source — framework may register routes dynamically; manual contract review needed")

if spec and code:
    for meth, path in sorted(spec - code):
        print(f"SPEC_ONLY\t{meth} {path}")
    for meth, path in sorted(code - spec):
        print(f"CODE_ONLY\t{meth} {path}")
    print(f"INFO\tspec={len(spec)} code={len(code)} matched={len(spec & code)}")
for f in sorted(dynamic_files):
    print(f"DYNAMIC\t{f}")
PYEOF
)

while IFS=$'\t' read -r kind detail; do
  [[ -z "$kind" ]] && continue
  case "$kind" in
    SPEC_ONLY) gap "spec-only-endpoint" "$detail documented in openapi.yaml but no matching route found in source — implement it or remove it from the spec" ;;
    CODE_ONLY) gap "undocumented-route" "$detail implemented but absent from openapi.yaml — document it (consumers and contract tests cannot see it)" ;;
    WARN)      warn "$detail" ;;
    DYNAMIC)   warn "routes composed dynamically in $detail — grep cannot fully resolve; verify those against the spec manually" ;;
    INFO)      note "$detail" ;;
  esac
done <<< "$COMPARISON"

validator_exit
