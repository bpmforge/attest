// jira-tickets-integration.test.mjs — the test round 3 owed: drives
// conductor.mjs ITSELF against the JIRA board driver, not the driver's API in
// isolation. jira-tickets.test.mjs's unit tests each call loadPlan(root) with
// an argument of their own choosing — that supplied-arguments pattern cannot
// catch a mismatch between what conductor.mjs actually passes and what the
// driver expects, which is exactly the class of bug that shipped twice on the
// 2026-07-31 field pilot (loadPlan(PLAN_PATH) receiving a FILE where the
// driver needed the project ROOT; persistPlan() git-adding a file the board
// never creates; main()'s existsSync(PLAN_PATH) precondition; mirrorJira()
// racing a second JIRA writer). This suite would have failed on all four
// before their fixes (4b0c984) and must keep failing if any regress.
//
// Mirrors conductor.test.mjs's shape: a real temp git repo, a real
// conductor.mjs subprocess, a stub `opencode` standing in for sessions — but
// here CONDUCTOR_BOARD=jira and a stub `jira.sh` stands in for the board
// itself, so the fixture never touches real JIRA or needs credentials.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));         // scripts/lib
const REPO_ROOT = resolve(HERE, '..', '..');                  // attest
const CONDUCTOR = resolve(REPO_ROOT, 'scripts/conductor/conductor.mjs');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

/**
 * A real target repo with no plan.json at all — the JIRA-board case has none
 * by construction. Also carries a real `docs/work/ticket-scope-map.json`, a
 * models.json, and a stub jira.sh that answers `ready`/`blockers`/`mine`/
 * `claim`/`release`/`comment` deterministically for two tickets: T-100 (maps
 * cleanly, stub opencode plays it straight) and T-101 (absent from the scope
 * map, so it must never be claimed at all).
 */
function setupFixture() {
  const base = mkdtempSync(resolve(tmpdir(), 'jira-board-integration-'));
  const target = resolve(base, 'target-repo');
  mkdirSync(target, { recursive: true });
  const git = (...a) => sh('git', a, { cwd: target });

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'conductor-test@example.com');
  git('config', 'user.name', 'Conductor Test');
  git('config', 'commit.gpgsign', 'false');

  mkdirSync(resolve(target, 'docs/reviews'), { recursive: true });
  writeFileSync(resolve(target, 'docs/reviews/.gitkeep'), '');
  mkdirSync(resolve(target, 'docs/work'), { recursive: true });
  writeFileSync(resolve(target, '.gitignore'), 'docs/work/\n.conductor-worktrees/\n');

  writeFileSync(resolve(target, 'models.json'), JSON.stringify({
    roles: { coder: 'fixture/coder-model', reviewer: 'fixture/reviewer-model' },
  }, null, 2) + '\n');

  const scopeMap = {
    tickets: {
      'T-100': {
        title: 'Ticket one hundred',
        write_scope: ['a/**'],
        acceptance: ['writes a/hello.txt'],
        verify: 'test -f a/hello.txt',
        manifest: 'docs/reviews/MANIFEST_T-100.md',
      },
      // T-101 is deliberately ABSENT from this map — the hard rule under test.
    },
  };
  writeFileSync(resolve(target, 'docs/work/ticket-scope-map.json'), JSON.stringify(scopeMap, null, 2) + '\n');

  git('add', '-A');
  git('commit', '-q', '-m', 'initial fixture');

  const binDir = resolve(base, 'bin');
  mkdirSync(binDir, { recursive: true });

  // Stub jira.sh: `ready` lists BOTH tickets (proving the omission of T-101
  // happens in the driver, not upstream); `claim`/`release`/`comment` just
  // log to a file the test reads back, so claim/release ordering is provable
  // without touching a real board. `ready` tracks a done-marker file so a
  // released('done') ticket stops appearing — the same guarantee real JIRA's
  // statusCategory filter gives, and load-bearing: an unconditional stub here
  // masks conductor.mjs's own per-run landed-ticket guard (the thing this
  // fixture exists to prove) behind a stub that never needed it.
  const jiraCallLog = resolve(base, 'jira-calls.log');
  const doneMarker = resolve(base, 'T-100.done');
  const jiraStub = resolve(binDir, 'jira-stub.sh');
  writeFileSync(jiraStub, `#!/usr/bin/env bash
echo "$*" >> "${jiraCallLog}"
case "$1" in
  ready)
    printf 'T-101  Ticket not in the scope map\\n'
    [[ -f "${doneMarker}" ]] || printf 'T-100  Ticket one hundred\\n'
    ;;
  blockers) echo "(no blockers)" ;;
  mine) echo "" ;;
  claim) echo "CLAIMED $2" ;;
  release)
    [[ "$2" == "T-100" && "$3" == "done" ]] && touch "${doneMarker}"
    echo "ok"
    ;;
  comment|transition) echo "ok" ;;
  *) echo "ok" ;;
esac
exit 0
`);
  chmodSync(jiraStub, 0o755);

  // Stub opencode: plays T-100 straight (in-scope file + valid manifest). It
  // must never be invoked for T-101 — that assertion is the scope-map hard
  // rule's actual proof, not just an absence-from-plan check.
  const opencodeStub = resolve(binDir, 'opencode-stub.sh');
  writeFileSync(opencodeStub, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "models" ]]; then
  printf '%s\\n' fixture/coder-model fixture/reviewer-model
  exit 0
fi
[[ "\${1:-}" == "run" ]] || exit 0
PROMPT="$2"; shift 2
DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in --dir) DIR="$2"; shift 2 ;; *) shift ;; esac
done
if grep -qF 'T-101' <<<"$PROMPT"; then
  echo "FATAL: T-101 must never reach a session — it is absent from the scope map" >&2
  exit 1
fi
if grep -qF 'T-100' <<<"$PROMPT"; then
  mkdir -p "$DIR/a"; echo hello > "$DIR/a/hello.txt"
  cat > "$DIR/docs/reviews/MANIFEST_T-100.md" <<EOF
# Completion Manifest — T-100

Maker: conductor
Verifier: conductor-review
Tracker updated: CHANGELOG.md

## Files produced
- \\\`a/hello.txt\\\`

## Decisions
- kept it simple

## Known issues
- none

## Verify result
- \\\`a/hello.txt\\\` written and present

## Memory written
- None — nothing durable

T-100 done -- wrote a/hello.txt.
EOF
fi
exit 0
`);
  chmodSync(opencodeStub, 0o755);

  return { base, target, jiraStub, opencodeStub, jiraCallLog };
}

test('conductor.mjs against the JIRA board driver: resolves from JIRA, respects the scope map, lands the mapped ticket, never claims the unmapped one', { timeout: 180_000 }, () => {
  const { base, target, jiraStub, opencodeStub, jiraCallLog } = setupFixture();
  try {
    // This is the assertion round 3 exists for: run the REAL conductor.mjs
    // subprocess exactly as the pilot did, supplying nothing it wouldn't
    // supply on a real run. No plan.json exists in `target` at all — proving
    // main()'s existsSync(PLAN_PATH) gate no longer blocks a file-less board,
    // and persistPlan()/loadPlan() are exercised through the conductor's own
    // call sites, not a convenient direct call.
    sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--actor', 'conductor',
      '--reviewer-actor', 'conductor-review', '--max-attempts', '2', '--no-push'], {
      cwd: target,
      env: {
        ...process.env,
        OPENCODE_BIN: opencodeStub,
        CONDUCTOR_BOARD: 'jira',
        JIRA_CLI: jiraStub,
        TICKET_SCOPE_MAP: 'docs/work/ticket-scope-map.json',
      },
    });

    // 1. T-100 landed: merged to main, JIRA release('done') called.
    const mergeLog = sh('git', ['log', '--merges', '--format=%s'], { cwd: target });
    assert.match(mergeLog, /T-100/, 'T-100 should be merged into main');
    assert.ok(existsSync(resolve(target, 'a/hello.txt')), 'T-100 in-scope file should exist on main');

    const calls = readFileSync(jiraCallLog, 'utf8');
    assert.match(calls, /^ready$/m, 'driver must resolve the board from `jira.sh ready`');
    assert.match(calls, /^claim T-100/m, 'T-100 must be claimed via jira.sh claim');
    assert.doesNotMatch(calls, /^claim T-101/m, 'T-101 must never be claimed — absent from the scope map');
    assert.match(calls, /^release T-100 done/m, 'T-100 must be released done via jira.sh, not left claimed');

    // 2. T-101 never reached a session at all. The opencode stub itself
    // enforces this (it exits 1 if T-101's title reaches its prompt); this
    // re-confirms it from the conductor's own log, so a future change to the
    // stub doesn't silently weaken the assertion.
    const log = readFileSync(resolve(target, 'docs/work/conductor-log.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(!log.some((r) => JSON.stringify(r).includes('T-101')), 'T-101 must never appear in the run log at all');

    // 3. No plan.json was ever written to disk — the JIRA board is not
    // file-backed, and BOARD_IS_FILE_BACKED must have suppressed persistPlan()'s
    // git add/commit rather than throwing on a path that never exists.
    assert.ok(!existsSync(resolve(target, 'plan.json')), 'JIRA board must never write a plan.json');
    const commitLog = sh('git', ['log', '--format=%s'], { cwd: target });
    assert.doesNotMatch(commitLog, /conductor claims ticket/, 'no plan.json commit should exist for a non-file-backed board');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
