#!/usr/bin/env bash
#
# validate-dead-code.sh -- deterministic dead/stub/unutilized-code gate.
#
# Catches the cheap, high-confidence cases without an AST: unimplemented
# stubs, debug-only handlers, unreachable code, and (grep-based) exported
# functions with zero non-test references. Prefers real tools when present
# (knip / ts-prune / vulture / staticcheck) and falls back to grep.
#
# This is the script floor; the dead-code-detector agent does the verified,
# framework-aware pass. Together they implement the "no stub / no unutilized
# code" check.
#
# Exit: 0 = clean / 1 = findings / 2 = invocation error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-dead-code"
ROOT="$(detect_project_root "${1:-}")"

SRC_DIRS=()
for candidate in "src" "app" "lib" "packages" "services" "internal" "cmd"; do
  [[ -d "$ROOT/$candidate" ]] && SRC_DIRS+=("$ROOT/$candidate")
done
if [[ "${#SRC_DIRS[@]}" -eq 0 ]]; then
  warn "No source directory found — skipping"
  validator_exit
fi
note "Scanning: ${SRC_DIRS[*]}"

find_source_files() {
  find "${SRC_DIRS[@]}" -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
       -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) \
    -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" \
    -not -path "*/build/*" -not -path "*/vendor/*" -not -name "*.d.ts" \
    -not -name "*.test.*" -not -name "*.spec.*" 2>/dev/null || true
}

# -- Scan 1: explicit unimplemented stubs -----------------------------------
printf '\n[1] unimplemented stubs\n' >&2
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  m=$(grep -nE 'NotImplementedError|UnsupportedOperationException|todo!\(\)|unimplemented!\(\)|throw new Error\(["'"'"']([Nn]ot |un)?[Ii]mplemented' "$f" 2>/dev/null | head -3 || true)
  [[ -n "$m" ]] && gap "stub" "${f#"$ROOT/"}: explicit unimplemented stub — $m"
done < <(find_source_files)

# -- Scan 2: tool-based unused detection (best effort, advisory) ------------
printf '\n[2] unused exports/symbols (tooling)\n' >&2
RAN_TOOL=false
if [[ -f "$ROOT/package.json" ]]; then
  if command -v npx >/dev/null 2>&1 && npx --no-install knip --version >/dev/null 2>&1; then
    RAN_TOOL=true
    out=$(cd "$ROOT" && npx --no-install knip --reporter compact 2>/dev/null | grep -iE 'unused (export|file)' | head -20 || true)
    [[ -n "$out" ]] && while IFS= read -r line; do [[ -n "$line" ]] && gap "unused-export" "knip: $line"; done <<< "$out"
  elif command -v npx >/dev/null 2>&1 && npx --no-install ts-prune --version >/dev/null 2>&1; then
    RAN_TOOL=true
    out=$(cd "$ROOT" && npx --no-install ts-prune 2>/dev/null | grep -v '(used in module)' | head -20 || true)
    [[ -n "$out" ]] && while IFS= read -r line; do [[ -n "$line" ]] && gap "unused-export" "ts-prune: $line"; done <<< "$out"
  fi
fi
if command -v vulture >/dev/null 2>&1 && ls "$ROOT"/*.py "$ROOT"/**/*.py >/dev/null 2>&1; then
  RAN_TOOL=true
  out=$(cd "$ROOT" && vulture "${SRC_DIRS[@]}" --min-confidence 80 2>/dev/null | head -20 || true)
  [[ -n "$out" ]] && while IFS= read -r line; do [[ -n "$line" ]] && gap "unused-symbol" "vulture: $line"; done <<< "$out"
fi
if command -v staticcheck >/dev/null 2>&1 && [[ -f "$ROOT/go.mod" ]]; then
  RAN_TOOL=true
  out=$(cd "$ROOT" && staticcheck -checks U1000 ./... 2>/dev/null | head -20 || true)
  [[ -n "$out" ]] && while IFS= read -r line; do [[ -n "$line" ]] && gap "unused-symbol" "staticcheck: $line"; done <<< "$out"
fi
$RAN_TOOL || warn "no dead-code tool found (knip/ts-prune/vulture/staticcheck) — agent runs the grep fallback; install one for a deterministic gate"

# -- Scan 3: unreachable code after unconditional control flow --------------
printf '\n[3] unreachable code\n' >&2
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  # a return/throw/break/continue immediately followed by a non-brace, non-comment statement
  m=$(awk '
    /^[[:space:]]*(return|throw|break|continue)([[:space:];]|$)/ && !/=>/ { pend=NR; next }
    pend && NR==pend+1 && $0 !~ /^[[:space:]]*([}\)\];]|\/\/|\/\*|\*|#|case |default:|else)/ && NF>0 { print pend": unreachable after line "pend }
    { pend=0 }
  ' "$f" 2>/dev/null | head -2 || true)
  [[ -n "$m" ]] && gap "unreachable" "${f#"$ROOT/"}: $m"
done < <(find_source_files)

# -- Scan 4: constant-false guards ------------------------------------------
printf '\n[4] constant-false branches\n' >&2
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  m=$(grep -nE 'if[[:space:]]*\([[:space:]]*(false|0)[[:space:]]*\)|if[[:space:]]+False[[:space:]]*:' "$f" 2>/dev/null | head -2 || true)
  [[ -n "$m" ]] && gap "dead-branch" "${f#"$ROOT/"}: constant-false guard — $m"
done < <(find_source_files)

validator_exit
