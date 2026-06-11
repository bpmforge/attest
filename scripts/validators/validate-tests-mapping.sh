#!/usr/bin/env bash
#
# validate-tests-mapping.sh -- bidirectional coverage between use cases and tests,
# plus UC-level pass/fail verdict when a test results file is available.
#
# Forward check: every P0 and P1 use case in USE_CASES.md must have at least one
# test file that references its UC-ID (in filename or describe block / test name).
#
# Reverse check (warning): test files that reference no UC-ID.
#
# Phantom check: test files that reference UC-IDs not present in USE_CASES.md
# (stale or hallucinated traceability) -- hard gap.
#
# Results check (when test results JSON exists): for each UC-ID that appears in
# test names, report whether those specific tests are passing or failing.
# Supported formats: jest --json, vitest --reporter=json, pytest-json-report.
#
# Test results file is looked up in this order:
#   .sdlc/sdlc.json "testResultsFile" key (override)
#   test-results.json, jest-results.json, test-results/results.json,
#   .vitest/results.json, report.json (in project root)
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-tests-mapping"

ROOT="$(detect_project_root "${1:-}")"

# -- Locate USE_CASES.md ---------------------------------------------------
UC=""
for f in "$ROOT/docs/testing/USE_CASES.md" "$ROOT/docs/USE_CASES.md"; do
  [[ -f "$f" ]] && UC="$f" && break
done

if [[ -z "$UC" ]]; then
  warn "no USE_CASES.md found — skipping"
  validator_exit
fi

# -- Collect P0 + P1 use case IDs -----------------------------------------
P_CASES=$(grep -E 'UC-[0-9]+' "$UC" | grep -E '\b[Pp][01]\b' | grep -oE 'UC-[0-9]+' | sort -u)

P_COUNT=$(printf '%s\n' "$P_CASES" | grep -c . || true)
if [[ "$P_COUNT" -eq 0 ]]; then
  warn "no P0 or P1 use cases found — skipping"
  validator_exit
fi

pass "found $P_COUNT P0/P1 use case(s)"

# -- Find test directories -------------------------------------------------
TEST_DIRS=()
for d in tests test __tests__ e2e cypress playwright spec; do
  [[ -d "$ROOT/$d" ]] && TEST_DIRS+=("$ROOT/$d")
done

if [[ "${#TEST_DIRS[@]}" -eq 0 ]]; then
  gap "no-tests-dir" "no test directory found (tests/, __tests__/, e2e/, etc.)"
  validator_exit
fi

# -- Forward check: every P0/P1 has a test reference ----------------------
while IFS= read -r uc; do
  [[ -z "$uc" ]] && continue
  found=0
  for d in "${TEST_DIRS[@]}"; do
    if find "$d" -type f \
        \( -name "*${uc}*" -o -name "*$(printf '%s' "$uc" | tr A-Z a-z)*" \) \
        2>/dev/null | head -1 | grep -q .; then
      found=1
      break
    fi
    if grep -rqE "\b${uc}\b" "$d" 2>/dev/null; then
      found=1
      break
    fi
  done
  [[ "$found" -eq 0 ]] && gap "uncovered-uc" "$uc has no test file referencing it (add a describe/it block with '$uc' in the name)"
done <<< "$P_CASES"

# -- Reverse check (warning only) -----------------------------------------
ORPHAN_COUNT=0
for d in "${TEST_DIRS[@]}"; do
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if ! grep -qE 'UC-[0-9]+' "$f" 2>/dev/null; then
      ORPHAN_COUNT=$((ORPHAN_COUNT + 1))
    fi
  done < <(find "$d" -type f \
    \( -name '*.test.*' -o -name '*.spec.*' -o -name 'test_*.py' \) 2>/dev/null)
done

if [[ "$ORPHAN_COUNT" -gt 0 ]]; then
  warn "$ORPHAN_COUNT test file(s) reference no UC-ID — add 'UC-NNN' to describe/it names for traceability"
fi

# -- Phantom check: tests referencing UC-IDs that do not exist -------------
# A test for UC-99 when USE_CASES.md stops at UC-60 is a stale or hallucinated
# reference — the traceability matrix silently lies until it is fixed.
ALL_CASES=$(grep -oE 'UC-[0-9]+' "$UC" | sort -u)
TEST_REFS=""
for d in "${TEST_DIRS[@]}"; do
  TEST_REFS+=$(grep -rhoE 'UC-[0-9]+' "$d" 2>/dev/null || true)
  TEST_REFS+=$'\n'
done
while IFS= read -r ref; do
  [[ -z "$ref" ]] && continue
  if ! grep -qxF "$ref" <<< "$ALL_CASES"; then
    files=$(grep -rlE "\b${ref}\b" "${TEST_DIRS[@]}" 2>/dev/null | head -2 | tr '\n' ' ')
    gap "phantom-uc" "tests reference $ref but USE_CASES.md has no such use case — stale or hallucinated reference in: $files"
  fi
done < <(printf '%s\n' "$TEST_REFS" | grep -E '^UC-[0-9]+$' | sort -u)

# -- Locate test results JSON ---------------------------------------------
RESULTS_FILE=""

# Allow override via .sdlc/sdlc.json
if [[ -f "$ROOT/.sdlc/sdlc.json" ]] && command -v python3 &>/dev/null; then
  override=$(python3 -c "
import json, sys
try:
    d = json.load(open('$ROOT/.sdlc/sdlc.json'))
    print(d.get('testResultsFile', ''))
except Exception:
    pass
" 2>/dev/null || true)
  [[ -n "$override" && -f "$ROOT/$override" ]] && RESULTS_FILE="$ROOT/$override"
fi

if [[ -z "$RESULTS_FILE" ]]; then
  for candidate in \
    "$ROOT/test-results.json" \
    "$ROOT/jest-results.json" \
    "$ROOT/test-results/results.json" \
    "$ROOT/.vitest/results.json" \
    "$ROOT/report.json" \
    "$ROOT/coverage/test-results.json"; do
    [[ -f "$candidate" ]] && RESULTS_FILE="$candidate" && break
  done
fi

if [[ -z "$RESULTS_FILE" ]]; then
  note "no test results JSON found — UC-level pass/fail check skipped"
  note "to enable: run 'jest --json --outputFile=test-results.json' or 'pytest --json-report --json-report-file=test-results.json'"
  validator_exit
fi

pass "test results file: ${RESULTS_FILE#"$ROOT/"}"

# -- Parse results and build UC → pass/fail table -------------------------
# Handles: jest/vitest JSON (testResults[].testResults[]) and pytest-json-report
python3 - "$RESULTS_FILE" "$P_CASES" <<'PYEOF'
import json, sys, re, os

results_path = sys.argv[1]
p_cases_str  = sys.argv[2] if len(sys.argv) > 2 else ""
p_cases      = set(p_cases_str.split()) if p_cases_str.strip() else set()

try:
    data = json.load(open(results_path))
except Exception as e:
    print(f"PARSE_ERROR:{e}", flush=True)
    sys.exit(0)

# Collect (test_name, status) pairs
tests = []  # list of (full_name, status)  status in {passed, failed, pending, skipped}

def normalise(s):
    return s.lower() if isinstance(s, str) else "unknown"

# Format 1: jest/vitest  {"testResults": [{"testResults": [{"fullName":..,"status":..}]}]}
if "testResults" in data and isinstance(data["testResults"], list):
    for suite in data["testResults"]:
        for t in suite.get("testResults", []) + suite.get("tests", []):
            name   = t.get("fullName") or t.get("title") or ""
            status = normalise(t.get("status", "unknown"))
            tests.append((name, status))

# Format 2: pytest-json-report  {"tests": [{"nodeid":..,"outcome":..}]}
elif "tests" in data and isinstance(data["tests"], list):
    for t in data["tests"]:
        name   = t.get("nodeid") or t.get("name") or ""
        status = normalise(t.get("outcome", t.get("status", "unknown")))
        # pytest uses "passed"/"failed"/"error"/"skipped"
        if status == "error":
            status = "failed"
        tests.append((name, status))

if not tests:
    print("NO_TESTS_PARSED", flush=True)
    sys.exit(0)

# Group by UC-ID
uc_pattern = re.compile(r'\bUC-\d+\b')
uc_results = {}  # uc_id -> {"passed": n, "failed": n, "other": n}

for name, status in tests:
    for uc_id in uc_pattern.findall(name.upper()):
        if uc_id not in uc_results:
            uc_results[uc_id] = {"passed": 0, "failed": 0, "other": 0}
        bucket = "passed" if status == "passed" else ("failed" if status == "failed" else "other")
        uc_results[uc_id][bucket] += 1

# Print table
print("UC_VERDICT_TABLE", flush=True)
print(f"{'UC-ID':<12} {'Tests':>6} {'Passed':>8} {'Failed':>8} {'Verdict'}", flush=True)
print("-" * 52, flush=True)

all_pass = True
for uc_id in sorted(uc_results):
    r = uc_results[uc_id]
    total  = r["passed"] + r["failed"] + r["other"]
    verdict = "PASS" if r["failed"] == 0 and r["passed"] > 0 else ("FAIL" if r["failed"] > 0 else "SKIP")
    if verdict != "PASS":
        all_pass = False
    flag = "" if verdict == "PASS" else " ◄"
    print(f"{uc_id:<12} {total:>6} {r['passed']:>8} {r['failed']:>8} {verdict}{flag}", flush=True)

# Report P0/P1 UCs with no results at all
for uc_id in sorted(p_cases):
    if uc_id not in uc_results:
        print(f"{uc_id:<12} {'?':>6} {'?':>8} {'?':>8} NO_RESULTS ◄", flush=True)
        all_pass = False

print("-" * 52, flush=True)
print("OVERALL:" + ("PASS" if all_pass else "FAIL"), flush=True)
PYEOF

# -- Interpret python output -----------------------------------------------
results_output=$(python3 - "$RESULTS_FILE" "$P_CASES" <<'PYEOF2'
import json, sys, re

results_path = sys.argv[1]
p_cases_str  = sys.argv[2] if len(sys.argv) > 2 else ""
p_cases      = set(p_cases_str.split()) if p_cases_str.strip() else set()

try:
    data = json.load(open(results_path))
except Exception as e:
    print(f"PARSE_ERROR:{e}")
    sys.exit(0)

tests = []
def normalise(s):
    return s.lower() if isinstance(s, str) else "unknown"

if "testResults" in data and isinstance(data["testResults"], list):
    for suite in data["testResults"]:
        for t in suite.get("testResults", []) + suite.get("tests", []):
            name   = t.get("fullName") or t.get("title") or ""
            status = normalise(t.get("status", "unknown"))
            tests.append((name, status))
elif "tests" in data and isinstance(data["tests"], list):
    for t in data["tests"]:
        name   = t.get("nodeid") or t.get("name") or ""
        status = normalise(t.get("outcome", t.get("status", "unknown")))
        if status == "error": status = "failed"
        tests.append((name, status))

if not tests:
    print("NO_TESTS_PARSED")
    sys.exit(0)

uc_pattern = re.compile(r'\bUC-\d+\b')
uc_results = {}
for name, status in tests:
    for uc_id in uc_pattern.findall(name.upper()):
        if uc_id not in uc_results:
            uc_results[uc_id] = {"passed": 0, "failed": 0, "other": 0}
        bucket = "passed" if status == "passed" else ("failed" if status == "failed" else "other")
        uc_results[uc_id][bucket] += 1

fail_ucs=[]
no_results=[]
for uc_id in sorted(p_cases):
    if uc_id not in uc_results:
        no_results.append(uc_id)
    elif uc_results[uc_id]["failed"] > 0:
        fail_ucs.append(f"{uc_id}({uc_results[uc_id]['failed']} failing)")
    elif uc_results[uc_id]["passed"] == 0:
        no_results.append(uc_id)

for uc in fail_ucs:
    print(f"FAIL:{uc}")
for uc in no_results:
    print(f"NO_RESULTS:{uc}")
if not fail_ucs and not no_results:
    print("ALL_PASS")
PYEOF2
)

if [[ -z "$results_output" || "$results_output" == "NO_TESTS_PARSED" ]]; then
  warn "could not parse UC-level verdicts from ${RESULTS_FILE#"$ROOT/"} — check format"
elif printf '%s' "$results_output" | grep -q "^PARSE_ERROR:"; then
  warn "test results JSON parse error: $(printf '%s' "$results_output" | grep "^PARSE_ERROR:" | head -1)"
elif printf '%s' "$results_output" | grep -q "^ALL_PASS"; then
  pass "UC-level verdict: all P0/P1 use cases have passing tests in results file"
else
  while IFS= read -r verdict_line; do
    case "$verdict_line" in
      FAIL:*)
        uc_info="${verdict_line#FAIL:}"
        gap "uc-tests-failing" "UC $uc_info has FAILING tests — these use cases are not verified green"
        ;;
      NO_RESULTS:*)
        uc_id="${verdict_line#NO_RESULTS:}"
        gap "uc-no-results" "$uc_id has no test results in ${RESULTS_FILE#"$ROOT/"} — run tests with UC-ID in test names to get UC-level verdicts"
        ;;
    esac
  done <<< "$results_output"
fi

validator_exit
