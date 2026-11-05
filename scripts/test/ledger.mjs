#!/usr/bin/env node
// ledger.mjs -- test ledger (docs/work/test/ledger.json, git-ignored), the sibling of the
// scan ledger (docs/work/scan/ledger.json, scripts/scan/collect.sh):
//
//   { version: 1,
//     full:  { tree, sha, date, runners } | null,   // last GREEN full run
//     chain: <impact runs since that full run>,       // drift guard: >= 20 forces full (select.mjs)
//     files: { "<test file>": { result: "pass|fail|skip", last_run: ISO, ms, sha, flaky? } },
//     dirty_files: [paths dirty at the last recorded run] }
//
// Usage (CLI):  ledger.mjs show [--root .]
//               ledger.mjs record --scope full|impact --results <results.json> [--root .] [--runners '{"vitest":"2.1.0"}']
//   results.json = [{ "file": "tests/a.test.ts", "result": "pass|fail|skip", "ms": 12, "flaky": false }, ...]

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LEDGER_REL, MAP_REL, dirtyFiles, git, headSha, parseArgs, readJson, treeHash, writeJsonAtomic, isMain } from './common.mjs';

export const MAX_CHAIN = Number(process.env.TEST_MAX_CHAIN ?? 20);

export const emptyLedger = () => ({ version: 1, full: null, chain: 0, files: {}, dirty_files: [] });

export function readLedger(root, file = LEDGER_REL) {
  const l = readJson(join(root, file), null);
  return l && typeof l === 'object' && l.version === 1 ? l : null;
}

/** True when `sha` is an ancestor of (or equal to) `head`. */
export function isAncestor(root, sha, head = 'HEAD') {
  if (!sha) return false;
  const r = git(root, ['merge-base', '--is-ancestor', sha, head]);
  return r !== null;
}

const norm = (r) => {
  const s = String(r ?? '').toLowerCase();
  if (['pass', 'passed', 'ok', 'green'].includes(s)) return 'pass';
  if (['skip', 'skipped', 'pending', 'todo'].includes(s)) return 'skip';
  return 'fail';
};

/**
 * Record a run. scope "full": a run with no failures becomes the new baseline (full + chain 0);
 * a red full run only updates per-file results. scope "impact": chain + 1.
 * Also mirrors last_run/flaky into map.json when it exists (T3 writes it this way).
 */
export function recordRun(root, scope, results, opts = {}) {
  const ledgerFile = opts.ledger ?? LEDGER_REL;
  const L = readLedger(root, ledgerFile) ?? emptyLedger();
  const sha = opts.sha ?? headSha(root);
  const now = opts.now ? new Date(opts.now) : new Date();
  const iso = now.toISOString();
  const mapFile = join(root, opts.map ?? MAP_REL);
  const map = existsSync(mapFile) ? readJson(mapFile, null) : null;
  let red = 0;
  for (const r of results) {
    const result = norm(r.result);
    if (result === 'fail') red++;
    const prev = L.files[r.file] ?? {};
    const e = { result, last_run: iso, ms: Number(r.ms ?? 0), sha };
    const flaky = r.flaky === undefined ? prev.flaky : r.flaky;
    if (flaky) e.flaky = true;
    L.files[r.file] = e;
    if (map?.tests?.[r.file]) {
      map.tests[r.file].last_run = { sha, result, ms: e.ms };
      if (e.flaky) map.tests[r.file].flaky = true; else delete map.tests[r.file].flaky;
    }
  }
  const dirty = dirtyFiles(root);
  if (scope === 'full') {
    if (red === 0) {
      L.full = { tree: dirty.length ? null : treeHash(root), sha, date: iso, runners: opts.runners ?? L.full?.runners ?? {} };
      L.chain = 0;
    }
  } else L.chain = (L.chain ?? 0) + 1;
  L.dirty_files = dirty;
  writeJsonAtomic(join(root, ledgerFile), L);
  if (map) writeJsonAtomic(mapFile, map);
  return L;
}

/** Effective last run: the later of the file's own record and the last green full run (which ran everything). */
export function lastRunMs(ledger, file) {
  const own = Date.parse(ledger?.files?.[file]?.last_run ?? '');
  const full = Date.parse(ledger?.full?.date ?? '');
  const v = Math.max(Number.isFinite(own) ? own : -Infinity, Number.isFinite(full) ? full : -Infinity);
  return Number.isFinite(v) ? v : null;
}

/** Files not run for more than `days` (never run, with no full run on record, counts as stale). */
export function rolling(files, days, ledger, now = Date.now()) {
  const cutoff = now - days * 86_400_000;
  return files.filter((f) => { const t = lastRunMs(ledger, f); return t === null || t < cutoff; });
}

/** Files whose last result was fail/skip or that are flagged flaky. */
export function failing(files, ledger) {
  return files.filter((f) => { const e = ledger?.files?.[f]; return e && (e.result !== 'pass' || e.flaky); });
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const a = parseArgs(rest);
  const root = resolve(a.root ?? '.');
  if (cmd === 'show') {
    process.stdout.write(`${JSON.stringify(readLedger(root, a.ledger) ?? null, null, 1)}\n`);
  } else if (cmd === 'record') {
    if (!['full', 'impact'].includes(a.scope) || !a.results) { process.stderr.write('usage: ledger.mjs record --scope full|impact --results <file.json>\n'); process.exit(2); }
    const results = readJson(resolve(root, a.results), null);
    if (!Array.isArray(results)) { process.stderr.write('ledger.mjs: results must be a JSON array\n'); process.exit(2); }
    const L = recordRun(root, a.scope, results, { runners: a.runners ? JSON.parse(a.runners) : undefined, ledger: a.ledger });
    process.stdout.write(`${JSON.stringify({ scope: a.scope, chain: L.chain, full: L.full })}\n`);
  } else {
    process.stderr.write('usage: ledger.mjs show|record [--root .]\n'); process.exit(2);
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
