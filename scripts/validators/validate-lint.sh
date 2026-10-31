#!/usr/bin/env bash
#
# validate-lint.sh -- run lint + typecheck and verify both exit 0.
#
# Auto-detects per stack. Override via .sdlc/sdlc.json keys:
#   "lint":      "eslint ."
#   "typecheck": "tsc --noEmit"
#
# Either failure is a gap. Writes docs/reviews/RUNTIME_lint_<date>.md with
# the verdict and tail output of both runs.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib_sdlc_config.sh"

validator_parse_flags "$@"; set -- ${VALIDATOR_ARGS[@]+"${VALIDATOR_ARGS[@]}"}
validator_init "validate-lint"

ROOT="$(detect_project_root "${1:-}")"
validator_scope_init
STACK=$(detect_stack "$ROOT")

if [[ "$STACK" == "unknown" ]]; then
  warn "no recognized lint config in $ROOT — skipping"
  validator_exit
fi

LINT_CMD=$(resolve_command "$ROOT" "lint" "$(default_lint "$STACK")")
TYPECHECK_CMD=$(resolve_command "$ROOT" "typecheck" "$(default_typecheck "$STACK")")

LOG=$(mktemp -t "lint.XXXXXX")
trap 'rm -f "$LOG"' EXIT

run_step() {
  local label="$1"
  local cmd="$2"
  [[ -z "$cmd" ]] && return 0

  if ! command_runnable "$STACK" "$label" "$cmd" "$ROOT"; then
    warn "$label command '$cmd' not configured — skipping"
    return 0
  fi

  printf '\n=== %s: %s ===\n' "$label" "$cmd" >> "$LOG"
  if (cd "$ROOT" && eval "$cmd") >> "$LOG" 2>&1; then
    pass "$label clean ($cmd)"
    return 0
  else
    local rc=$?
    gap "${label}-failed" "rc=$rc for: $cmd"
    return 1
  fi
}

# --since / VALIDATE_SINCE: lint only the changed lintable files. The command can
# opt in with a {files} token; common "<linter> ... ." commands (eslint, ruff
# check, biome check/lint) get their trailing "." swapped for the file list.
# Anything else (npm run lint, ...) runs unchanged and receives the list in
# $VALIDATE_CHANGED_FILES. A typecheck is whole-program, so it runs whenever any
# lintable file changed and is skipped when none did (its result cannot move).
SCOPED_FILES=()
if [[ "$VALIDATOR_SCOPED" -eq 1 ]]; then
  while IFS= read -r f; do
    [[ -n "$f" && -f "$ROOT/$f" ]] && SCOPED_FILES+=("$f")
  done < <(grep -E '\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go)$' "$VALIDATOR_CHANGED_FILE" || true)
  validator_scope_json ${SCOPED_FILES[@]+"${SCOPED_FILES[@]}"}
  if [[ "${#SCOPED_FILES[@]}" -eq 0 ]]; then
    pass "no lintable files changed since ${VALIDATE_SINCE} -- lint + typecheck skipped"
    validator_exit
  fi
  _quoted=""
  for f in "${SCOPED_FILES[@]}"; do _quoted="$_quoted $(printf '%q' "$f")"; done
  _quoted="${_quoted# }"
  export VALIDATE_CHANGED_FILES
  VALIDATE_CHANGED_FILES="$(printf '%s\n' "${SCOPED_FILES[@]}")"
  _lint_re='^(npx[[:space:]]+)?(eslint|ruff[[:space:]]+check|biome[[:space:]]+(check|lint))[[:space:]].*[[:space:]]\.$'
  if [[ "$LINT_CMD" == *"{files}"* ]]; then
    LINT_CMD="${LINT_CMD//\{files\}/$_quoted}"
  elif [[ "$LINT_CMD" =~ $_lint_re ]]; then
    LINT_CMD="${LINT_CMD% .} $_quoted"
  fi
  TYPECHECK_CMD="${TYPECHECK_CMD//\{files\}/$_quoted}"
fi

note "stack=$STACK lint='$LINT_CMD' typecheck='$TYPECHECK_CMD'"

# Run both unconditionally — we want both reports even if first fails
LINT_OK=0
TYPE_OK=0
run_step "lint" "$LINT_CMD" && LINT_OK=1
run_step "typecheck" "$TYPECHECK_CMD" && TYPE_OK=1

TAIL=$(tail -100 "$LOG")
if [[ "$LINT_OK" -eq 1 && "$TYPE_OK" -eq 1 ]]; then
  write_runtime_report "$ROOT" "lint" "PASS" "$TAIL" >/dev/null
else
  write_runtime_report "$ROOT" "lint" "FAIL — lint=$LINT_OK typecheck=$TYPE_OK" "$TAIL" >/dev/null
fi

validator_exit
