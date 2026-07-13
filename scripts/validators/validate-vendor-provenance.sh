#!/usr/bin/env bash
#
# validate-vendor-provenance.sh -- library-shaped reimplementation gate
# (T29.8, R-30, field lesson B-2).
#
# Field lesson: a design doc claimed "we use library X" for a vendored/
# copy-paste component set. What was actually shipped was AI-written from
# memory -- renamed variants, dropped sizes, an older template -- never
# pulled from the real library. A reviewing developer caught it as
# "reinventing the component lib." No step ever checked "is this actually X,
# or just X-shaped?"
#
# Provenance contract this validator enforces: any directory that vendors
# (copy-pastes, not a runtime dependency) code from an external library MUST
# carry a `VENDORED.md` manifest in that same directory recording where the
# files came from. `VENDORED.md` is a flat `key: value` file (deliberately
# not YAML frontmatter -- this repo's other manifests use that shape, but a
# flat key:value file needs no parser dependency and is trivial to diff):
#
#   source: shadcn/ui
#   tool: npx shadcn@latest add
#   version: 2.3.1
#   files: button.tsx, card.tsx, dialog.tsx
#
# ...or, when a file genuinely could not be pulled from upstream and was
# approximated from memory instead, the divergence must be declared rather
# than presented as an unqualified "we use X":
#
#   source: shadcn/ui
#   generated-from-memory: true
#   divergence: upstream CLI unavailable offline; button.tsx hand-written,
#     may not match the real button.tsx exactly
#
# Two gap classes:
#   1. undeclared-vendor-provenance -- a directory whose README/docs use
#      vendoring language ("vendored from", "copied from", "based on",
#      "adapted from" a named library) but has no VENDORED.md sibling. No
#      one recorded where the code actually came from.
#   2. Per-VENDORED.md gaps (missing-provenance / dropped-variant /
#      undeclared-variant / undeclared-divergence) -- see check_manifest().
#
# Usage: validate-vendor-provenance.sh [project-root] [scan-path]
# Exit: 0 = clean, 1 = gaps found, 2 = validator error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-vendor-provenance"

ROOT="$(detect_project_root "${1:-}")"
SCAN_PATH="${2:-$ROOT}"

VENDOR_LANGUAGE='vendored from|vendored copy of|copied from|based on the .* librar|adapted from'
COMPONENT_EXT_PATTERN='\.(tsx|jsx|ts|js|vue|svelte)$'

# manifest_field <file> <key>  -- value of the first "key: value" line, or
# empty if absent. A missing field is an expected, non-error outcome -- the
# `|| true` matters because _lib.sh runs under `set -eo pipefail`, and
# without it grep's no-match exit status (1) would abort the whole script
# the first time an optional field (e.g. "divergence" on a manifest that
# doesn't need one) is looked up.
manifest_field() {
  local file="$1" key="$2"
  grep -m1 -E "^${key}:[[:space:]]*" "$file" 2>/dev/null | sed -E "s/^${key}:[[:space:]]*//" || true
}

check_manifest() {
  local manifest="$1"
  local dir rel_dir rel_manifest
  dir="$(dirname "$manifest")"
  rel_dir="${dir#"$ROOT"/}"
  rel_manifest="${manifest#"$ROOT"/}"

  local source_field version_field generated_from_memory divergence files_field
  source_field="$(manifest_field "$manifest" "source")"
  version_field="$(manifest_field "$manifest" "version")"
  generated_from_memory="$(manifest_field "$manifest" "generated-from-memory")"
  divergence="$(manifest_field "$manifest" "divergence")"
  files_field="$(manifest_field "$manifest" "files")"

  if [[ -z "$source_field" ]]; then
    gap "missing-provenance" "$rel_manifest: no 'source' field recorded -- which library is this vendored from?"
  fi

  if [[ "$generated_from_memory" == "true" ]]; then
    if [[ -z "$divergence" ]]; then
      gap "undeclared-divergence" "$rel_manifest: 'generated-from-memory: true' set but no 'divergence' note explaining what may not match upstream"
    fi
    # Memory-generated vendoring has no real upstream to diff against --
    # the declared-divergence path is the whole point, so skip the
    # file/variant comparison below for this manifest.
    return
  fi

  if [[ -z "$version_field" ]]; then
    gap "missing-provenance" "$rel_manifest: no 'version' field recorded -- can't tell if this has drifted from a newer upstream release"
  fi

  if [[ -z "$files_field" ]]; then
    # No files: list to check against disk -- provenance fields alone
    # (source/version) still satisfy the manifest requirement.
    return
  fi

  # Declared file list: comma-separated, trim whitespace.
  local declared=()
  IFS=',' read -ra declared_raw <<< "$files_field"
  local f trimmed
  for f in "${declared_raw[@]}"; do
    trimmed="$(echo "$f" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    [[ -n "$trimmed" ]] && declared+=("$trimmed")
  done

  # Dropped variants: declared but missing from disk.
  for f in "${declared[@]}"; do
    if [[ ! -f "$dir/$f" ]]; then
      gap "dropped-variant" "$rel_dir: '$f' is declared in VENDORED.md but missing on disk -- dropped since it was vendored"
    fi
  done

  # Undeclared variants: present on disk, component-shaped, not declared.
  # (Renamed variants show up as one dropped-variant + one undeclared-variant
  # pair -- the old declared name is gone, a new undeclared name appeared.)
  # NOTE: deliberately not `find -regextype posix-extended` -- that flag is
  # GNU-find-only and silently errors out on BSD/macOS find (the exact
  # cross-platform trap T22.19/T29.9 already hit with regex idioms in this
  # repo). Plain `find -maxdepth 1 -type f` + a bash [[ =~ ]] filter works
  # identically on both.
  local disk_file base declared_match
  while IFS= read -r disk_file; do
    [[ -z "$disk_file" ]] && continue
    base="$(basename "$disk_file")"
    [[ "$base" == "VENDORED.md" ]] && continue
    [[ "$base" =~ $COMPONENT_EXT_PATTERN ]] || continue
    declared_match=0
    for f in "${declared[@]}"; do
      [[ "$f" == "$base" ]] && declared_match=1 && break
    done
    if [[ "$declared_match" -eq 0 ]]; then
      gap "undeclared-variant" "$rel_dir: '$base' is on disk but not declared in VENDORED.md -- renamed or added without updating provenance"
    fi
  done < <(find "$dir" -maxdepth 1 -type f 2>/dev/null)
}

manifests_checked=0
while IFS= read -r -d '' manifest; do
  case "$manifest" in
    */node_modules/*|*/.git/*|*/.worktrees/*|*/dist/*) continue ;;
  esac
  manifests_checked=$((manifests_checked + 1))
  check_manifest "$manifest"
done < <(find "$SCAN_PATH" -name "VENDORED.md" -print0 2>/dev/null)

# Undeclared vendoring: a directory's own README claiming vendoring
# language with no VENDORED.md sibling. Deliberately scoped to README.md
# only (not every markdown file) -- this repo's own prompt docs (agents/,
# references/) discuss vendoring as a CONCEPT (e.g. this rule's own text in
# ANTI_SLOP_RULES.md) without the directory itself being vendored code; a
# broader `*.md` scan false-positived on exactly that self-reference the
# first time this validator ran against the real repo. A directory's own
# README is the actual claim-of-provenance site.
readmes_scanned=0
while IFS= read -r -d '' readme; do
  case "$readme" in
    */node_modules/*|*/.git/*|*/.worktrees/*|*/dist/*) continue ;;
  esac
  readmes_scanned=$((readmes_scanned + 1))
  dir="$(dirname "$readme")"
  if grep -qiE "$VENDOR_LANGUAGE" "$readme" 2>/dev/null && [[ ! -f "$dir/VENDORED.md" ]]; then
    rel="${readme#"$ROOT"/}"
    gap "undeclared-vendor-provenance" "$rel: describes code as vendored/copied/based-on/adapted-from a library but no VENDORED.md exists in $( basename "$dir")/ -- source and version were never recorded"
  fi
done < <(find "$SCAN_PATH" -iname "README.md" -print0 2>/dev/null)

if [[ "$GAP_COUNT" -eq 0 ]]; then
  pass "checked ${manifests_checked} VENDORED.md manifest(s), scanned ${readmes_scanned} doc file(s) for undeclared vendoring language -- no gaps found"
fi

validator_exit
