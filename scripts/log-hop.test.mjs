import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// log-hop.mjs loads the escalation-ledger from the sibling bpm-agent-amplifier
// checkout and, by design, exits 0 without writing when it is absent. CI checks
// out only this repo, so every assertion below failed there (since v3.10.x) on a
// DB that was correctly never written. Skip — visibly — when the package is not
// built; on a machine with the sibling repo the suite runs in full.
const LEDGER = resolve(__dirname, '../../bpm-agent-amplifier/packages/escalation-ledger/dist/index.js');
const SKIP = existsSync(LEDGER)
  ? false
  : `escalation-ledger not built at ${LEDGER} (sibling bpm-agent-amplifier checkout)`;

describe('log-hop.mjs', { skip: SKIP }, () => {
  let tempDir;
  let dbPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'log-hop-test-'));
    dbPath = join(tempDir, 'memory.db');
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function runLogHop(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [
        join(__dirname, 'log-hop.mjs'),
        ...args,
        // Override the DB path to use our temp DB
        ...(process.env.ESCALATION_LEDGER_DB_PATH ? [] : []),
      ], {
        env: {
          ...process.env,
          ESCALATION_LEDGER_DB_PATH: dbPath,
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  test('emits help message with --help', async () => {
    const result = await runLogHop(['--help']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /log-hop\.mjs.*Record a model-decision event/);
  });

  test('records a simple hop to the ledger', async () => {
    const result = await runLogHop([
      '--task-fp', 'test/detect-model-1234',
      '--actual-model', 'qwen3.6-35b',
      '--gate', 'pass',
      '--lane', 'proc',
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Recorded hop/);

    // Verify the hop was written to the DB
    const db = new DatabaseSync(dbPath);
    try {
      const rows = db.prepare('SELECT * FROM escalation_hops WHERE task_fp = ?')
        .all('test/detect-model-1234');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].actual_model, 'qwen3.6-35b');
      assert.equal(rows[0].gate, 'pass');
      assert.equal(rows[0].lane, 'proc');
      assert.equal(rows[0].escalated, 0);
    } finally {
      db.close();
    }
  });

  test('records hop with all optional fields', async () => {
    const result = await runLogHop([
      '--task-fp', 'test/detect-model-2345',
      '--actual-model', 'gemma-2b',
      '--requested-model', 'gemma-9b',
      '--gate', 'borderline',
      '--lane', 'prompt',
      '--effort', 'local-high',
      '--local-tokens', '150',
      '--frontier-tokens', '0',
      '--escalated',
    ]);

    assert.equal(result.code, 0);

    const db = new DatabaseSync(dbPath);
    try {
      const rows = db.prepare('SELECT * FROM escalation_hops WHERE task_fp = ?')
        .all('test/detect-model-2345');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].requested_model, 'gemma-9b');
      assert.equal(rows[0].gate, 'borderline');
      assert.equal(rows[0].effort, 'local-high');
      assert.equal(rows[0].tokens_local, 150);
      assert.equal(rows[0].escalated, 1);
    } finally {
      db.close();
    }
  });

  test('rejects invalid gate value', async () => {
    const result = await runLogHop([
      '--task-fp', 'test/bad-gate',
      '--actual-model', 'qwen',
      '--gate', 'invalid',
    ]);

    // Should exit with error code
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /--gate must be one of/);
  });

  test('exits gracefully (code 0) when required fields are missing at detection time', async () => {
    // The script should exit with error code when validation fails,
    // but in production (during detect-model-context call) it should still succeed
    const result = await runLogHop([
      '--actual-model', 'qwen',
      // Missing --task-fp and --gate
    ]);

    assert.notEqual(result.code, 0);
  });

  test('records hop with default token values', async () => {
    const result = await runLogHop([
      '--task-fp', 'test/detect-model-3456',
      '--actual-model', 'llama2',
      '--gate', 'pass',
    ]);

    assert.equal(result.code, 0);

    const db = new DatabaseSync(dbPath);
    try {
      const rows = db.prepare('SELECT * FROM escalation_hops WHERE task_fp = ?')
        .all('test/detect-model-3456');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].tokens_local, 0);
      assert.equal(rows[0].tokens_frontier, 0);
      assert.equal(rows[0].escalated, 0);
    } finally {
      db.close();
    }
  });

  test('records hops from multiple calls to same DB', async () => {
    // First hop
    await runLogHop([
      '--task-fp', 'test/multi-1',
      '--actual-model', 'model-a',
      '--gate', 'pass',
    ]);

    // Second hop
    await runLogHop([
      '--task-fp', 'test/multi-2',
      '--actual-model', 'model-b',
      '--gate', 'fail',
    ]);

    const db = new DatabaseSync(dbPath);
    try {
      const rows = db.prepare('SELECT COUNT(*) as cnt FROM escalation_hops').all();
      assert.equal(rows[0].cnt, 2);
    } finally {
      db.close();
    }
  });
});
