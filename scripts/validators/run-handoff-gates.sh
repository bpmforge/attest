#!/usr/bin/env bash
#
# run-handoff-gates.sh — automated gate chain after a HANDOFF returns.
#
# Replaces the orchestrator's manual "read the manifest and decide" step with
# deterministic validators. Called by sdlc-lead from the resume protocol.
#
# Gates (in order; any failure aborts the rest):
#   1. Scope    — git writes confined to assigned directories
#   2. Manifest — completion manifest schema valid AND claims checked against
#                 disk (T27.2 v2: files exist, verify cites a real artifact,
#                 maker != verifier)
#   3. Coverage — domain-specific validator (optional)
#   4. Tracker  — tracker-worthy work changed a tracker file (T27.2; per-step
#                 mode against HEAD -- the working tree at resume time is
#                 exactly the diff validate-tracker-fresh.sh needs, unlike
#                 the phase-gate's static content checks where a --base ref
#                 comparison wouldn't have anything meaningful to diff against)
#   5. Runtime  — build + lint (optional, --runtime flag; coding-agent HANDOFFs)
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
RUNTIME=false
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
    --runtime)
      RUNTIME=true
      shift
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

# Resolve a relative --manifest path against --root, not the caller's CWD --
# a relative path only worked before by accident when CWD happened to equal
# ROOT. T27.2's manifest v2 stat-checks Files-produced paths against ROOT,
# so a manifest path that isn't ALSO resolved against ROOT is inconsistent
# with itself (found while adding the Tracker gate's own test fixture).
if [[ "$MANIFEST" != /* ]]; then
  MANIFEST="$ROOT/$MANIFEST"
fi

note "project root: $ROOT"
note "scope(s): ${SCOPE_DIRS[*]}"
note "manifest: $MANIFEST"
[[ -n "$COVERAGE" ]] && note "coverage: $COVERAGE" || note "coverage: (none)"

# ── Gate 1: scope ──────────────────────────────────────────────────────────
printf '\n%s== GATE: SCOPE ==%s\n' "$_BOLD" "$_RESET" >&2
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
printf '\n%s== GATE: MANIFEST ==%s\n' "$_BOLD" "$_RESET" >&2
if bash "$VALIDATORS_DIR/validate-completion-manifest.sh" "$MANIFEST" "$ROOT" > /dev/null 2>&1; then
  pass "manifest gate clean"
else
  bash "$VALIDATORS_DIR/validate-completion-manifest.sh" "$MANIFEST" "$ROOT" 2>&1 | tail -20 >&2 || true
  gap "manifest" "completion manifest invalid at $MANIFEST"
  validator_exit
fi

# ── Gate 2b: tech-stack (Law 4) ────────────────────────────────────────────
# Every direct dependency the manifest declares must appear in docs/TECH_STACK.md.
# Skips cleanly (exit 0) when no TECH_STACK.md exists yet (early-phase projects).
printf '\n%s== GATE: TECH-STACK ==%s\n' "$_BOLD" "$_RESET" >&2
if bash "$VALIDATORS_DIR/validate-tech-stack.sh" "$MANIFEST" "$ROOT" > /dev/null 2>&1; then
  pass "tech-stack gate clean"
else
  bash "$VALIDATORS_DIR/validate-tech-stack.sh" "$MANIFEST" "$ROOT" 2>&1 | tail -20 >&2 || true
  gap "tech-stack" "manifest declares a dependency not in docs/TECH_STACK.md (Law 4) -- add it to the stack doc or remove the dep"
  validator_exit
fi

# ── Gate 3: coverage (optional) ────────────────────────────────────────────
if [[ -n "$COVERAGE" ]]; then
  printf '\n%s== GATE: COVERAGE (%s) ==%s\n' "$_BOLD" "$COVERAGE" "$_RESET" >&2
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
  printf '\n%s== GATE: COVERAGE ==%s (skipped -- no --coverage arg)\n' "$_BOLD" "$_RESET" >&2
fi

# ── Gate 4: tracker (T27.2) ─────────────────────────────────────────────────
# Per-step mode (no --base): compares the working tree against HEAD, which at
# resume time IS the uncommitted footprint of the HANDOFF that just returned.
printf '\n%s== GATE: TRACKER ==%s\n' "$_BOLD" "$_RESET" >&2
if bash "$VALIDATORS_DIR/validate-tracker-fresh.sh" "$ROOT" > /dev/null 2>&1; then
  pass "tracker gate clean"
else
  bash "$VALIDATORS_DIR/validate-tracker-fresh.sh" "$ROOT" 2>&1 | tail -20 >&2 || true
  gap "tracker" "work changed but no tracker file updated -- see validate-tracker-fresh.sh output"
  validator_exit
fi

# ── Gate 5: runtime (only when --runtime passed — coding-agent handoffs) ───
if [[ "$RUNTIME" == "true" ]]; then
  printf '\n%s== GATE: RUNTIME (build + lint) ==%s\n' "$_BOLD" "$_RESET" >&2
  for rv in "validate-build.sh" "validate-lint.sh"; do
    rv_script="$VALIDATORS_DIR/$rv"
    if [[ ! -f "$rv_script" ]]; then
      gap "runtime" "$rv not found in $VALIDATORS_DIR"
      validator_exit
    fi
    if bash "$rv_script" "$ROOT" > /dev/null 2>&1; then
      pass "runtime gate clean ($rv)"
    else
      bash "$rv_script" "$ROOT" 2>&1 | tail -20 >&2 || true
      gap "runtime" "$rv failed — code must build and lint-clean before HANDOFF is accepted"
      validator_exit
    fi
  done
else
  printf '\n%s== GATE: RUNTIME ==%s (skipped -- no --runtime flag)\n' "$_BOLD" "$_RESET" >&2
fi

printf '\n%sAll gates passed%s\n' "$_GREEN" "$_RESET" >&2
validator_exit
