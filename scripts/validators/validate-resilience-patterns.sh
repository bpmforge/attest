#!/usr/bin/env bash
#
# validate-resilience-patterns.sh -- resilience must be designed at Phase 3,
# not discovered in the first outage.
#
# Doc-level checks ONLY: code-level scanning (fetch/axios/http calls without
# AbortSignal or timeout config) is too noisy to gate on -- every codebase
# has wrappers, defaults, and framework-level timeouts grep can't see -- so
# this validator deliberately checks docs/RESILIENCE.md content, not source.
#
#   presence    -- ARCHITECTURE.md names external dependencies but no
#                  docs/RESILIENCE.md exists -> warn (run reliability-engineer)
#   timeouts    -- timeout values stated for dependency interactions
#   retries     -- retry policy includes backoff/jitter AND a retry budget
#   breakers    -- circuit-breaker position present
#   degradation -- shed order / fallback / degradation behavior stated
#   targets     -- load-test targets carry actual numbers (req/s, users)
#
# Exit: 0 = spec complete / 1 = gaps / 2 = invocation error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-resilience-patterns"

ROOT="$(detect_project_root "${1:-}")"

DOC="$ROOT/docs/RESILIENCE.md"
ARCH="$ROOT/docs/ARCHITECTURE.md"

# 1. Presence -- architecture with external dependencies needs a resilience doc
if ! file_exists_nonempty "$DOC"; then
  if file_exists_nonempty "$ARCH" && grep -qiE 'postgres|redis|external|third.party|api' "$ARCH"; then
    warn "architecture has external dependencies but no docs/RESILIENCE.md — run reliability-engineer"
  else
    note "no docs/RESILIENCE.md and no external dependencies detected in docs/ARCHITECTURE.md — skipping"
  fi
  validator_exit
fi
note "Checking: ${DOC#"$ROOT/"}"

CONTENT="$(cat "$DOC")"

has() { grep -qiE "$1" <<< "$CONTENT"; }

# 2. Timeouts -- every dependency interaction gets a stated timeout value
if ! has 'timeout'; then
  gap "no-timeouts" "${DOC#"$ROOT/"}: no timeout content — every external dependency needs a stated timeout value; a dependency without a timeout is an outage waiting"
fi

# 3. Retries -- must include backoff/jitter, and a budget (retries multiply load)
if ! has 'retr(y|ies)'; then
  gap "no-retries" "${DOC#"$ROOT/"}: no retry policy — state backoff+jitter and a retry budget per dependency"
else
  if ! has '(backoff|jitter)'; then
    gap "thin-retries" "${DOC#"$ROOT/"}: retries mentioned without backoff/jitter — naive immediate retries amplify outages"
  fi
  if ! has '(budget|[^a-z]cap([^a-z]|$)|max[ _-]?(attempts|retries))'; then
    gap "no-retry-budget" "${DOC#"$ROOT/"}: retry policy without a retry budget — retries MULTIPLY load; state a budget/cap/max attempts"
  fi
fi

# 4. Circuit breakers -- stop hammering a dying dependency
if ! has 'circuit'; then
  gap "no-circuit-breaker" "${DOC#"$ROOT/"}: no circuit-breaker content — state open/half-open thresholds for dependencies that fail in bulk"
fi

# 5. Degradation -- shed order is designed, not discovered
if ! has '(degrad|shed|fallback)'; then
  gap "no-degradation" "${DOC#"$ROOT/"}: no degradation/shedding/fallback behavior — state which features shed first and what the user sees"
fi

# 6. Load-test targets -- numbers, not adjectives
if ! has '[0-9]+ ?(req|rps|users|concurrent)'; then
  gap "no-load-targets" "${DOC#"$ROOT/"}: no numeric load-test targets — derive req/s / users from the NFR numbers in SRS.md"
fi

validator_exit
