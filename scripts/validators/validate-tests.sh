#!/usr/bin/env bash
#
# validate-tests.sh -- run the project's test suite and verify it exits 0.
#
# Auto-detects per stack; override via .sdlc/sdlc.json "test" key.
#
# Writes docs/reviews/RUNTIME_tests_<date>.md with verdict, tail of output,
# and parsed pass/fail counts where the runner format is recognizable
# (vitest, jest, pytest, cargo test, go test).
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib_sdlc_config.sh"

validator_init "validate-tests"

ROOT="$(detect_project_root "${1:-}")"
STACK=$(detect_stack "$ROOT")

if [[ "$STACK" == "unknown" ]]; then
  warn "no recognized test runner manifest in $ROOT — skipping"
  validator_exit
fi

DEFAULT=$(default_test "$STACK")
CMD=$(resolve_command "$ROOT" "test" "$DEFAULT")

if [[ -z "$CMD" ]]; then
  gap "no-test-command" "stack=$STACK has no default test command and no override"
  validator_exit
fi

if ! command_runnable "$STACK" "test" "$CMD" "$ROOT"; then
  gap "no-test-command" "test command '$CMD' not configured — every project must have tests by phase 4"
  validator_exit
fi

note "stack=$STACK test='$CMD'"

LOG=$(mktemp -t "tests.XXXXXX")
trap 'rm -f "$LOG"' EXIT

(cd "$ROOT" && eval "$CMD") >"$LOG" 2>&1
RC=$?

TAIL=$(tail -80 "$LOG")

# Parse counts where possible
PASS_COUNT=""
FAIL_COUNT=""
# vitest / jest: "Tests: N passed, M failed" or "N passed, M failed"
PASS_COUNT=$(grep -oE '[0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
# pytest: "X passed, Y failed in Zs"
[[ -z "$PASS_COUNT" ]] && PASS_COUNT=$(grep -oE '=+ [0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
[[ -z "$FAIL_COUNT" ]] && FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)

if [[ "$RC" -eq 0 ]]; then
  pass "tests passed (rc=0${PASS_COUNT:+, $PASS_COUNT passed}${FAIL_COUNT:+, $FAIL_COUNT failed})"
  write_runtime_report "$ROOT" "tests" "PASS — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-0} failed" "$TAIL" >/dev/null
else
  gap "tests-failed" "rc=$RC for: $CMD — ${FAIL_COUNT:-?} failed"
  write_runtime_report "$ROOT" "tests" "FAIL — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-?} failed" "$TAIL" >/dev/null
fi

validator_exit
