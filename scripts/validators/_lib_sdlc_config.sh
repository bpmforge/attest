#!/usr/bin/env bash
#
# _lib_sdlc_config.sh -- helpers for reading optional .sdlc/sdlc.json overrides
# and auto-detecting build/test/lint/smoke commands per stack.
#
# Sourced by the operational validators (validate-build.sh, validate-tests.sh,
# validate-lint.sh, validate-smoke.sh, validate-deps.sh).
#
# Schema (.sdlc/sdlc.json):
#   {
#     "build":     "npm run build",
#     "test":      "npm test",
#     "lint":      "eslint .",
#     "typecheck": "tsc --noEmit",
#     "smoke": {
#       "start":     "npm run dev",
#       "wait_url":  "http://localhost:3000/health",
#       "wait_secs": 30,
#       "routes":    ["/", "/api/health"]
#     },
#     "deps":      "npm audit --json"
#   }
#
# All keys optional. Missing keys fall back to auto-detection.
#

# detect_stack <root>  -- echoes one of: node | python | rust | go | unknown
detect_stack() {
  local root="$1"
  if [[ -f "$root/package.json" ]]; then
    echo "node"
  elif [[ -f "$root/pyproject.toml" || -f "$root/setup.py" || -f "$root/requirements.txt" ]]; then
    echo "python"
  elif [[ -f "$root/Cargo.toml" ]]; then
    echo "rust"
  elif [[ -f "$root/go.mod" ]]; then
    echo "go"
  else
    echo "unknown"
  fi
}

# read_config_value <root> <key>  -- reads .sdlc/sdlc.json key (top-level only)
# Uses Python or jq if available; falls back to a sed-based extractor.
read_config_value() {
  local root="$1"
  local key="$2"
  local cfg="$root/.sdlc/sdlc.json"
  [[ ! -f "$cfg" ]] && return 1

  if command -v jq >/dev/null 2>&1; then
    local val
    val=$(jq -r --arg k "$key" '.[$k] // empty' "$cfg" 2>/dev/null)
    [[ -n "$val" && "$val" != "null" ]] && printf '%s' "$val" && return 0
    return 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, sys
try:
    with open('$cfg') as f: c = json.load(f)
    v = c.get('$key')
    if v is None: sys.exit(1)
    if isinstance(v, str): print(v)
    else: print(json.dumps(v))
except Exception as e:
    sys.exit(1)
" 2>/dev/null
    return $?
  fi

  # last-ditch sed (only handles simple string values)
  local val
  val=$(sed -nE "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/p" "$cfg" | head -1)
  [[ -n "$val" ]] && printf '%s' "$val" && return 0
  return 1
}

# resolve_command <root> <key> <auto-detect-default>
# Returns the user-configured command, or the auto-detected default.
resolve_command() {
  local root="$1"
  local key="$2"
  local default="$3"
  local override
  if override=$(read_config_value "$root" "$key"); then
    printf '%s' "$override"
  else
    printf '%s' "$default"
  fi
}

# default_build <stack>
default_build() {
  case "$1" in
    node)   echo "npm run build" ;;
    python) echo "python -m build" ;;
    rust)   echo "cargo build --release" ;;
    go)     echo "go build ./..." ;;
    *)      echo "" ;;
  esac
}

# default_test <stack>
default_test() {
  case "$1" in
    node)   echo "npm test" ;;
    python) echo "pytest" ;;
    rust)   echo "cargo test" ;;
    go)     echo "go test ./..." ;;
    *)      echo "" ;;
  esac
}

# default_lint <stack>
default_lint() {
  case "$1" in
    node)   echo "npm run lint" ;;
    python) echo "ruff check ." ;;
    rust)   echo "cargo clippy -- -D warnings" ;;
    go)     echo "go vet ./..." ;;
    *)      echo "" ;;
  esac
}

# default_typecheck <stack>
default_typecheck() {
  case "$1" in
    node)   echo "npx tsc --noEmit" ;;
    python) echo "mypy ." ;;
    rust)   echo "cargo check" ;;
    go)     echo "go vet ./..." ;;
    *)      echo "" ;;
  esac
}

# default_deps <stack>
default_deps() {
  case "$1" in
    node)   echo "npm audit --audit-level=high --json" ;;
    python) echo "pip-audit -f json" ;;
    rust)   echo "cargo audit --json" ;;
    go)     echo "govulncheck ./..." ;;
    *)      echo "" ;;
  esac
}

# is_npm_script_defined <root> <script-name>  -- 0 if defined, 1 if missing.
# Used to decide whether a missing build/lint/typecheck script should be a
# WARN (not configured) vs a FAIL (configured but broken).
is_npm_script_defined() {
  local root="$1"
  local name="$2"
  local pkg="$root/package.json"
  [[ ! -f "$pkg" ]] && return 1
  if command -v jq >/dev/null 2>&1; then
    [[ "$(jq -r --arg n "$name" '.scripts[$n] // empty' "$pkg")" != "" ]]
    return $?
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, sys
try:
    with open('$pkg') as f: c = json.load(f)
    sys.exit(0 if c.get('scripts', {}).get('$name') else 1)
except Exception: sys.exit(1)
"
    return $?
  fi
  # Fallback: grep — looks for "name": in scripts block (best-effort)
  grep -qE "\"${name}\"[[:space:]]*:[[:space:]]*\"" "$pkg"
}

# command_runnable <stack> <key> <command>  -- 0 if runnable, 1 if not configured.
# Treats missing scripts / missing tool configs as not-configured rather than
# failure. Specific config-file prerequisites:
#   tsc      -> tsconfig.json
#   eslint   -> .eslintrc*, eslint.config.*, or "eslintConfig" in package.json
#   mypy     -> mypy.ini, .mypy.ini, or [tool.mypy] in pyproject.toml
#   ruff     -> ruff.toml, .ruff.toml, or [tool.ruff] in pyproject.toml
command_runnable() {
  local stack="$1"
  local key="$2"
  local cmd="$3"
  local root="${4:-$PWD}"

  # 1. npm/yarn/pnpm script must exist in package.json
  case "$cmd" in
    "npm run "* | "pnpm run "* | "yarn "*)
      local script
      script=$(echo "$cmd" | sed -E 's/^(npm run|pnpm run|yarn)[[:space:]]+([^[:space:]]+).*/\2/')
      is_npm_script_defined "$root" "$script" || return 1
      return 0
      ;;
  esac

  # 2. tool-specific config-file prerequisites
  if [[ "$cmd" =~ ^(npx[[:space:]]+)?tsc([[:space:]]|$) ]]; then
    [[ -f "$root/tsconfig.json" ]] || return 1
  fi
  if [[ "$cmd" =~ ^(npx[[:space:]]+)?eslint([[:space:]]|$) ]]; then
    if [[ ! -f "$root/.eslintrc" && ! -f "$root/.eslintrc.js" \
       && ! -f "$root/.eslintrc.json" && ! -f "$root/.eslintrc.yaml" \
       && ! -f "$root/.eslintrc.yml" && ! -f "$root/eslint.config.js" \
       && ! -f "$root/eslint.config.mjs" && ! -f "$root/eslint.config.cjs" ]]; then
      grep -q '"eslintConfig"' "$root/package.json" 2>/dev/null || return 1
    fi
  fi
  if [[ "$cmd" =~ ^mypy([[:space:]]|$) ]]; then
    if [[ ! -f "$root/mypy.ini" && ! -f "$root/.mypy.ini" ]]; then
      grep -q '\[tool.mypy\]' "$root/pyproject.toml" 2>/dev/null || return 1
    fi
  fi
  if [[ "$cmd" =~ ^ruff([[:space:]]|$) ]]; then
    if [[ ! -f "$root/ruff.toml" && ! -f "$root/.ruff.toml" ]]; then
      grep -q '\[tool.ruff\]' "$root/pyproject.toml" 2>/dev/null || return 1
    fi
  fi

  # 3. Generic: first word must be on PATH
  case "$cmd" in
    "npx "*) return 0 ;;
    "")      return 1 ;;
    *)
      local first
      first=$(echo "$cmd" | awk '{print $1}')
      command -v "$first" >/dev/null 2>&1
      return $?
      ;;
  esac
}

# write_runtime_report <root> <kind> <verdict> <body>
# Produces docs/reviews/RUNTIME_<kind>_<date>.md with a strict structure.
write_runtime_report() {
  local root="$1"
  local kind="$2"
  local verdict="$3"
  local body="$4"
  local date
  date=$(date +%Y-%m-%d)
  local out_dir="$root/docs/reviews"
  mkdir -p "$out_dir"
  local out="$out_dir/RUNTIME_${kind}_${date}.md"
  cat > "$out" <<EOF
# RUNTIME_${kind} — ${date}

**Verdict:** ${verdict}
**Validator:** validate-${kind}.sh
**Project root:** ${root}

## Output

\`\`\`
${body}
\`\`\`
EOF
  printf '%s' "$out"
}
