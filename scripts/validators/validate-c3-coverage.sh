#!/usr/bin/env bash
#
# validate-c3-coverage.sh -- every top-level src/ subdirectory must appear in
# the C3 component diagram (in ARCHITECTURE.md or docs/diagrams/c3-components.md).
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-c3-coverage"

ROOT="$(detect_project_root "${1:-}")"

# Source-of-truth files (ANY may contain C3 entries)
SOURCES=()
for f in "$ROOT/docs/ARCHITECTURE.md" "$ROOT/docs/diagrams/c3-components.md" "$ROOT/docs/diagrams/c3-component.md"; do
  [[ -f "$f" ]] && SOURCES+=("$f")
done

if [[ "${#SOURCES[@]}" -eq 0 ]]; then
  warn "no ARCHITECTURE.md or c3-components.md found — skipping (Phase 3 may not have produced one yet)"
  validator_exit
fi

# Find candidate src dir
SRC_ROOT=""
for candidate in src app server internal pkg packages services modules; do
  if [[ -d "$ROOT/$candidate" ]]; then
    SRC_ROOT="$ROOT/$candidate"
    break
  fi
done

if [[ -z "$SRC_ROOT" ]]; then
  warn "no source directory found (src/, app/, server/, internal/, pkg/, packages/, services/, modules/) — skipping"
  validator_exit
fi

# Enumerate top-level subdirs of SRC_ROOT
SUBDIRS=()
while IFS= read -r d; do
  [[ -z "$d" ]] && continue
  SUBDIRS+=( "$(basename "$d")" )
done < <(find "$SRC_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -not -name 'node_modules' \
  -not -name '__tests__' \
  -not -name '__mocks__' \
  -not -name '.cache' 2>/dev/null | sort)

if [[ "${#SUBDIRS[@]}" -eq 0 ]]; then
  warn "no subdirectories under $SRC_ROOT — skipping"
  validator_exit
fi

pass "found ${#SUBDIRS[@]} subdirectory module(s) in $SRC_ROOT"

for module in "${SUBDIRS[@]}"; do
  found=0
  for src in "${SOURCES[@]}"; do
    # Match the bare module name as a word
    if grep -qiE "\b${module}\b" "$src" 2>/dev/null; then
      found=1
      break
    fi
  done
  [[ "$found" -eq 0 ]] && gap "uncovered-module" "$module not referenced in C3 component diagram"
done

validator_exit
