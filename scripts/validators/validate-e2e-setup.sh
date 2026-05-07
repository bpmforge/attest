#!/usr/bin/env bash
#
# validate-e2e-setup.sh -- checks E2E test infrastructure is properly configured
# for gate-level traceability (UC-level pass/fail from test results).
#
# Checks:
#   1. A recognized E2E config file exists (playwright/cypress/vitest)
#   2. Playwright config: JSON reporter is configured (enables validate-tests-mapping.sh)
#   3. Playwright config: retries, screenshot-on-failure, baseURL present
#   4. Auth fixture file exists (storageState or equivalent)
#   5. Page objects or fixtures directory exists
#   6. CI workflow has an E2E test step
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-e2e-setup"

ROOT="$(detect_project_root "${1:-}")"

# -- 1. Detect E2E framework -----------------------------------------------
E2E_FRAMEWORK=""
E2E_CONFIG=""

for candidate in \
  "$ROOT/playwright.config.ts" \
  "$ROOT/playwright.config.js" \
  "$ROOT/playwright.config.mts"; do
  if [[ -f "$candidate" ]]; then
    E2E_FRAMEWORK="playwright"
    E2E_CONFIG="$candidate"
    break
  fi
done

if [[ -z "$E2E_FRAMEWORK" ]]; then
  for candidate in \
    "$ROOT/cypress.config.ts" \
    "$ROOT/cypress.config.js" \
    "$ROOT/cypress.config.mjs"; do
    if [[ -f "$candidate" ]]; then
      E2E_FRAMEWORK="cypress"
      E2E_CONFIG="$candidate"
      break
    fi
  done
fi

if [[ -z "$E2E_FRAMEWORK" ]]; then
  for candidate in \
    "$ROOT/vitest.config.ts" \
    "$ROOT/vitest.config.js" \
    "$ROOT/vite.config.ts"; do
    if [[ -f "$candidate" ]]; then
      # Only count as E2E if e2e directory or e2e test files exist
      if find "$ROOT" -maxdepth 3 -type f -name '*.spec.*' -path '*/e2e/*' 2>/dev/null | head -1 | grep -q .; then
        E2E_FRAMEWORK="vitest"
        E2E_CONFIG="$candidate"
        break
      fi
    fi
  done
fi

if [[ -z "$E2E_FRAMEWORK" ]]; then
  gap "no-e2e-config" "no E2E config found (playwright.config.ts, cypress.config.ts, vitest with e2e/) — set up E2E testing infrastructure before Phase 4 gate"
  validator_exit
fi

pass "E2E framework: $E2E_FRAMEWORK (${E2E_CONFIG#"$ROOT/"})"

# -- Playwright-specific checks --------------------------------------------
if [[ "$E2E_FRAMEWORK" == "playwright" ]]; then

  # 2. JSON reporter configured (required for validate-tests-mapping.sh UC verdicts)
  if grep -qE "reporter.*json|json.*outputFile|'json'|\"json\"" "$E2E_CONFIG" 2>/dev/null; then
    pass "playwright: JSON reporter configured"
  else
    gap "no-json-reporter" "playwright.config.ts does not configure the JSON reporter — add: reporter: [['json', { outputFile: 'test-results.json' }], ...] so validate-tests-mapping.sh can produce UC-level verdicts"
  fi

  # 3. retries configured
  if grep -qE "retries\s*:" "$E2E_CONFIG" 2>/dev/null; then
    pass "playwright: retries configured"
  else
    gap "no-retries" "playwright.config.ts has no retries setting — add: retries: process.env.CI ? 2 : 0"
  fi

  # 4. screenshot on failure
  if grep -qE "screenshot\s*:" "$E2E_CONFIG" 2>/dev/null; then
    pass "playwright: screenshot configured"
  else
    gap "no-screenshot" "playwright.config.ts has no screenshot setting — add: use: { screenshot: 'only-on-failure' }"
  fi

  # 5. baseURL configured
  if grep -qE "baseURL\s*:" "$E2E_CONFIG" 2>/dev/null; then
    pass "playwright: baseURL configured"
  else
    gap "no-baseurl" "playwright.config.ts has no baseURL — add: use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000' }"
  fi

  # Auth fixture / storageState
  auth_found=0
  for auth_candidate in \
    "$ROOT/e2e/.auth" \
    "$ROOT/e2e/auth.setup.ts" \
    "$ROOT/e2e/auth.setup.js" \
    "$ROOT/tests/.auth" \
    "$ROOT/tests/auth.setup.ts" \
    "$ROOT/playwright/.auth"; do
    if [[ -e "$auth_candidate" ]]; then
      auth_found=1
      pass "playwright: auth fixture found (${auth_candidate#"$ROOT/"})"
      break
    fi
  done
  if [[ "$auth_found" -eq 0 ]]; then
    # Check if any spec references storageState
    if grep -rqE "storageState" "$ROOT/e2e" "$ROOT/tests" 2>/dev/null; then
      pass "playwright: storageState referenced in tests"
    else
      gap "no-auth-fixture" "no auth fixture found (e2e/auth.setup.ts or e2e/.auth/) — add a setup project that saves storageState so tests skip the login UI on every run"
    fi
  fi

  # Page object model or fixtures directory
  pom_found=0
  for pom_dir in \
    "$ROOT/e2e/pages" \
    "$ROOT/e2e/fixtures" \
    "$ROOT/tests/pages" \
    "$ROOT/tests/fixtures" \
    "$ROOT/playwright/pages"; do
    if [[ -d "$pom_dir" ]]; then
      pom_found=1
      pass "playwright: POM/fixtures directory found (${pom_dir#"$ROOT/"})"
      break
    fi
  done
  if [[ "$pom_found" -eq 0 ]]; then
    # Check for test.extend() custom fixtures pattern
    if grep -rqE "test\.extend|base\.extend" "$ROOT/e2e" "$ROOT/tests" 2>/dev/null; then
      pass "playwright: test.extend() custom fixtures in use"
    else
      gap "no-page-objects" "no Page Object Model directory (e2e/pages/, e2e/fixtures/) and no test.extend() fixtures found — complex UIs should use POM to decouple selectors from test logic"
    fi
  fi

fi

# -- Cypress-specific checks -----------------------------------------------
if [[ "$E2E_FRAMEWORK" == "cypress" ]]; then

  if grep -qE "reporter|reporter-options" "$E2E_CONFIG" 2>/dev/null; then
    pass "cypress: reporter configured"
  else
    gap "no-reporter" "cypress.config.ts has no reporter configured — add mochawesome or cypress-junit-reporter to produce machine-readable results"
  fi

  if [[ -d "$ROOT/cypress/support" ]]; then
    pass "cypress: support directory found"
  else
    gap "no-support-dir" "cypress/support/ directory not found — add commands.ts and e2e.ts for shared helpers"
  fi

  if [[ -d "$ROOT/cypress/fixtures" ]]; then
    pass "cypress: fixtures directory found"
  else
    gap "no-fixtures-dir" "cypress/fixtures/ directory not found — add fixture JSON files for test data"
  fi

fi

# -- CI workflow check (framework-agnostic) --------------------------------
ci_found=0
E2E_IN_CI=0

for ci_dir in \
  "$ROOT/.github/workflows" \
  "$ROOT/.gitea/workflows" \
  "$ROOT/.gitlab-ci.yml" \
  "$ROOT/Jenkinsfile" \
  "$ROOT/.circleci/config.yml"; do
  if [[ -e "$ci_dir" ]]; then
    ci_found=1
    # Check for E2E/playwright/cypress in CI files
    if grep -rqiE "(playwright|cypress|e2e|vitest.*e2e)" "$ci_dir" 2>/dev/null; then
      E2E_IN_CI=1
      pass "CI workflow has E2E test step (${ci_dir#"$ROOT/"})"
    fi
    break
  fi
done

if [[ "$ci_found" -eq 0 ]]; then
  warn "no CI workflow files found — E2E tests should run automatically on every push"
elif [[ "$E2E_IN_CI" -eq 0 ]]; then
  gap "e2e-not-in-ci" "CI workflow exists but has no E2E test step — add: npx playwright test (or equivalent) to the CI pipeline so E2E failures block merges"
fi

validator_exit
