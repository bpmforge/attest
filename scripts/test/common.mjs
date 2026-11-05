#!/usr/bin/env node
// common.mjs -- small shared helpers for the test-impact tools (map/ledger/select):
// git access, file listing, globbing, hashing, .sdlc/sdlc.json `test.*` keys.
// Pure node, no dependencies; every path handled here is repo-relative POSIX.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXCLUDE_DIRS = new Set([
  'node_modules', 'vendor', '.git', 'dist', 'build', 'target', '.venv', 'venv', '__pycache__',
  '.tox', 'coverage', '.next', '.nuxt', '.cache', '.turbo', '.worktrees', '.code-search',
  '.mypy_cache', '.pytest_cache', '.ruff_cache', '.gradle',
]);

export const MAP_REL = 'docs/work/test/map.json';
export const COVERS_REL = '.sdlc/test-covers.json';
export const LEDGER_REL = 'docs/work/test/ledger.json';
export const WORK_DIR_REL = 'docs/work/test/';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function git(root, args, opts = {}) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.status !== 0) return null;
  return r.stdout;
}

/** True when `root` is the git work-tree top level (repo-relative paths from git are then root-relative). */
export function isRepoRoot(root) {
  const p = git(root, ['rev-parse', '--show-prefix']);
  return p !== null && p.trim() === '';
}

export function headSha(root) {
  const o = git(root, ['rev-parse', 'HEAD']);
  return o ? o.trim() : null;
}

export function treeHash(root) {
  const o = git(root, ['rev-parse', 'HEAD^{tree}']);
  return o ? o.trim() : null;
}

/** Dirty + untracked paths (porcelain -z, renames expanded), test work dir excluded. */
export function dirtyFiles(root) {
  const out = git(root, ['status', '--porcelain', '-z', '-uall']);
  if (out === null) return [];
  const recs = out.split('\0');
  const res = new Set();
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i];
    if (!rec) continue;
    const st = rec.slice(0, 2);
    res.add(rec.slice(3));
    if (st.includes('R') || st.includes('C')) { i++; if (recs[i]) res.add(recs[i]); }
  }
  return [...res].filter((p) => !p.startsWith(WORK_DIR_REL)).sort();
}

export function walk(root, rel = '', out = []) {
  let ents;
  try { ents = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      walk(root, rel ? `${rel}/${e.name}` : e.name, out);
    } else if (e.isFile()) out.push(rel ? `${rel}/${e.name}` : e.name);
  }
  return out;
}

/** Every tracked-or-untracked, non-ignored file under root (fs walk when not a git repo root). */
export function listFiles(root) {
  let files = null;
  if (isRepoRoot(root)) {
    const o = git(root, ['ls-files', '-co', '--exclude-standard', '-z']);
    if (o !== null) files = o.split('\0').filter(Boolean).filter((f) => existsSync(join(root, f)));
  }
  if (files === null) files = walk(root);
  return files.filter((f) => !f.split('/').slice(0, -1).some((d) => EXCLUDE_DIRS.has(d))).sort();
}

export function globToRegExp(glob) {
  let g = glob.trim();
  if (g.endsWith('/')) g += '**';
  if (!g.includes('/')) g = `**/${g}`;
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const j = g.indexOf('}', i);
      if (j < 0) re += '\\{';
      else { re += `(?:${g.slice(i + 1, j).split(',').map((s) => s.replace(/[.+^$()|[\]\\*?]/g, '\\$&')).join('|')})`; i = j; }
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function globMatcher(globs) {
  const res = (globs ?? []).filter(Boolean).map(globToRegExp);
  return (p) => res.some((r) => r.test(p));
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJsonAtomic(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 1)}\n`);
  renameSync(tmp, file);
}

export const toPosix = (p) => p.split('\\').join('/');

/**
 * `.sdlc/sdlc.json` test.* keys. `test` is already a string key (the test command), so the
 * canonical spelling is a flat dotted key ("test.always": [...]); a nested `{ "test": { "always": ... } }`
 * object is also accepted. Absent file / key -> defaults.
 */
export function readTestConfig(root) {
  const cfg = readJson(join(root, '.sdlc', 'sdlc.json'), {}) ?? {};
  const get = (k) => {
    if (cfg[`test.${k}`] !== undefined) return cfg[`test.${k}`];
    if (cfg.test && typeof cfg.test === 'object' && cfg.test[k] !== undefined) return cfg.test[k];
    return undefined;
  };
  const list = (v) => (v === undefined || v === null ? null
    : Array.isArray(v) ? v.map(String) : String(v).split(/[\n,]/).map((s) => s.trim()).filter(Boolean));
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && v !== undefined && v !== '' ? n : d; };
  return {
    always: list(get('always')),
    rolling_days: num(get('rolling_days'), 7),
    max_changed: num(get('max_changed'), 400),
    global_inputs: list(get('global_inputs')) ?? [],
  };
}

/** Tiny argv parser: --k v | --k=v | --flag | positionals; repeatable keys collect into arrays. */
export function parseArgs(argv, { bool = [], multi = [] } = {}) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    let [k, v] = a.slice(2).split(/=(.*)/s);
    if (v === undefined && !bool.includes(k)) v = argv[++i];
    if (bool.includes(k)) v = true;
    if (multi.includes(k)) (o[k] ??= []).push(v); else o[k] = v;
  }
  return o;
}

/** True when `moduleUrl` is the script node was started with. Compares real paths: the installed copies are
 *  symlinks (~/.claude/scripts/test/select.mjs -> the checkout), and a plain argv[1] === import.meta.url check
 *  silently skips main() for them (exit 0, no output). */
export function isMain(moduleUrl) {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl)); } catch { return false; }
}
