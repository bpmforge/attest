#!/usr/bin/env node
// map.mjs -- impact map: for every test file, the repo files it (transitively) imports.
//
//   docs/work/test/map.json (git-ignored)
//   { version: 1, generated, meta: { tests, files, parsed, reused, stacks, index, uc_priority },
//     tests: { "<test file>": { runner, project, kind: unit|integration|e2e|smoke, uc: ["UC-03"],
//                               covers: [repo files], sha, declared?: [...], last_run?: {sha,result,ms}, flaky? } },
//     graph: { "<file>": { sha, mt, p: <parse result> } } }     // parse cache: unchanged files are never re-parsed
//
// Usage:
//   map.mjs build|refresh [--root .] [--full] [--out docs/work/test/map.json] [--index auto|off]
//   map.mjs declare <test> <src...> [--root .]     (agents record covers when they write a test; persisted in
//                                                   the committed .sdlc/test-covers.json and merged by every build/refresh)
//   map.mjs show <test> [--root .]
//
// build and refresh are the same operation: incremental (mtime+size, then sha256, per file; only changed
// files are re-parsed); string literals naming repo files/dirs inside a test count as covers; --full discards the cache. The optional code-search index (.code-search/index.db)
// contributes extra import edges when it has a recognizable import table; regex resolution always runs.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, posix, resolve } from 'node:path';
import { MAP_REL, COVERS_REL, listFiles, parseArgs, readJson, sha256, writeJsonAtomic, isMain } from './common.mjs';
import { langOf, makeResolver, parseSource } from './resolve.mjs';

const pdn = (f) => (posix.dirname(f) === '.' ? '' : posix.dirname(f));
const pjoin = (...p) => posix.normalize(posix.join(...p)).replace(/^\.\//, '').replace(/^\.$/, '');

const CONFIG_RX = {
  vitest: /^vitest\.(config|workspace)\.[cm]?[jt]s(on)?$/,
  jest: /^jest\.config\.[cm]?[jt]s(on)?$/,
  playwright: /^playwright\.config\.[cm]?[jt]s$/,
};

// ---- optional code-search index -------------------------------------------------------------
function readIndexEdges(root, resolver) {
  const db = join(root, '.code-search', 'index.db');
  if (!existsSync(db)) return { state: 'absent', extra: new Map() };
  const prevWarn = process.emitWarning;
  try {
    process.emitWarning = () => {};
    const sqlite = process.getBuiltinModule?.('node:sqlite');
    if (!sqlite) return { state: 'present: node:sqlite unavailable (regex only)', extra: new Map() };
    const d = new sqlite.DatabaseSync(db, { readOnly: true });
    const tables = d.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name);
    const SRC = ['file', 'file_path', 'path', 'src', 'source', 'source_file', 'from_file', 'importer'];
    const DST = ['target', 'target_file', 'to_file', 'dst', 'imported', 'module', 'import_path', 'specifier', 'resolved'];
    const extra = new Map(); let used = 0;
    for (const t of tables.filter((n) => /import|depend|edge/i.test(n))) {
      const cols = d.prepare(`pragma table_info("${t.replace(/"/g, '')}")`).all().map((c) => c.name);
      const s = SRC.find((c) => cols.includes(c)); const dc = DST.find((c) => cols.includes(c));
      if (!s || !dc) continue;
      for (const row of d.prepare(`select "${s}" as s, "${dc}" as d from "${t}"`).all()) {
        const src = String(row.s ?? '').replace(/^\.\//, ''); const dst = String(row.d ?? '');
        if (!src) continue;
        let hits = [];
        if (resolver.ctx.has(dst)) hits = [dst];
        else if (langOf(src) === 'js') hits = resolver.edges(src, { raw: [dst] });
        else if (langOf(src) === 'py') hits = resolver.edges(src, { raw: [{ m: dst, lvl: 0, n: [] }] });
        for (const h of hits) { (extra.get(src) ?? extra.set(src, new Set()).get(src)).add(h); used++; }
      }
    }
    d.close();
    return { state: used ? `used: ${used} edge(s)` : 'present: no recognizable import table (regex only)', extra };
  } catch (e) {
    return { state: `present: unreadable (${String(e.message).slice(0, 60)}); regex only`, extra: new Map() };
  } finally { process.emitWarning = prevWarn; }
}

// ---- use cases -----------------------------------------------------------------------------
function readUcPriority(root, files) {
  const f = ['docs/testing/USE_CASES.md', 'docs/USE_CASES.md'].find((x) => files.includes(x));
  const pri = {};
  if (!f) return pri;
  for (const line of readFileSync(join(root, f), 'utf8').split('\n')) {
    const ids = line.match(/UC-\d+/g); if (!ids) continue;
    const p = /\b[Pp]0\b/.test(line) ? 'P0' : /\b[Pp]1\b/.test(line) ? 'P1' : /\b[Pp]2\b/.test(line) ? 'P2' : null;
    if (!p) continue;
    for (const id of ids) if (!pri[id] || p < pri[id]) pri[id] = p;
  }
  return pri;
}

// ---- main ------------------------------------------------------------------------------------
export function refreshMap(rootIn, opts = {}) {
  const root = resolve(rootIn ?? '.');
  const outRel = opts.out ?? MAP_REL;
  const outAbs = resolve(root, outRel);
  const prevMap = readJson(outAbs, null);
  const prev = !opts.full && prevMap?.version === 1 ? prevMap : null;
  const prevGraph = prev?.graph ?? {};
  const files = listFiles(root);
  const fileSet = new Set(files);
  const stats = { parsed: 0, reused: 0, parsedFiles: [] };

  const graph = {};
  for (const rel of files) {
    if (!langOf(rel)) continue;
    const st = statSync(join(root, rel));
    const mt = `${st.mtimeMs}:${st.size}`;
    const pg = prevGraph[rel];
    if (pg && pg.mt === mt && pg.p && 'lits' in pg.p) { graph[rel] = pg; stats.reused++; continue; }
    const buf = readFileSync(join(root, rel));
    const sha = sha256(buf);
    if (pg && pg.sha === sha && pg.p && 'lits' in pg.p) { graph[rel] = { ...pg, mt }; stats.reused++; continue; }
    graph[rel] = { sha, mt, p: parseSource(langOf(rel), buf.toString('utf8')) };
    stats.parsed++; stats.parsedFiles.push(rel);
  }

  const resolver = makeResolver(root, files);
  resolver.prepare((f) => graph[f]?.p);
  const idx = opts.index === 'off' ? { state: 'off', extra: new Map() } : readIndexEdges(root, resolver);
  const edgeOf = new Map();
  for (const f of Object.keys(graph)) {
    const e = new Set(resolver.edges(f, graph[f].p));
    for (const x of idx.extra.get(f) ?? []) if (x !== f) e.add(x);
    edgeOf.set(f, [...e]);
  }

  // ---- runner detection helpers
  const pkgCache = new Map();
  const pkgAt = (d) => {
    if (!pkgCache.has(d)) pkgCache.set(d, fileSet.has(pjoin(d, 'package.json')) ? readJson(join(root, d, 'package.json'), null) : null);
    return pkgCache.get(d);
  };
  const dirsUp = (d) => { const out = [d]; while (d !== '') { d = pdn(d); out.push(d); } return out; };
  const signalAt = (d, name) => {
    const dirFiles = (resolver.ctx.byDir.get(d) ?? []).map((f) => basename(f));
    if (dirFiles.some((f) => CONFIG_RX[name].test(f))) return true;
    const pj = pkgAt(d); if (!pj) return false;
    const dep = { ...pj.dependencies, ...pj.devDependencies };
    return name === 'playwright' ? '@playwright/test' in dep : name in dep || (name === 'jest' && !!pj.jest);
  };
  const nearestSignal = (d, name) => dirsUp(d).find((x) => signalAt(x, name));
  const projectOf = (d) => dirsUp(d).find((x) => fileSet.has(pjoin(x, 'package.json'))) ?? '';

  const discover = (rel, p) => {
    const lang = langOf(rel); const b = basename(rel); const d = pdn(rel);
    if (lang === 'js') {
      // `test-<chapter>.ts` (hyphen prefix) is the script-style chapter convention some harnesses use
      const named = /\.(test|spec)\.[cm]?[jt]sx?$/.test(b) || /^test-[\w.-]+\.[cm]?[jt]s$/.test(b);
      const inDir = /(^|\/)__tests__\//.test(rel) && !/(^|\/)__tests__\/(?:.*\/)?(fixtures?|helpers?|mocks?|__mocks__|__fixtures__|utils?|support)\//.test(rel) && !b.startsWith('_');
      if (!named && !inDir) return null;
      const spec = /\.spec\./.test(b);
      if (p.pw || (spec && /(^|\/)(e2e|playwright)(\/|$)/.test(rel) && nearestSignal(d, 'playwright') !== undefined)) {
        return { runner: 'playwright', project: nearestSignal(d, 'playwright') ?? '' };
      }
      let runner;
      if (p.vitest) runner = 'vitest'; else if (p.jestg) runner = 'jest'; else if (p.nodetest) runner = 'node';
      else {
        const v = nearestSignal(d, 'vitest'); const j = nearestSignal(d, 'jest');
        if (v !== undefined && (j === undefined || v.length >= j.length)) runner = 'vitest';
        else if (j !== undefined) runner = 'jest'; else runner = 'node';
      }
      return { runner, project: projectOf(d) };
    }
    if (lang === 'py') {
      if (b === 'conftest.py' || !(/^test_.*\.py$/.test(b) || /_test\.py$/.test(b))) return null;
      return { runner: 'pytest', project: '' };
    }
    if (lang === 'go') {
      if (!b.endsWith('_test.go')) return null;
      const gm = resolver.ctx.goMods.filter((m) => m.dir === '' || rel.startsWith(`${m.dir}/`)).sort((x, y) => y.dir.length - x.dir.length)[0];
      return { runner: 'go', project: gm?.dir ?? '' };
    }
    if (lang === 'rs') {
      const c = resolver.ctx.crateOf(rel); if (!c) return null;
      const inTests = pdn(rel) === pjoin(c.dir, 'tests');
      const unit = p.cfgTest && rel.startsWith(pjoin(c.dir, 'src') + '/');
      if (!inTests && !unit) return null;
      // project = the cargo workspace root (so `cargo test -p <crate>` runs from one place), else the crate dir
      const ws = dirsUp(c.dir).find((x) => fileSet.has(pjoin(x, 'Cargo.toml')) && /^\[workspace\]/m.test(readFileSync(join(root, x, 'Cargo.toml'), 'utf8')));
      return { runner: 'cargo', project: ws ?? c.dir, crate: c.name, unit: !!unit };
    }
    return null;
  };

  const prio = readUcPriority(root, files);
  const committed = readCovers(root);
  const dirFiles = (d) => files.filter((f) => f.startsWith(`${d}/`));
  // repo files/dirs named by string literals in a test (spawned scripts, fixtures); dirs expand to non-test files
  const literalTargets = (rel, p) => {
    const hit = new Set();
    for (const raw of p.lits ?? []) {
      const lit = posix.normalize(raw.replace(/^\.\//, '')).replace(/\/+$/, '');
      for (const cand of new Set([lit, pjoin(pdn(rel), lit)])) {
        if (!cand || cand.startsWith('..') || cand === rel) continue;
        if (fileSet.has(cand)) { hit.add(cand); break; }
        const under = dirFiles(cand);
        if (under.length) {
          let n = 0;
          for (const f of under) { if (f !== rel && !discover(f, graph[f]?.p)) { hit.add(f); if (++n >= 500) break; } }
          break;
        }
      }
    }
    return [...hit];
  };
  const tests = {};
  for (const [rel, g] of Object.entries(graph)) {
    const disc = discover(rel, g.p); if (!disc) continue;
    // transitive closure over import edges (+ conftest.py ancestors for pytest)
    const lt = literalTargets(rel, g.p);
    const seeds = [...(edgeOf.get(rel) ?? []), ...lt];
    if (disc.runner === 'pytest') for (const d of dirsUp(pdn(rel))) { const c = pjoin(d, 'conftest.py'); if (fileSet.has(c)) seeds.push(c); }
    const seen = new Set(); const stack = seeds;
    while (stack.length) {
      const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
      for (const n of edgeOf.get(f) ?? []) if (!seen.has(n)) stack.push(n);
    }
    if (!disc.unit) seen.delete(rel); else seen.add(rel);
    const pt = prev?.tests?.[rel] ?? prevMap?.tests?.[rel];
    const declared = [...new Set([...(pt?.declared ?? []), ...(committed[rel] ?? [])])].sort();
    for (const dcl of declared) seen.add(dcl);
    const ucs = new Set(g.p.uc ?? []);
    for (const m of rel.matchAll(/uc-(\d+)/gi)) ucs.add(`UC-${m[1]}`);
    const e2e = disc.runner === 'playwright' || /(^|\/)(e2e|end-to-end)(\/|$)/i.test(rel);
    const kind = /smoke|contract/i.test(rel) ? 'smoke' : e2e ? 'e2e'
      : (/integration/i.test(rel) || g.p.integ) ? 'integration' : 'unit';
    tests[rel] = {
      runner: disc.runner, project: disc.project, ...(disc.crate ? { crate: disc.crate } : {}),
      kind, uc: [...ucs].sort(), covers: [...seen].sort(), sha: g.sha,
      ...(declared.length ? { declared } : {}),
      ...(pt?.last_run ? { last_run: pt.last_run } : {}), ...(pt?.flaky ? { flaky: true } : {}),
    };
  }
  // declared-only entries (a test declared before discovery could see it) survive while the file exists
  for (const [rel, pt] of Object.entries(prevMap?.tests ?? {})) {
    if (!tests[rel] && pt.declared_only && fileSet.has(rel)) tests[rel] = pt;
  }

  for (const [rel, srcs] of Object.entries(committed)) {
    if (!tests[rel] && fileSet.has(rel)) tests[rel] = { runner: 'unknown', project: '', kind: 'unit', uc: [], covers: [...srcs].sort(), sha: null, declared: [...srcs].sort(), declared_only: true };
  }

  const stacks = [...new Set(Object.values(tests).map((t) => t.runner))].sort();
  const body = {
    version: 1,
    meta: { tests: Object.keys(tests).length, files: Object.keys(graph).length, stacks, index: idx.state, uc_priority: prio },
    tests,
    graph,
  };
  const comparable = (m) => JSON.stringify({ ...m, generated: undefined, meta: { ...m?.meta, parsed: undefined, reused: undefined } });
  const changed = !prevMap || comparable(prevMap) !== comparable(body);
  if (changed) writeJsonAtomic(outAbs, { ...body, generated: new Date().toISOString() });
  return { map: changed ? body : prevMap, out: outRel, stats, wrote: changed, full: !!opts.full || !prev };
}

/** .sdlc/test-covers.json: { "<test file>": ["src", ...] } -- committed, so declarations survive clones. */
export function readCovers(root) {
  const j = readJson(resolve(root, COVERS_REL), null);
  const out = {};
  if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) if (Array.isArray(v)) out[k] = [...new Set(v.map(String))].sort();
  return out;
}

export function declare(root, test, srcs, opts = {}) {
  const relTest = test.replace(/^\.\//, '');
  const cov = readCovers(root);
  cov[relTest] = [...new Set([...(cov[relTest] ?? []), ...srcs.map((s) => s.replace(/^\.\//, ''))])].sort();
  const sorted = Object.fromEntries(Object.keys(cov).sort().map((k) => [k, cov[k]]));
  writeJsonAtomic(resolve(root, COVERS_REL), sorted);
  const r = refreshMap(root, opts);
  const outAbs = resolve(root, r.out);
  const m = readJson(outAbs);
  const rel = test.replace(/^\.\//, '');
  const t = m.tests[rel] ?? { runner: 'unknown', project: '', kind: 'unit', uc: [], covers: [], sha: null, declared_only: true };
  t.declared = [...new Set([...(t.declared ?? []), ...srcs.map((s) => s.replace(/^\.\//, ''))])].sort();
  t.covers = [...new Set([...(t.covers ?? []), ...t.declared])].sort();
  m.tests[rel] = t;
  writeJsonAtomic(outAbs, m);
  return t;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const a = parseArgs(rest, { bool: ['full'] });
  const root = resolve(a.root ?? '.');
  if (cmd === 'build' || cmd === 'refresh') {
    const r = refreshMap(root, { full: !!a.full, out: a.out, index: a.index });
    process.stdout.write(`${JSON.stringify({ out: r.out, tests: r.map.meta.tests, files: r.map.meta.files, parsed: r.stats.parsed, reused: r.stats.reused, full: r.full, index: r.map.meta.index })}\n`);
  } else if (cmd === 'declare') {
    const [test, ...srcs] = a._;
    if (!test || !srcs.length) { process.stderr.write('usage: map.mjs declare <test> <src...>\n'); process.exit(2); }
    process.stdout.write(`${JSON.stringify(declare(root, test, srcs, { out: a.out }))}\n`);
  } else if (cmd === 'show') {
    const m = readJson(resolve(root, a.out ?? MAP_REL), null);
    const t = m?.tests?.[(a._[0] ?? '').replace(/^\.\//, '')];
    if (!t) { process.stderr.write(`map.mjs: ${a._[0] ?? '(none)'} not in ${a.out ?? MAP_REL} (run refresh first)\n`); process.exit(1); }
    process.stdout.write(`${JSON.stringify({ test: a._[0], ...t }, null, 1)}\n`);
  } else {
    process.stderr.write('usage: map.mjs build|refresh|declare|show [--root .] [--full] [--out docs/work/test/map.json]\n'); process.exit(2);
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
