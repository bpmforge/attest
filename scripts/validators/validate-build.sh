#!/usr/bin/env bash
#
# validate-build.sh -- run the project's build command and verify it exits 0.
#
# Auto-detects per stack (node/python/rust/go); override via .sdlc/sdlc.json
# top-level "build" key.
#
# Writes docs/reviews/RUNTIME_build_<date>.md with the verdict and tail of
# the build output. Exits 0 (clean) / 1 (build failed) / 2 (validator error).
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib_sdlc_config.sh"

validator_init "validate-build"

ROOT="$(detect_project_root "${1:-}")"
STACK=$(detect_stack "$ROOT")

if [[ "$STACK" == "unknown" ]]; then
  warn "no recognized build manifest in $ROOT (package.json, pyproject.toml, Cargo.toml, go.mod) — skipping"
  validator_exit
fi

DEFAULT=$(default_build "$STACK")
CMD=$(resolve_command "$ROOT" "build" "$DEFAULT")

if [[ -z "$CMD" ]]; then
  warn "stack=$STACK has no default build command — skipping (configure 'build' in .sdlc/sdlc.json to enable)"
  validator_exit
fi

if ! command_runnable "$STACK" "build" "$CMD" "$ROOT"; then
  warn "build command '$CMD' not configured for this project — skipping"
  validator_exit
fi

note "stack=$STACK build='$CMD'"

LOG=$(mktemp -t "build.XXXXXX")
trap 'rm -f "$LOG"' EXIT

(cd "$ROOT" && eval "$CMD") >"$LOG" 2>&1
RC=$?

TAIL=$(tail -50 "$LOG")
if [[ "$RC" -eq 0 ]]; then
  pass "build clean (rc=0, command: $CMD)"
  write_runtime_report "$ROOT" "build" "PASS" "$TAIL" >/dev/null
else
  gap "build-failed" "rc=$RC for: $CMD — see RUNTIME report"
  write_runtime_report "$ROOT" "build" "FAIL" "$TAIL" >/dev/null
fi

validator_exit
