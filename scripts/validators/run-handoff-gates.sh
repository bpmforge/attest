#!/usr/bin/env bash
#
# run-handoff-gates.sh — three-gate automated check after a HANDOFF returns.
#
# Replaces the orchestrator's manual "read the manifest and decide" step with
# deterministic validators. Called by sdlc-lead from the resume protocol.
#
# Gates (in order; any failure aborts the rest):
#   1. Scope    — git writes confined to assigned directories
#   2. Manifest — completion manifest schema valid
#   3. Coverage — domain-specific validator (optional)
#
# Usage:
#   run-handoff-gates.sh \
#     --scope <dir1> [--scope <dir2> ...] \
#     --manifest <path> \
#     [--coverage <validator-name>] \
#     [--root <project-root>]
#
# Examples:
#   # Standard HANDOFF — scope + manifest only
#   run-handoff-gates.sh --scope src/auth --manifest docs/reviews/MANIFEST_auth_2026-04-24.md
#
#   # Architecture HANDOFF — also run coverage
#   run-handoff-gates.sh --scope docs \
#     --manifest docs/reviews/MANIFEST_arch_2026-04-24.md \
#     --coverage validate-architecture.sh
#
#   # Parallel wave — check per-module
#   run-handoff-gates.sh --scope src/auth --scope tests/auth \
#     --manifest docs/reviews/MANIFEST_auth_2026-04-24.md \
#     --coverage validate-api-coverage.sh
#
# Exit: 0 all gates pass / 1 one or more gates fail / 2 invocation error
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "run-handoff-gates"

# ── parse args ─────────────────────────────────────────────────────────────
SCOPE_DIRS=()
MANIFEST=""
COVERAGE=""
PROJECT_ROOT_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE_DIRS+=("$2")
      shift 2
      ;;
    --manifest)
      MANIFEST="$2"
      shift 2
      ;;
    --coverage)
      COVERAGE="$2"
      shift 2
      ;;
    --root)
      PROJECT_ROOT_ARG="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '3,31p' "$0" | sed 's/^# //; s/^#$//'
      exit 0
      ;;
    *)
      fatal "unknown arg: $1"
      ;;
  esac
done

if [[ "${#SCOPE_DIRS[@]}" -eq 0 ]]; then
  fatal "missing --scope <dir>. At least one scope directory required."
fi
if [[ -z "$MANIFEST" ]]; then
  fatal "missing --manifest <path>"
fi

ROOT="$(detect_project_root "$PROJECT_ROOT_ARG")"
VALIDATORS_DIR="$(dirname "${BASH_SOURCE[0]}")"

note "project root: $ROOT"
note "scope(s): ${SCOPE_DIRS[*]}"
note "manifest: $MANIFEST"
[[ -n "$COVERAGE" ]] && note "coverage: $COVERAGE" || note "coverage: (none)"

# ── Gate 1: scope ──────────────────────────────────────────────────────────
printf '\n%s== GATE 1/3: SCOPE ==%s\n' "$_BOLD" "$_RESET" >&2
scope_args=()
for d in "${SCOPE_DIRS[@]}"; do
  scope_args+=("$d")
done
if bash "$VALIDATORS_DIR/validate-scope.sh" "${scope_args[@]}" --root "$ROOT" > /dev/null 2>&1; then
  pass "scope gate clean"
else
  bash "$VALIDATORS_DIR/validate-scope.sh" "${scope_args[@]}" --root "$ROOT" 2>&1 | tail -20 >&2 || true
  gap "scope" "git writes outside assigned scope (${SCOPE_DIRS[*]})"
  validator_exit
fi

# ── Gate 2: manifest ───────────────────────────────────────────────────────
printf '\n%s== GATE 2/3: MANIFEST ==%s\n' "$_BOLD" "$_RESET" >&2
if bash "$VALIDATORS_DIR/validate-completion-manifest.sh" "$MANIFEST" > /dev/null 2>&1; then
  pass "manifest gate clean"
else
  bash "$VALIDATORS_DIR/validate-completion-manifest.sh" "$MANIFEST" 2>&1 | tail -20 >&2 || true
  gap "manifest" "completion manifest schema invalid at $MANIFEST"
  validator_exit
fi

# ── Gate 3: coverage (optional) ────────────────────────────────────────────
if [[ -n "$COVERAGE" ]]; then
  printf '\n%s== GATE 3/3: COVERAGE (%s) ==%s\n' "$_BOLD" "$COVERAGE" "$_RESET" >&2
  cov_script="$VALIDATORS_DIR/$COVERAGE"
  if [[ ! -f "$cov_script" ]]; then
    gap "coverage" "coverage validator not found: $COVERAGE"
    validator_exit
  fi
  if bash "$cov_script" "$ROOT" > /dev/null 2>&1; then
    pass "coverage gate clean ($COVERAGE)"
  else
    bash "$cov_script" "$ROOT" 2>&1 | tail -30 >&2 || true
    gap "coverage" "$COVERAGE reported gaps"
    validator_exit
  fi
else
  printf '\n%s== GATE 3/3: COVERAGE ==%s (skipped -- no --coverage arg)\n' "$_BOLD" "$_RESET" >&2
fi

printf '\n%sAll gates passed%s\n' "$_GREEN" "$_RESET" >&2
validator_exit
