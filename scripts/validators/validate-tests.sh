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
# Usage: validate-tests.sh [project-root] [--scope auto|impact|full]
#
# Test scope (TEST_IMPACT_PLAN.md; env TEST_SCOPE is the default, else auto):
#   impact  run only the test files a change can break (scripts/test/select.mjs:
#           impact map + runner-native selectors + always/failed/rolling sets).
#           The selector's safety rules still win: no/stale ledger, a global input
#           (lockfile, manifest, runner config, fixtures, CI), > test.max_changed
#           files, every 20th impact run, or a custom "test" command in
#           .sdlc/sdlc.json all escalate to a full run (reason printed).
#   auto    same decision as impact (impact unless the selector says full)
#   full    the whole suite (the project's own test command)
# Prints one line on stderr and at the top of the RUNTIME report:
#   Scope: impact — <n> of <total> (<unaffected> unaffected, <always> always, <rolling> rolling); last full <date> @ <sha7>
#   Scope: full — <reason>
# Every run records per-file results in docs/work/test/ledger.json (scripts/test/ledger.mjs):
# impact runs advance the chain, a GREEN full run becomes the new baseline and resets it.
# A failing selected test changes nothing else: no automatic re-run, the gap is reported.
# stdout stays the validator JSON envelope; test-results.json is still written for
# validate-tests-mapping.sh (after an impact run it holds the files that ran).
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib_sdlc_config.sh"

validator_init "validate-tests"

# -- args: [project-root] [--scope auto|impact|full] -------------------------
ROOT_ARG=""
SCOPE_REQ="${TEST_SCOPE:-auto}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      [[ $# -ge 2 ]] || fatal "--scope needs a value (auto|impact|full)"
      SCOPE_REQ="$2"; shift 2 ;;
    --scope=*)
      SCOPE_REQ="${1#--scope=}"; shift ;;
    -h|--help)
      sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    --*)
      fatal "unknown arg: $1" ;;
    *)
      [[ -z "$ROOT_ARG" ]] && ROOT_ARG="$1"
      shift ;;
  esac
done
case "$SCOPE_REQ" in
  auto|impact|full) ;;
  *) fatal "invalid --scope '$SCOPE_REQ' (expected auto|impact|full)" ;;
esac

ROOT="$(detect_project_root "$ROOT_ARG")"
TEST_TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../test" 2>/dev/null && pwd || true)"
WORK="$(mktemp -d -t vtests.XXXXXX)"
LOG=""
# Telemetry (TEST_IMPACT_PLAN.md T6): one row per run once the scope is decided -- counts only, never output.
# {ts, source:"tests", scope, selected, total, ms, reason} appended to <root>/docs/work/telemetry.jsonl
# (same file and conventions as the validator rows in _lib.sh; EXPERTS_TELEMETRY=0 disables; never breaks the gate).
TEL_ON="no"; TEL_N=0; TEL_TOTAL=0; TEL_REASON=""
now_ms() { node -e 'process.stdout.write(String(Date.now()))' 2>/dev/null || printf '%s000' "$(date +%s)"; }
TEL_T0="$(now_ms)"
emit_tests_telemetry() {
  [[ "$TEL_ON" == "yes" && "${EXPERTS_TELEMETRY:-1}" != "0" ]] || return 0
  {
    local ms=$(( $(now_ms) - TEL_T0 )) reason
    reason="$(printf '%s' "$TEL_REASON" | tr -d '"\\' | tr -c '[:print:]' ' ' | cut -c1-120)"
    mkdir -p "$ROOT/docs/work" &&
    printf '{"ts":"%s","source":"tests","scope":"%s","selected":%d,"total":%d,"ms":%d,"reason":"%s"}\n' \
      "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$SCOPE_EFF" "$TEL_N" "$TEL_TOTAL" "$ms" "$reason" \
      >> "$ROOT/docs/work/telemetry.jsonl"
  } 2>/dev/null || true
}
trap 'emit_tests_telemetry; rm -rf "$WORK"; rm -f "$GAP_FILE" "${LOG:-}"' EXIT
STAMP="$WORK/run-start"; : > "$STAMP"

SCOPE_EFF="full"      # what actually runs: impact | full
SCOPE_LINE=""
SEL_JSON=""
OTHER_RUNNERS="no"    # the map holds non-playwright tests (full run must not stop at the Playwright fast path)

# -- scope decision: map refresh -> selector -> Scope line --------------------
force_reason=""
resolve_scope() {
  if [[ ! -f "$TEST_TOOLS/select.mjs" || ! -f "$TEST_TOOLS/map.mjs" ]] || ! command -v node >/dev/null 2>&1; then
    SCOPE_LINE="Scope: full — selector unavailable (scripts/test/select.mjs or node missing)"
    return 0
  fi
  node "$TEST_TOOLS/map.mjs" refresh --root "$ROOT" >/dev/null 2>"$WORK/map.err" \
    || note "test map refresh failed: $(head -c 200 "$WORK/map.err" | tr '\n' ' ')"
  local sel_args=(--root "$ROOT" --json "$WORK/select.json")
  local cfg_cmd=""
  if [[ "$SCOPE_REQ" == "full" ]]; then
    sel_args+=(--full); force_reason="requested (--scope full)"
  elif cfg_cmd=$(read_config_value "$ROOT" "test") && [[ -n "$cfg_cmd" && "$cfg_cmd" != "{"* ]]; then
    # a custom command cannot be narrowed to files; never guess
    sel_args+=(--full); force_reason="custom-test-command (.sdlc/sdlc.json \"test\")"
  fi
  if ! node "$TEST_TOOLS/select.mjs" "${sel_args[@]}" >/dev/null 2>"$WORK/select.err"; then
    SCOPE_LINE="Scope: full — selector-error ($(head -c 160 "$WORK/select.err" | tr '\n' ' '))"
    return 0
  fi
  SEL_JSON="$WORK/select.json"
  local scope reason n total unaff always rolling lfdate lfsha other
  IFS=$'\t' read -r scope reason n total unaff always rolling lfdate lfsha other < <(node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const lf = j.last_full || {};
    const other = Object.entries(j.by_runner || {}).some(([k, e]) => k !== "playwright" && ((e.files || []).length || (e.projects || []).some((p) => (p.files || []).length)));
    process.stdout.write([j.scope, j.reason, j.selected.length, j.total, j.skipped, j.always, j.rolling,
      lf.date ? String(lf.date).slice(0, 10) : "none", lf.sha ? String(lf.sha).slice(0, 7) : "none", other ? "yes" : "no"].join("\t") + "\n");
  ' "$SEL_JSON")
  OTHER_RUNNERS="$other"
  TEL_N="$n"; TEL_TOTAL="$total"; TEL_REASON="${force_reason:-$reason}"
  if [[ "$scope" == "impact" ]]; then
    SCOPE_EFF="impact"
    SCOPE_LINE="Scope: impact — ${n} of ${total} (${unaff} unaffected, ${always} always, ${rolling} rolling); last full ${lfdate} @ ${lfsha}"
  else
    SCOPE_EFF="full"
    SCOPE_LINE="Scope: full — ${force_reason:-$reason}"
  fi
}
# -- executor (impact runs + per-file harvest of full runs); node, no deps ----
cat > "$WORK/exec.mjs" <<'EXEC_MJS_EOF'
// exec.mjs -- runs the selected test files per runner (impact) or harvests per-file results of a full run.
//   exec.mjs run     <select.json> <root> <results.json> <log> <test-results.json> <tmp> 
//   exec.mjs harvest <select.json> <root> <results.json> -     <results-json|-> <tmp> <rc>
// Exit: 0 all green | 1 a selected test failed | 3 a runner binary is missing
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, isAbsolute, join, posix, relative, resolve, dirname } from 'node:path';

const [mode, planFile, rootArg, resultsOut, logFile, jsonOut, tmpDir, rcArg] = process.argv.slice(2);
const root = resolve(rootArg);
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const tests = readJson(join(root, 'docs/work/test/map.json'))?.tests ?? {};
const toRel = (p) => posix.normalize((isAbsolute(p) ? relative(root, p) : p).split('\\').join('/'));
const results = new Map();
const setRes = (file, result, ms = 0, flaky = false) => {
  if (!file || file.startsWith('..')) return;
  const prev = results.get(file);
  if (prev?.result === 'fail') return;
  if (prev?.result === 'pass' && result === 'skip') return;
  results.set(file, { file, result, ms, ...(flaky ? { flaky: true } : {}) });
};
const finish = (code) => { writeFileSync(resultsOut, JSON.stringify([...results.values()])); process.exit(code); };

// ---- per-runner result parsers (each returns { passed, failed } test counts or null)
function fromJestLike(j) {
  for (const tr of j.testResults ?? []) {
    const st = String(tr.status ?? '').toLowerCase();
    const failed = st === 'failed' || st === 'fail' || (tr.assertionResults ?? []).some((a) => a.status === 'failed');
    setRes(toRel(tr.name ?? tr.testFilePath ?? ''), failed ? 'fail' : ['skipped', 'pending', 'todo'].includes(st) ? 'skip' : 'pass', Math.max(0, (tr.endTime ?? 0) - (tr.startTime ?? 0)));
  }
  return Number.isFinite(j.numPassedTests) ? { passed: j.numPassedTests, failed: j.numFailedTests ?? 0 } : null;
}
function fromPlaywright(j) {
  const rootDir = j.config?.rootDir ?? root;
  const per = new Map();
  const walk = (ss, inherited) => {
    for (const s of ss ?? []) {
      for (const sp of s.specs ?? []) {
        const file = toRel(join(rootDir, sp.file ?? s.file ?? inherited ?? ''));
        const e = per.get(file) ?? { fail: false, pass: false, flaky: false };
        for (const t of sp.tests ?? []) {
          if (t.status === 'unexpected') e.fail = true;
          else if (t.status === 'flaky') { e.pass = true; e.flaky = true; }
          else if (t.status === 'expected') e.pass = true;
        }
        per.set(file, e);
      }
      walk(s.suites, s.file ?? inherited);
    }
  };
  walk(j.suites);
  for (const [f, e] of per) setRes(f, e.fail ? 'fail' : e.pass ? 'pass' : 'skip', 0, e.flaky);
  const st = j.stats;
  return st ? { passed: (st.expected ?? 0) + (st.flaky ?? 0), failed: st.unexpected ?? 0 } : null;
}
function fromPytest(text, cwdRel) {
  const per = new Map();
  const bump = (f, k) => { const e = per.get(f) ?? { fail: false, pass: false }; e[k] = true; per.set(f, e); };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m = /^(PASSED|FAILED|ERROR|XFAIL|XPASS)\s+(\S+?\.py)(?:::|\s|$)/.exec(line);
    if (m) { bump(posix.join(cwdRel, m[2]), m[1] === 'FAILED' || m[1] === 'ERROR' ? 'fail' : 'pass'); continue; }
    m = /^SKIPPED \[\d+\] (\S+?\.py):/.exec(line);
    if (m) per.has(posix.join(cwdRel, m[1])) || per.set(posix.join(cwdRel, m[1]), { fail: false, pass: false });
  }
  for (const [f, e] of per) setRes(toRel(f), e.fail ? 'fail' : e.pass ? 'pass' : 'skip');
}

// ---- harvest mode: a full run by the project's own command
if (mode === 'harvest') {
  const rc = Number(rcArg ?? 1);
  const j = jsonOut && jsonOut !== '-' ? readJson(jsonOut) : null;
  if (j?.testResults) fromJestLike(j); else if (j?.suites) fromPlaywright(j);
  for (const f of plan.selected ?? []) setRes(f, rc === 0 ? 'pass' : 'fail');
  finish(0);
}

// ---- run mode
const log = (s) => { appendFileSync(logFile, s); process.stderr.write(s); };
let totalPassed = 0; let totalFailed = 0; let counted = false; let rcAll = 0; let missing = false;
const merged = { testResults: [], numPassedTests: 0, numFailedTests: 0, numTotalTests: 0, success: true };
let wroteJest = false; let pwJson = null;

const findBin = (cwd, name) => {
  for (let d = resolve(cwd); ; d = dirname(d)) {
    const b = join(d, 'node_modules', '.bin', name);
    if (existsSync(b)) return b;
    if (d === root || dirname(d) === d) return null;
  }
};
const onPath = (name) => (process.env.PATH ?? '').split(delimiter).some((d) => d && existsSync(join(d, name)));
function exec(cmd, args, cwd, env = {}, view = (o) => o) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 60 * 60_000, env: { ...process.env, CI: '1', FORCE_COLOR: '0', ...env } });
  const out = `${r.stdout ?? ''}${r.stderr ? `${r.stdout && !r.stdout.endsWith('\n') ? '\n' : ''}${r.stderr}` : ''}`;
  const shown = view(out);
  log(`$ ${[cmd, ...args].join(' ')}   (cwd ${relative(root, cwd) || '.'})\n${shown}${shown.endsWith('\n') || !shown ? '' : '\n'}`);
  if (r.error?.code === 'ENOENT') missing = true;
  return { rc: r.error ? 127 : (r.status ?? 1), out };
}
const count = (c) => { if (c) { counted = true; totalPassed += c.passed; totalFailed += c.failed; } };
const settle = (files, rc) => { for (const f of files) if (!results.has(f)) setRes(f, rc === 0 ? 'pass' : 'fail'); };
const node = (name, cwd) => findBin(cwd, name) ?? (onPath(name) ? name : null);

const entries = Object.entries(plan.by_runner ?? {});
for (const [runner, ent] of entries) {
  const projs = ent.projects ?? [{ cwd: ent.cwd, files: ent.files, args: ent.args, mode: ent.mode, union: ent.union }];
  for (const p of projs) {
    const pc = p.cwd || '';
    const cwd = join(root, pc);
    const rel = (f) => posix.relative(pc || '.', f);
    const files = p.files ?? [];
    let rc = 0;
    if (runner === 'vitest' || runner === 'jest') {
      if (!files.length) continue;
      const bin = node(runner, cwd);
      if (!bin) { log(`validate-tests: ${runner} not found for ${pc || '.'} (node_modules/.bin or PATH)\n`); missing = true; rcAll = 1; continue; }
      const out = join(tmpDir, `${runner}-${pc.replace(/\W/g, '_') || 'root'}.json`);
      const args = runner === 'vitest'
        ? ['run', '--reporter=json', `--outputFile=${out}`, ...files.map(rel)]
        : ['--json', `--outputFile=${out}`, '--runTestsByPath', ...files.map(rel)];
      const r = exec(bin, args, cwd); rc = r.rc;
      const j = readJson(out);
      if (j?.testResults) {
        count(fromJestLike(j));
        merged.testResults.push(...j.testResults); merged.numPassedTests += j.numPassedTests ?? 0; merged.numFailedTests += j.numFailedTests ?? 0;
        merged.numTotalTests += j.numTotalTests ?? 0; merged.success = merged.success && j.success !== false; wroteJest = true;
      }
      settle(files, rc);
    } else if (runner === 'playwright') {
      if (!files.length) continue;
      const bin = node('playwright', cwd);
      if (!bin) { log(`validate-tests: playwright not found for ${pc || '.'}\n`); missing = true; rcAll = 1; continue; }
      const cfgName = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mts'].find((c) => existsSync(join(cwd, c)));
      const cfg = cfgName ? readFileSync(join(cwd, cfgName), 'utf8') : '';
      const hasJson = /reporter.*json|json.*outputFile|'json'|"json"/.test(cfg);
      const out = join(tmpDir, `playwright-${pc.replace(/\W/g, '_') || 'root'}.json`);
      const args = ['test', hasJson ? '--reporter=list' : '--reporter=json,html,list', ...files.map(rel)];
      const r = exec(bin, args, cwd, { PLAYWRIGHT_JSON_OUTPUT_NAME: out, PLAYWRIGHT_HTML_OPEN: 'never' }); rc = r.rc;
      const j = readJson(out) ?? (() => { try { return JSON.parse(r.out); } catch { return null; } })();
      if (j?.suites) { count(fromPlaywright(j)); pwJson = out; }
      settle(files, rc);
    } else if (runner === 'node') {
      if (!files.length) continue;
      const r = exec(process.execPath, ['--test', ...files.map(rel)], cwd); rc = r.rc;
      settle(files, rc);
    } else if (runner === 'pytest') {
      const testmon = p.mode === 'args' && (p.args ?? []).includes('--testmon');
      if (!testmon && !files.length) continue;
      const py = onPath('pytest') ? ['pytest'] : ['python3', '-m', 'pytest'];
      const runs = [];
      if (testmon) runs.push([...py.slice(1), '--testmon', '-rA', '--color=no']);
      if (files.length) runs.push([...py.slice(1), ...files.map(rel), '-rA', '--color=no']);
      for (const a of runs) {
        const r = exec(py[0], a, cwd); if (r.rc !== 0 && r.rc !== 5) rc = r.rc;
        fromPytest(r.out, pc || '.');
      }
      settle(files, rc);
    } else if (runner === 'go') {
      const args = p.args ?? [];
      if (!args.length) continue;
      // `go test -json` events -> the readable text `go test` itself prints
      const goText = (o) => o.split('\n').map((l) => { try { const e = JSON.parse(l); return e.Action === 'output' ? e.Output : ''; } catch { return `${l}\n`; } }).join('');
      const r = exec('go', ['test', '-json', ...args], cwd, {}, goText); rc = r.rc;
      const mod = spawnSync('go', ['list', '-m'], { cwd, encoding: 'utf8' }).stdout?.trim().split('\n')[0] ?? '';
      const per = new Map(); let pp = 0; let pf = 0;
      for (const line of r.out.split('\n')) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (!e.Package || !['pass', 'fail', 'skip'].includes(e.Action)) continue;
        if (e.Test) { if (e.Action === 'pass') pp++; else if (e.Action === 'fail') pf++; continue; }
        const sub = mod && e.Package.startsWith(mod) ? e.Package.slice(mod.length).replace(/^\//, '') : e.Package;
        per.set(sub, e.Action);
      }
      count({ passed: pp, failed: pf });
      for (const f of files) { const d = posix.dirname(rel(f)); const k = d === '.' ? '' : d; const a = per.get(k); if (a) setRes(f, a === 'fail' ? 'fail' : a === 'skip' ? 'skip' : 'pass'); }
      settle(files, rc);
    } else if (runner === 'cargo') {
      const crates = []; const a = p.args ?? [];
      for (let i = 0; i < a.length; i++) if (a[i] === '-p' && a[i + 1]) crates.push(a[++i]);
      for (const c of crates) {
        const r = exec('cargo', ['test', '-p', c], cwd);
        if (r.rc !== 0) rc = r.rc;
        const mine = files.filter((f) => tests[f]?.crate === c);
        settle(mine, r.rc);
        let pp = 0; let pf = 0;
        for (const m of r.out.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)) { pp += Number(m[1]); pf += Number(m[2]); }
        count({ passed: pp, failed: pf });
      }
    } else { log(`validate-tests: no impact runner for '${runner}' — files not run: ${files.join(' ')}\n`); if (files.length) { rcAll = 1; missing = true; } continue; }
    if (rc !== 0) rcAll = 1;
  }
}

// test-results.json contract (validate-tests-mapping.sh): jest/vitest shape of what ran, else the Playwright JSON.
if (wroteJest) writeFileSync(jsonOut, JSON.stringify(merged));
else if (pwJson && existsSync(pwJson)) copyFileSync(pwJson, jsonOut);
if (counted) log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed\n`);
finish(missing ? 3 : rcAll);
EXEC_MJS_EOF

# No runner manifest at all: nothing to scope (and no map/ledger to create in a non-test project)
if [[ "$(detect_stack "$ROOT")" == "unknown" ]] \
   && ! compgen -G "$ROOT/playwright.config.*" >/dev/null; then
  warn "no recognized test runner manifest in $ROOT — skipping"
  validator_exit
fi

resolve_scope
printf '%s\n' "$SCOPE_LINE" >&2
TEL_ON="yes"
# a full run executes every test: selected = total (the selector reports its own pick, not what a full run ran)
if [[ "$SCOPE_EFF" == "full" ]]; then
  TEL_N="$TEL_TOTAL"
  [[ -n "$TEL_REASON" ]] || TEL_REASON="${SCOPE_LINE#Scope: full — }"
fi

# Ledger: per-file results of this run (scripts/test/ledger.mjs). Failure to record never fails the run.
record_ledger() { # <impact|full> <results.json>
  [[ -f "$TEST_TOOLS/ledger.mjs" && -s "${2:-}" ]] || return 0
  node "$TEST_TOOLS/ledger.mjs" record --root "$ROOT" --scope "$1" --results "$2" >/dev/null 2>"$WORK/ledger.err" \
    || warn "test ledger not updated: $(head -c 200 "$WORK/ledger.err" | tr '\n' ' ')"
}

# Per-file results of a FULL run executed by the project's own command: parse the results JSON when this run
# wrote one (jest/vitest/playwright), mark every other test file with the run's overall result.
harvest_full() { # <rc> [results-json]
  [[ -n "$SEL_JSON" ]] || return 0
  local rj="${2:-}"
  [[ -n "$rj" && -f "$rj" && "$rj" -nt "$STAMP" ]] || rj="-"
  node "$WORK/exec.mjs" harvest "$SEL_JSON" "$ROOT" "$WORK/results.json" "-" "$rj" "$WORK" "$1" >/dev/null 2>&1 \
    && record_ledger full "$WORK/results.json"
}

# -- Impact scope: run only the selected files per runner (select.mjs by_runner) ------
if [[ "$SCOPE_EFF" == "impact" ]]; then
  LOG="$WORK/tests.log"; : > "$LOG"
  set +e
  node "$WORK/exec.mjs" run "$SEL_JSON" "$ROOT" "$WORK/results.json" "$LOG" "$ROOT/test-results.json" "$WORK" >&2
  RC=$?
  set -e
  TAIL=$(tail -80 "$LOG")
  PASS_COUNT=$(grep -oE '[0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
  FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
  BODY="$SCOPE_LINE"$'\n\n'"$TAIL"
  record_ledger impact "$WORK/results.json"
  if [[ "$RC" -eq 0 ]]; then
    pass "tests passed at impact scope (rc=0${PASS_COUNT:+, $PASS_COUNT passed}${FAIL_COUNT:+, $FAIL_COUNT failed})"
    write_runtime_report "$ROOT" "tests" "PASS — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-0} failed" "$BODY" >/dev/null
  elif [[ "$RC" -eq 3 ]]; then
    gap "no-test-command" "impact scope: a runner for the selected tests is not installed (see output above)"
    write_runtime_report "$ROOT" "tests" "FAIL — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-?} failed" "$BODY" >/dev/null
  else
    gap "tests-failed" "impact scope: rc=$RC — ${FAIL_COUNT:-?} failed (selected tests only; nothing was re-run)"
    write_runtime_report "$ROOT" "tests" "FAIL — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-?} failed" "$BODY" >/dev/null
  fi
  validator_exit
fi

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

  # Run playwright — JSON goes to test-results.json (playwright default) or config path
  JSON_OUT="$ROOT/test-results.json"
  if grep -qE "outputFile.*['\"](.+\.json)['\"]" "$PLAYWRIGHT_CONFIG" 2>/dev/null; then
    JSON_PATH=$(grep -oE "outputFile.*['\"]([^'\"]+\.json)['\"]" "$PLAYWRIGHT_CONFIG" \
      | grep -oE "['\"][^'\"]+\.json['\"]" | tr -d "'\"" | head -1 || true)
    [[ -n "$JSON_PATH" ]] && JSON_OUT="$ROOT/$JSON_PATH"
  fi

  # errexit off around the run: a red suite must reach the gap/report/ledger code below
  # (under set -e the script used to abort here, with no gap, report or JSON envelope)
  set +e
  (cd "$ROOT" && npx playwright test $REPORTER_FLAGS 2>&1) | tee "$LOG"
  RC=${PIPESTATUS[0]}
  set -e

  TAIL=$(tail -80 "$LOG")

  # Parse playwright output: "N passed (Xm Ys)" or "N failed"
  PASS_COUNT=$(grep -oE '[0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
  FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)

  PW_BODY="$SCOPE_LINE"$'\n\n'"$TAIL"
  # A full run must cover every runner the map knows: when non-Playwright tests exist and the
  # Playwright half is green, continue into the generic command below before recording a baseline.
  PW_CONTINUE=no
  if [[ "$RC" -eq 0 && "$OTHER_RUNNERS" == "yes" ]]; then PW_CONTINUE=yes; fi

  if [[ "$RC" -eq 0 ]]; then
    pass "playwright tests passed (${PASS_COUNT:-?} passed${FAIL_COUNT:+, $FAIL_COUNT failed})"
    [[ -f "$JSON_OUT" ]] && pass "test-results.json written: ${JSON_OUT#"$ROOT/"}"
    [[ "$PW_CONTINUE" == "yes" ]] || write_runtime_report "$ROOT" "tests" "PASS — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-0} failed (playwright)" "$PW_BODY" >/dev/null
  else
    gap "tests-failed" "playwright: rc=$RC — ${FAIL_COUNT:-?} failed"
    [[ -f "$JSON_OUT" ]] && note "test-results.json written despite failures: ${JSON_OUT#"$ROOT/"}"
    write_runtime_report "$ROOT" "tests" "FAIL — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-?} failed (playwright)" "$PW_BODY" >/dev/null
  fi

  if [[ "$PW_CONTINUE" == "no" ]]; then
    harvest_full "$RC" "$JSON_OUT"
    validator_exit
  fi
  note "playwright green — also running the project's test command (the map holds non-Playwright tests)"
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

set +e   # a red suite must reach the gap/report/ledger code below, not abort the script
(cd "$ROOT" && eval "$CMD") >"$LOG" 2>&1
RC=$?
set -e

TAIL=$(tail -80 "$LOG")

# Parse counts
PASS_COUNT=""
FAIL_COUNT=""
PASS_COUNT=$(grep -oE '[0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
[[ -z "$PASS_COUNT" ]] && PASS_COUNT=$(grep -oE '=+ [0-9]+ passed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
[[ -z "$FAIL_COUNT" ]] && FAIL_COUNT=$(grep -oE '[0-9]+ failed' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)

BODY="$SCOPE_LINE"$'\n\n'"$TAIL"
if [[ "$RC" -eq 0 ]]; then
  pass "tests passed (rc=0${PASS_COUNT:+, $PASS_COUNT passed}${FAIL_COUNT:+, $FAIL_COUNT failed})"
  write_runtime_report "$ROOT" "tests" "PASS — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-0} failed" "$BODY" >/dev/null
else
  gap "tests-failed" "rc=$RC for: $CMD — ${FAIL_COUNT:-?} failed"
  write_runtime_report "$ROOT" "tests" "FAIL — ${PASS_COUNT:-?} passed, ${FAIL_COUNT:-?} failed" "$BODY" >/dev/null
fi

# Ledger: per-file results of this full run; a green one becomes the new baseline (scripts/test/ledger.mjs)
harvest_full "$RC" "$RESULTS_FILE"

validator_exit
