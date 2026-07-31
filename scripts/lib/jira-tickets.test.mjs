// jira-tickets.test.mjs — node --test suite for the JIRA board driver
// (scripts/lib/jira-tickets.mjs). Same style as the existing conductor
// tests: real temp dirs, a stub `jira.sh` (shell fixture) so the suite
// never touches real JIRA and never needs credentials.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadPlan,
  savePlan,
  claim,
  release,
  accept,
} from './jira-tickets.mjs';

// Builds a stub jira.sh whose behaviour is driven entirely by env vars, so
// each test can script a different scenario without touching real JIRA.
//   STUB_READY        -> stdout for `ready`
//   STUB_BLOCKERS_<K>  -> stdout + exit code for `blockers <K>`, "code:text"
//   STUB_CLAIM_CODE    -> exit code for `claim`
//   STUB_CLAIM_OUT     -> stdout/stderr text for `claim`
function writeStubCli(dir) {
  const path = resolve(dir, 'jira.sh');
  writeFileSync(
    path,
    `#!/usr/bin/env bash
set -euo pipefail
cmd="\${1:-}"
case "$cmd" in
  ready)
    printf '%s\\n' "\${STUB_READY:-}"
    ;;
  blockers)
    key="\${2:?}"
    var="STUB_BLOCKERS_\${key//-/_}"
    val="\${!var:-0:}"
    code="\${val%%:*}"
    text="\${val#*:}"
    printf '%s\\n' "$text"
    exit "$code"
    ;;
  claim)
    printf '%s\\n' "\${STUB_CLAIM_OUT:-CLAIMED ok}" >&2
    exit "\${STUB_CLAIM_CODE:-0}"
    ;;
  release)
    printf '%s\\n' "\${STUB_RELEASE_OUT:-RELEASED ok}"
    exit "\${STUB_RELEASE_CODE:-0}"
    ;;
  comment)
    printf 'ok — comment appended\\n'
    exit 0
    ;;
  *)
    echo "stub jira.sh: unknown command $cmd" >&2
    exit 2
    ;;
esac
`,
  );
  chmodSync(path, 0o755);
  return path;
}

function setupFixture(scopeMap) {
  const dir = mkdtempSync(resolve(tmpdir(), 'jira-board-driver-'));
  const cli = writeStubCli(dir);
  const workDir = resolve(dir, 'docs', 'work');
  mkdirSync(workDir, { recursive: true });
  const scopeMapPath = resolve(workDir, 'ticket-scope-map.json');
  writeFileSync(scopeMapPath, JSON.stringify({ tickets: scopeMap }, null, 2));
  return { dir, cli, scopeMapPath };
}

function withEnv(env, fn) {
  const prior = {};
  for (const k of Object.keys(env)) prior[k] = process.env[k];
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
  }
}

test('a ticket present in the scope map becomes a claimable module with the right write_scope', () => {
  const { dir, cli, scopeMapPath } = setupFixture({
    'PROJ-1': {
      title: 'Test ticket',
      write_scope: ['src/**'],
      acceptance: ['does the thing'],
      verify: 'true',
      manifest: 'docs/reviews/MANIFEST_PROJ-1.md',
    },
  });
  try {
    const plan = withEnv(
      { JIRA_CLI: cli, TICKET_SCOPE_MAP: scopeMapPath, STUB_READY: 'PROJ-1  Test ticket' },
      () => loadPlan(dir),
    );
    assert.equal(plan.modules.length, 1);
    assert.equal(plan.modules[0].id, 'PROJ-1');
    assert.deepEqual(plan.modules[0].write_scope, ['src/**']);
    assert.equal(plan.modules[0].status, 'ready');
    assert.equal(plan.omitted.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a ticket absent from the scope map is omitted, with the reason logged', () => {
  const { dir, cli, scopeMapPath } = setupFixture({});
  try {
    const plan = withEnv(
      { JIRA_CLI: cli, TICKET_SCOPE_MAP: scopeMapPath, STUB_READY: 'PROJ-9  Not in scope map' },
      () => loadPlan(dir),
    );
    assert.equal(plan.modules.length, 0);
    assert.equal(plan.omitted.length, 1);
    assert.equal(plan.omitted[0].id, 'PROJ-9');
    assert.match(plan.omitted[0].reason, /no entry in TICKET_SCOPE_MAP/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claim() returns failure when the stub prints RACED', () => {
  const { dir, cli, scopeMapPath } = setupFixture({});
  try {
    const result = withEnv(
      { JIRA_CLI: cli, TICKET_SCOPE_MAP: scopeMapPath, STUB_CLAIM_CODE: '4', STUB_CLAIM_OUT: 'RACED PROJ-1: now owned by other. Backing off.' },
      () => claim({ modules: [] }, 'PROJ-1', 'me'),
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /RACED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('accept() still refuses when actor === owner', () => {
  const plan = {
    modules: [
      {
        id: 'PROJ-1',
        owner: 'me',
        status: 'in_review',
        manifest: 'MANIFEST.md',
        evidence: { branch: 'feat/x', commits: ['abc123'] },
      },
    ],
  };
  const result = accept(plan, 'PROJ-1', 'me', { cwd: process.cwd() });
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot accept their own work/);
});

test('savePlan() writes no plan.json', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'jira-board-driver-save-'));
  try {
    savePlan(resolve(dir, 'plan.json'), { modules: [] });
    assert.equal(existsSync(resolve(dir, 'plan.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
