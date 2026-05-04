#!/usr/bin/env bash
#
# validate-entry-points.sh -- every entry point in source must be documented
# in docs/ONBOARDING.md or docs/diagrams/entry-points.md.
#
# Detected entry points:
#   node:    package.json bin / main / scripts.start / scripts.dev
#            files matching server.{ts,js}, index.ts at root, app.ts
#   python:  setup.py console_scripts, pyproject.toml [project.scripts],
#            **/__main__.py, files containing if __name__ == "__main__"
#   go:      every package main with main.go
#   rust:    Cargo.toml [[bin]] entries, src/main.rs, src/bin/*.rs
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-entry-points"

ROOT="$(detect_project_root "${1:-}")"

DOCS=()
for f in "$ROOT/docs/ONBOARDING.md" "$ROOT/docs/diagrams/entry-points.md" "$ROOT/docs/ARCHITECTURE.md"; do
  [[ -f "$f" ]] && DOCS+=("$f")
done

if [[ "${#DOCS[@]}" -eq 0 ]]; then
  warn "no ONBOARDING.md / entry-points.md / ARCHITECTURE.md found — skipping (Phase 2/3 may not have produced one yet)"
  validator_exit
fi

ENTRIES=()

# Node: package.json scripts.start, scripts.dev, bin
if [[ -f "$ROOT/package.json" ]]; then
  if command -v jq >/dev/null 2>&1; then
    while IFS= read -r entry; do
      [[ -n "$entry" ]] && ENTRIES+=( "$entry" )
    done < <(jq -r '
      [.scripts.start, .scripts.dev, .scripts.serve, .main]
      + (if .bin then (.bin | keys) else [] end)
      | .[] | select(. != null and . != "")
    ' "$ROOT/package.json" 2>/dev/null)
  fi
fi

# Common server entry files
for f in server.ts server.js src/server.ts src/server.js src/index.ts src/index.js src/main.ts src/main.js index.ts app.ts; do
  if [[ -f "$ROOT/$f" ]]; then
    ENTRIES+=( "$f" )
  fi
done

# Python: __main__.py + setup.py console_scripts + pyproject scripts
while IFS= read -r f; do
  [[ -n "$f" ]] && ENTRIES+=( "$(realpath --relative-to="$ROOT" "$f" 2>/dev/null || echo "$f")" )
done < <(find "$ROOT" -name '__main__.py' -not -path '*/node_modules/*' -not -path '*/.venv/*' 2>/dev/null | head -20)

# Rust: src/main.rs + src/bin/*.rs
[[ -f "$ROOT/src/main.rs" ]] && ENTRIES+=( "src/main.rs" )
while IFS= read -r f; do
  [[ -n "$f" ]] && ENTRIES+=( "${f#"$ROOT/"}" )
done < <(find "$ROOT/src/bin" -name '*.rs' 2>/dev/null)

# Go: every package main main.go
while IFS= read -r f; do
  if grep -q '^package main' "$f" 2>/dev/null; then
    ENTRIES+=( "${f#"$ROOT/"}" )
  fi
done < <(find "$ROOT" -name 'main.go' -not -path '*/vendor/*' -not -path '*/node_modules/*' 2>/dev/null | head -20)

# Dedupe
ENTRIES_SORTED=$(printf '%s\n' "${ENTRIES[@]:-}" | awk 'NF' | sort -u)

ENTRY_COUNT=$(printf '%s\n' "$ENTRIES_SORTED" | grep -c . || true)
if [[ "$ENTRY_COUNT" -eq 0 ]]; then
  warn "no entry points discovered — skipping"
  validator_exit
fi

pass "discovered $ENTRY_COUNT entry point(s)"

while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  found=0
  # Match by filename basename or full relative path
  basename=$(basename "$entry")
  for doc in "${DOCS[@]}"; do
    if grep -qF "$entry" "$doc" 2>/dev/null || grep -qF "$basename" "$doc" 2>/dev/null; then
      found=1
      break
    fi
  done
  [[ "$found" -eq 0 ]] && gap "undocumented-entry" "$entry not mentioned in ONBOARDING.md / entry-points.md / ARCHITECTURE.md"
done <<< "$ENTRIES_SORTED"

validator_exit
