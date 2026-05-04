#!/usr/bin/env bash
#
# validate-tech-stack.sh -- every direct dependency in the project's manifest
# (package.json / pyproject.toml / requirements.txt / Cargo.toml / go.mod)
# must appear in docs/TECH_STACK.md.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-tech-stack"

ROOT="$(detect_project_root "${1:-}")"

TS="$ROOT/docs/TECH_STACK.md"
if [[ ! -f "$TS" ]]; then
  warn "no docs/TECH_STACK.md found — skipping (Phase 3 may not have produced one)"
  validator_exit
fi

DEPS=()

# package.json -- direct deps + devDependencies
if [[ -f "$ROOT/package.json" ]]; then
  if command -v jq >/dev/null 2>&1; then
    while IFS= read -r d; do
      [[ -n "$d" ]] && DEPS+=( "$d" )
    done < <(jq -r '
      (.dependencies // {} | keys) + (.devDependencies // {} | keys) + (.peerDependencies // {} | keys)
      | unique | .[]
    ' "$ROOT/package.json" 2>/dev/null)
  fi
fi

# pyproject.toml -- [project.dependencies] / [tool.poetry.dependencies]
if [[ -f "$ROOT/pyproject.toml" ]]; then
  while IFS= read -r d; do
    [[ -n "$d" ]] && DEPS+=( "$d" )
  done < <(awk '
    /^\[project\]/ || /^\[tool\.poetry\.dependencies\]/ { in_block=1; next }
    /^\[/ { in_block=0 }
    in_block && /^[a-zA-Z0-9_-]+[[:space:]]*=/ {
      sub(/[[:space:]]*=.*/, ""); print
    }
    in_block && /dependencies[[:space:]]*=/ { in_dep=1 }
    in_dep && /\"[a-zA-Z0-9_.-]+/ {
      while (match($0, /"[a-zA-Z0-9_.-]+/)) {
        s = substr($0, RSTART+1, RLENGTH-1)
        gsub(/[<>=].*/, "", s)
        print s
        $0 = substr($0, RSTART+RLENGTH)
      }
    }
    in_dep && /\]/ { in_dep=0 }
  ' "$ROOT/pyproject.toml" 2>/dev/null)
fi

# requirements.txt
if [[ -f "$ROOT/requirements.txt" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    line=$(echo "$line" | sed 's/^ *//;s/ *$//')
    [[ -z "$line" ]] && continue
    pkg=$(echo "$line" | sed -E 's/[<>=!~].*//')
    [[ -n "$pkg" ]] && DEPS+=( "$pkg" )
  done < "$ROOT/requirements.txt"
fi

# Cargo.toml -- [dependencies], [dev-dependencies]
if [[ -f "$ROOT/Cargo.toml" ]]; then
  while IFS= read -r d; do
    [[ -n "$d" ]] && DEPS+=( "$d" )
  done < <(awk '
    /^\[dependencies\]/ || /^\[dev-dependencies\]/ { in_block=1; next }
    /^\[/ { in_block=0 }
    in_block && /^[a-zA-Z0-9_-]+[[:space:]]*=/ {
      sub(/[[:space:]]*=.*/, ""); print
    }
  ' "$ROOT/Cargo.toml" 2>/dev/null)
fi

# go.mod -- require directives (direct only)
if [[ -f "$ROOT/go.mod" ]]; then
  while IFS= read -r d; do
    [[ -n "$d" ]] && DEPS+=( "$d" )
  done < <(awk '
    /^require[[:space:]]*\(/ { in_block=1; next }
    /^\)/ { in_block=0 }
    in_block && !/indirect/ {
      sub(/^[[:space:]]+/, "")
      sub(/[[:space:]].*/, "")
      if ($0 != "") print
    }
    /^require[[:space:]]+[a-zA-Z0-9.\/_-]+/ && !/indirect/ {
      sub(/^require[[:space:]]+/, "")
      sub(/[[:space:]].*/, "")
      print
    }
  ' "$ROOT/go.mod" 2>/dev/null)
fi

# Dedupe + filter
DEPS_SORTED=$(printf '%s\n' "${DEPS[@]:-}" | awk 'NF' | sort -u)
DEP_COUNT=$(printf '%s\n' "$DEPS_SORTED" | grep -c . || true)

if [[ "$DEP_COUNT" -eq 0 ]]; then
  warn "no dependencies discovered — skipping"
  validator_exit
fi

pass "discovered $DEP_COUNT direct dependencies"

while IFS= read -r dep; do
  [[ -z "$dep" ]] && continue
  # Tolerate scoped packages (@org/name → grep on `name` too)
  if ! grep -qF "$dep" "$TS" 2>/dev/null; then
    gap "undocumented-dep" "$dep not mentioned in TECH_STACK.md"
  fi
done <<< "$DEPS_SORTED"

validator_exit
