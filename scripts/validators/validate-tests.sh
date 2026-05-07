#!/usr/bin/env bash
#
# validate-tests.sh -- run the project's test suite and verify it exits 0.
#
# Auto-detects per stack; override via .sdlc/sdlc.json "test" key.
#
# Playwright special handling:
#   - Runs with --reporter=json,html,list so test-results.json is produced
#   - validate-tests-mapping.sh uses that file for UC-level pass/fail verdicts
#   - If playwright.config.ts already has JSON reporter, adds list only
#
# Writes docs/reviews/RUNTIME_tests_<date>.md with verdict, tail of output,
# and parsed pass/fail counts where the runner format is recognizable
# (vitest, jest, pytest, cargo test, go test, playwright).
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib_sdlc_config.sh"

validator_init "validate-tests"

ROOT="$(detect_project_root "${1:-}")"

# -- Playwright fast-path: prefer explicit playwright run over generic test cmd
PLAYWRIGHT_CONFIG=""
for candidate in \
  "$ROOT/playwright.config.ts" \
  "$ROOT/playwright.config.js" \
  "$ROOT/playwright.config.mts"; do
  [[ -f "$candidate" ]] && PLAYWRIGHT_CONFIG="$candidate" && break
done

if [[ -n "$PLAYWRIGHT_CONFIG" ]]; then
  # Check if playwright is installed
  if ! (cd "$ROOT" && npx playwright --version >/dev/null 2>&1); then
    gap "playwright-not-installed" "playwright.config.ts found but 'npx playwright' not available — run: npm install && npx playwright install"
    validator_exit
  fi

  # Determine reporter flags: add json if not already in config
  REPORTER_FLAGS=""
  if grep -qE "reporter.*json|json.*outputFile|'json'|\"json\"" "$PLAYWRIGHT_CONFIG" 2>/dev/null; then
    # Config already has JSON reporter — just add list for readable CI output
    REPORTER_FLAGS="--reporter=list"
    note "playwright: JSON reporter in config — using --reporter=list for CI output"
  else
    # Inject JSON reporter so validate-tests-mapping.sh gets UC-level verdicts
    REPORTER_FLAGS="--reporter=json,html,list"
    note "playwright: injecting --reporter=json,html,list (add JSON reporter to playwright.config.ts to suppress this)"
  fi

  note "playwright config: ${PLAYWRIGHT_CONFIG#"$ROOT/"}"

  LOG=$(mktemp -t "pw-tests.XXXXXX")
  trap 'rm -f "$LOG"' EXIT

  # Run playwright — JSON goes to test-results.json (playwright default) or config path
  JSON_OUT="$ROOT/test-results.json"
  if grep -qE "outputFile.*['\"](.+\.json)['\"]" "$PLAYWRIGHT_CONFIG" 2>/dev/null; then
    JSON_PATH=$(grep -oE "outputFile.*['\"]([^'\"]+\.json)['\"]" "$PLAYWRIGHT_CONFIG" \
      | grep -oE "['\"][^'\"]+\.json['\"]" | tr -d "'\"" | head -1 || true)
    [[ -n "$JSON_PATH" ]] && JSON_OUT="$ROOT/$JSON_PATH"
  fi

  (cd "$ROOT" && npx playwright test $REPORTER_FLAGS 2>&1) | tee "$LOG"
  RC=${PIPESTATUS[0]}

  TAIL=$(tail -80 "$LOG")

  # Parse playwright output: "N passed (Xm Ys)" or "N failed"
  PASS_COUNT=$(grep -oE '[0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
  FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)

  if [[ "$RC" -eq 0 ]]; then
    pass "playwright tests passed (${PASS_COUNT:-?} passed${FAIL_COUNT:+, $FAIL_COUNT failed})"
    [[ -f "$JSON_OUT" ]] && pass "test-results.json written: ${JSON_OUT#"$ROOT/"}"
    write_runtime_report "$ROOT" "tests" "PASS — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-0} failed (playwright)" "$TAIL" >/dev/null
  else
    gap "tests-failed" "playwright: rc=$RC — ${FAIL_COUNT:-?} failed"
    [[ -f "$JSON_OUT" ]] && note "test-results.json written despite failures: ${JSON_OUT#"$ROOT/"}"
    write_runtime_report "$ROOT" "tests" "FAIL — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-?} failed (playwright)" "$TAIL" >/dev/null
  fi

  validator_exit
fi

# -- Generic test runner for non-Playwright stacks -------------------------
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

# For jest/vitest: append --json flag if not already producing results file
RESULTS_FILE="$ROOT/test-results.json"
if [[ "$STACK" == "node" ]] && printf '%s' "$CMD" | grep -qE "jest|vitest"; then
  if [[ ! -f "$RESULTS_FILE" ]]; then
    if printf '%s' "$CMD" | grep -qiE "jest"; then
      CMD="$CMD --json --outputFile=test-results.json"
      note "jest: adding --json --outputFile=test-results.json for UC-level verdict tracking"
    elif printf '%s' "$CMD" | grep -qiE "vitest"; then
      CMD="$CMD --reporter=json --outputFile=test-results.json"
      note "vitest: adding --reporter=json for UC-level verdict tracking"
    fi
  fi
fi

note "stack=$STACK test='$CMD'"

LOG=$(mktemp -t "tests.XXXXXX")
trap 'rm -f "$LOG"' EXIT

(cd "$ROOT" && eval "$CMD") >"$LOG" 2>&1
RC=$?

TAIL=$(tail -80 "$LOG")

# Parse counts
PASS_COUNT=""
FAIL_COUNT=""
PASS_COUNT=$(grep -oE '[0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
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
