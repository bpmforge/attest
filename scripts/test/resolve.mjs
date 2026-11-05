#!/usr/bin/env node
// resolve.mjs -- static import extraction + resolution for the test-impact map.
//
// parseSource(lang, text)  -> JSON-able parse result (cached in map.json by file sha):
//                             { raw: [...], integ: bool, uc: [UC-ids on assertion lines], cfgTest: bool, pw: bool }
// makeResolver(root, files) -> { edges(file, parsed) -> [repo files], ctx }
//
// Languages: TS/JS (relative, tsconfig paths/baseUrl, package workspaces, index + .js->.ts),
// Python (absolute/relative, packages), Go (go.mod module path -> package dirs),
// Rust (mod / use / crate paths inside a crate, crate deps from Cargo.toml).
// Regex-based on purpose (no toolchain needed); it over-approximates rather than misses.

import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

const { dirname, join, basename, normalize } = posix;

export const LANG_BY_EXT = {
  '.ts': 'js', '.tsx': 'js', '.mts': 'js', '.cts': 'js', '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
  '.py': 'py', '.go': 'go', '.rs': 'rs',
};
const JS_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const JS_SWAP = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };

export const extOf = (f) => { const i = f.lastIndexOf('.'); return i < 0 ? '' : f.slice(i); };
export const langOf = (f) => LANG_BY_EXT[extOf(f)] ?? null;

const UC_LINE = /(describe|it|test|context)\(|def\s+test_|func\s+Test|#\[test\]|\bfn\s+test_/;
const INTEG_MOD = /^(?:node:)?(?:supertest|testcontainers|pg|mysql2?|redis|ioredis|mongoose|mongodb|knex|typeorm|sequelize|better-sqlite3|sqlite3?|express|fastify|koa|hono|http|https|msw|nock|fastapi\.testclient|fastapi|flask|django|psycopg2?|asyncpg|sqlalchemy|pymongo|requests|httpx|aiohttp|uvicorn|net\/http|database\/sql|sqlx|diesel|reqwest|hyper|axum|actix_web|tokio_postgres|rusqlite)(?:[/.:]|$)|^@prisma\//;
const INTEG_TXT = /\.listen\(|createServer\(|TestClient\(|httptest\.New|TcpListener::bind|sql\.Open\(/;

function stripJsComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\/|(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
}

function parseJs(text) {
  const t = stripJsComments(text);
  const raw = new Set();
  const rxs = [
    /\b(?:import|export)\b(?:[^;'"]{0,400}?\bfrom\b)?\s*['"]([^'"\n]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /\b(?:mock|doMock|unmock|requireActual|importActual|requireMock|importMock|setMock)\s*\(\s*['"]([^'"\n]+)['"]/g,
    /\brequire\.resolve\s*\(\s*['"]([^'"\n]+)['"]/g,
  ];
  for (const rx of rxs) for (const m of t.matchAll(rx)) raw.add(m[1]);
  const spec = [...raw];
  return { raw: spec, pw: spec.includes('@playwright/test'), vitest: spec.includes('vitest'), jestg: spec.includes('@jest/globals'), nodetest: spec.includes('node:test') };
}

function parsePy(text) {
  const t = text.replace(/#[^\n]*/g, '');
  const raw = [];
  for (const m of t.matchAll(/^[ \t]*import[ \t]+([^\n;]+)/gm)) {
    for (const part of m[1].split(',')) {
      const mod = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[\w.]+$/.test(mod)) raw.push({ m: mod, lvl: 0, n: [] });
    }
  }
  for (const m of t.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n;\\]+)/gm)) {
    const names = m[3].replace(/[()\\]/g, ' ').split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter((s) => /^\w+$/.test(s));
    raw.push({ m: m[2], lvl: m[1].length, n: names });
  }
  return { raw };
}

function parseGo(text) {
  const t = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const raw = new Set();
  for (const m of t.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) for (const s of m[1].matchAll(/"([^"\n]+)"/g)) raw.add(s[1]);
  for (const m of t.matchAll(/\bimport\s+(?:[\w.]+\s+)?"([^"\n]+)"/g)) raw.add(m[1]);
  return { raw: [...raw] };
}

/** Expand `a::{b, c::{d, e}}` into leaf paths. */
function expandUse(s) {
  const i = s.indexOf('{');
  if (i < 0) return [s.replace(/\s+/g, '').replace(/::\*$/, '').replace(/\s+as\s+\w+$/, '')];
  let depth = 0; let j = i;
  for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
  const prefix = s.slice(0, i); const inner = s.slice(i + 1, j); const rest = s.slice(j + 1);
  const parts = []; let d = 0; let cur = '';
  for (const c of inner) {
    if (c === '{') d++; if (c === '}') d--;
    if (c === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts.filter((p) => p.trim()).flatMap((p) => {
    const q = p.trim();
    if (q === 'self') return [prefix.replace(/::$/, '').replace(/\s+/g, '')];
    return expandUse(prefix + q + rest);
  });
}

function parseRs(text) {
  const t = text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, '$1');
  const raw = [];
  for (const m of t.matchAll(/^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?mod[ \t]+(\w+)[ \t]*;/gm)) raw.push({ k: 'mod', n: m[1] });
  for (const m of t.matchAll(/\buse\s+([^;]+);/g)) for (const p of expandUse(m[1])) if (p) raw.push({ k: 'path', p });
  for (const m of t.matchAll(/\b((?:crate|super|self|[a-z_]\w*))::([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/g)) raw.push({ k: 'path', p: `${m[1]}::${m[2]}` });
  const seen = new Set(); const dedup = [];
  for (const r of raw) { const k = JSON.stringify(r); if (!seen.has(k)) { seen.add(k); dedup.push(r); } }
  return { raw: dedup, cfgTest: /#\[cfg\(test\)\]/.test(t) };
}

const rawStrings = (lang, raw) => raw.map((r) => (typeof r === 'string' ? r : r.m ?? r.p ?? r.n ?? '')).filter(Boolean)
  .map((s) => (lang === 'rs' ? s.split('::')[0] : s));

// String literals that look like repo paths ('scripts/x.mjs', `scripts/test/`): spawn-based harnesses name their
// targets this way. Candidates only; map.mjs keeps the ones that resolve to an existing file or directory.
export function pathLiterals(text) {
  const out = new Set();
  for (const m of text.matchAll(/(["'`])([^"'`\\\n$]{3,200})\1/g)) {
    const v = m[2].trim();
    if (!/^[\w@.\-/]+$/.test(v) || !(v.includes('/') || /\.\w+$/.test(v)) || /^\.+\/?$/.test(v)) continue;
    out.add(v);
    if (out.size >= 300) break;
  }
  return [...out].sort();
}

export function parseSource(lang, text) {
  const base = lang === 'js' ? parseJs(text) : lang === 'py' ? parsePy(text) : lang === 'go' ? parseGo(text) : parseRs(text);
  const uc = new Set();
  for (const line of text.split('\n')) {
    const ids = line.match(/\bUC-\d+\b/g);
    if (ids && UC_LINE.test(line)) ids.forEach((i) => uc.add(i));
  }
  return {
    ...base,
    lits: pathLiterals(text),
    uc: [...uc].sort(),
    integ: rawStrings(lang, base.raw).some((s) => INTEG_MOD.test(s)) || INTEG_TXT.test(text),
  };
}

// ------------------------------------------------------------------ resolver

export function stripJsonComments(t) {
  let out = ''; let inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { out += c; if (c === '\\') out += t[++i] ?? ''; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && t[i + 1] === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export function makeResolver(root, files) {
  const fileSet = new Set(files);
  const byDir = new Map();
  for (const f of files) { const d = dirname(f) === '.' ? '' : dirname(f); (byDir.get(d) ?? byDir.set(d, []).get(d)).push(f); }
  const read = (rel) => { try { return readFileSync(join(root, rel), 'utf8'); } catch { return ''; } };
  const readJsonRel = (rel) => { try { return JSON.parse(stripJsonComments(read(rel))); } catch { return null; } };
  const has = (p) => fileSet.has(p);
  const dn = (f) => (dirname(f) === '.' ? '' : dirname(f));
  const jn = (...p) => normalize(join(...p)).replace(/^\.\//, '').replace(/^\.$/, '');

  // ---- JS: tsconfig / package workspaces
  const tsconfigs = new Map(); // dir -> {baseUrlDir, paths:[[re, targets[]]]} | null
  const loadTs = (dir, depth = 0) => {
    const f = ['tsconfig.json', 'jsconfig.json'].map((n) => jn(dir, n)).find(has);
    if (!f) return null;
    const j = readJsonRel(f); if (!j) return null;
    let co = { ...(j.compilerOptions ?? {}) }; let baseDir = dir; let pathsDir = dir;
    if (typeof j.extends === 'string' && j.extends.startsWith('.') && depth < 4) {
      const ext = jn(dir, j.extends.endsWith('.json') ? j.extends : `${j.extends}.json`);
      if (has(ext)) {
        const parent = loadTs(dirname(ext) === '.' ? '' : dirname(ext), depth + 1);
        const pj = readJsonRel(ext);
        if (pj) {
          const pco = pj.compilerOptions ?? {};
          if (pco.baseUrl !== undefined && co.baseUrl === undefined) { co.baseUrl = pco.baseUrl; baseDir = dn(ext); }
          if (pco.paths && !co.paths) { co.paths = pco.paths; pathsDir = dn(ext); }
        }
        void parent;
      }
    }
    const baseUrlDir = co.baseUrl !== undefined ? jn(baseDir, co.baseUrl) : null;
    const pbase = baseUrlDir ?? pathsDir;
    const paths = Object.entries(co.paths ?? {}).map(([k, v]) => [
      new RegExp(`^${k.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace('*', '(.*)')}$`), [].concat(v).map(String),
    ]);
    return { baseUrlDir, pbase, paths };
  };
  const tsFor = (file) => {
    let d = dn(file);
    for (;;) {
      if (!tsconfigs.has(d)) tsconfigs.set(d, loadTs(d));
      const c = tsconfigs.get(d); if (c && (c.paths.length || c.baseUrlDir !== null)) return c;
      if (d === '') return null; d = dn(d);
    }
  };
  const pkgs = []; // {name, dir, pj}
  for (const f of files) if (basename(f) === 'package.json') {
    const pj = readJsonRel(f); if (pj?.name) pkgs.push({ name: pj.name, dir: dn(f), pj });
  }
  const jsFile = (base) => {
    if (has(base) && JS_EXT.includes(extOf(base))) return base;
    const e = extOf(base);
    for (const s of JS_SWAP[e] ?? []) { const c = base.slice(0, -e.length) + s; if (has(c)) return c; }
    for (const x of JS_EXT) if (has(base + x)) return base + x;
    for (const x of JS_EXT) { const c = jn(base, `index${x}`); if (has(c)) return c; }
    return has(base) ? base : null;
  };
  const pkgEntry = (p, sub) => {
    if (sub) return jsFile(jn(p.dir, sub)) ?? jsFile(jn(p.dir, 'src', sub));
    const ex = p.pj.exports; const exStr = typeof ex === 'string' ? ex : (ex?.['.'] && (typeof ex['.'] === 'string' ? ex['.'] : ex['.'].import ?? ex['.'].default ?? ex['.'].types));
    for (const c of [p.pj.source, p.pj.module, p.pj.main, p.pj.types, exStr].filter((x) => typeof x === 'string')) {
      const tryP = [jn(p.dir, c), jn(p.dir, c.replace(/^\.?\/?(dist|build|lib|out)\//, 'src/'))];
      for (const t of tryP) { const r = jsFile(t); if (r) return r; }
    }
    return jsFile(jn(p.dir, 'src/index')) ?? jsFile(jn(p.dir, 'index'));
  };
  const resolveJs = (spec, from) => {
    if (spec.startsWith('.')) { const r = jsFile(jn(dn(from), spec)); return r ? [r] : []; }
    const out = [];
    const ts = tsFor(from);
    if (ts) {
      for (const [re, targets] of ts.paths) {
        const m = re.exec(spec); if (!m) continue;
        for (const t of targets) { const r = jsFile(jn(ts.pbase, t.replace('*', m[1] ?? ''))); if (r) out.push(r); }
        if (out.length) return out;
      }
    }
    for (const p of pkgs) {
      if (spec === p.name) { const r = pkgEntry(p, ''); if (r) return [r]; }
      else if (spec.startsWith(`${p.name}/`)) { const r = pkgEntry(p, spec.slice(p.name.length + 1)); if (r) return [r]; }
    }
    if (ts?.baseUrlDir !== null && ts?.baseUrlDir !== undefined) { const r = jsFile(jn(ts.baseUrlDir, spec)); if (r) return [r]; }
    return [];
  };

  // ---- Python
  const pyRoots = (from) => {
    const roots = new Set(['', 'src']);
    let d = dn(from); let top = null;
    while (has(jn(d, '__init__.py'))) { top = d; if (d === '') break; d = dn(d); }
    roots.add(top !== null ? dn(top) : dn(from));
    roots.add(dn(from));
    return [...roots];
  };
  const pyMod = (rootDir, parts, names) => {
    const out = [];
    let cur = rootDir;
    for (let i = 0; i < parts.length; i++) {
      cur = jn(cur, parts[i]);
      const init = jn(cur, '__init__.py'); const mod = `${cur}.py`;
      if (has(init)) out.push(init);
      if (has(mod)) out.push(mod);
      if (!has(init) && !has(mod) && i < parts.length) { if (!byDir.has(cur)) return i === 0 ? [] : out; }
    }
    for (const n of names ?? []) {
      const c = jn(cur, n);
      if (has(`${c}.py`)) out.push(`${c}.py`);
      else if (has(jn(c, '__init__.py'))) out.push(jn(c, '__init__.py'));
    }
    return out;
  };
  const resolvePy = (r, from) => {
    const parts = r.m ? r.m.split('.') : [];
    if (r.lvl > 0) {
      let d = dn(from); for (let i = 1; i < r.lvl; i++) d = dn(d);
      const hit = pyMod(d, parts, r.n);
      if (!parts.length && has(jn(d, '__init__.py'))) hit.push(jn(d, '__init__.py'));
      return hit;
    }
    const out = new Set();
    for (const root of pyRoots(from)) for (const h of pyMod(root, parts, r.n)) out.add(h);
    return [...out];
  };

  // ---- Go
  const goMods = [];
  for (const f of files) if (basename(f) === 'go.mod') {
    const m = /^module\s+(\S+)/m.exec(read(f)); if (m) goMods.push({ dir: dn(f), mod: m[1].replace(/"/g, '') });
  }
  goMods.sort((a, b) => b.mod.length - a.mod.length);
  const goPkgFiles = (dir) => (byDir.get(dir) ?? []).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
  const resolveGo = (imp) => {
    for (const m of goMods) {
      if (imp === m.mod || imp.startsWith(`${m.mod}/`)) return goPkgFiles(jn(m.dir, imp.slice(m.mod.length + 1)));
    }
    return [];
  };

  // ---- Rust
  const crates = []; // {name, dir, root, deps: Map<ident, crate>}
  const parseToml = (rel) => {
    const txt = read(rel); const sec = {}; let cur = '';
    for (const line of txt.split('\n')) {
      const l = line.replace(/#.*$/, '').trim(); if (!l) continue;
      const h = /^\[+([^\]]+)\]+$/.exec(l);
      if (h) { cur = h[1].trim(); sec[cur] ??= []; continue; }
      if (cur) (sec[cur] ??= []).push(l);
    }
    return sec;
  };
  const crateByDir = new Map();
  for (const f of files) if (basename(f) === 'Cargo.toml') {
    const sec = parseToml(f); const pkgSec = sec.package; if (!pkgSec) continue;
    const nm = /^name\s*=\s*"([^"]+)"/m.exec(pkgSec.join('\n'));
    if (!nm) continue;
    const dir = dn(f);
    const libName = /^name\s*=\s*"([^"]+)"/m.exec((sec.lib ?? []).join('\n'));
    const libPath = /^path\s*=\s*"([^"]+)"/m.exec((sec.lib ?? []).join('\n'));
    const libRs = libPath ? jn(dir, libPath[1]) : jn(dir, 'src/lib.rs');
    const mainRs = jn(dir, 'src/main.rs');
    const c = { name: nm[1], ident: (libName?.[1] ?? nm[1]).replace(/-/g, '_'), dir, lib: has(libRs) ? libRs : null, main: has(mainRs) ? mainRs : null, sec, deps: new Map() };
    c.root = c.lib ?? c.main; crates.push(c); crateByDir.set(dir, c);
  }
  const wsDeps = new Map();
  for (const f of files) if (basename(f) === 'Cargo.toml') {
    for (const l of parseToml(f)['workspace.dependencies'] ?? []) {
      const m = /^([\w-]+)\s*=\s*\{.*path\s*=\s*"([^"]+)"/.exec(l); if (m) wsDeps.set(m[1], jn(dn(f), m[2]));
    }
  }
  for (const c of crates) {
    for (const [s, lines] of Object.entries(c.sec)) {
      if (!/(^|\.)(dev-|build-)?dependencies$/.test(s)) continue;
      for (const l of lines) {
        let m = /^([\w-]+)\s*=\s*\{(.*)\}/.exec(l);
        let pth = null; let nm = null;
        if (m) { nm = m[1]; const pm = /path\s*=\s*"([^"]+)"/.exec(m[2]); if (pm) pth = jn(c.dir, pm[1]); else if (/workspace\s*=\s*true/.test(m[2]) && wsDeps.has(nm)) pth = wsDeps.get(nm); }
        else { m = /^([\w-]+)\.path\s*=\s*"([^"]+)"/.exec(l); if (m) { nm = m[1]; pth = jn(c.dir, m[2]); } }
        if (nm && pth && crateByDir.has(pth)) c.deps.set(nm.replace(/-/g, '_'), crateByDir.get(pth));
      }
    }
  }
  const crateOf = (f) => { let d = dn(f); for (;;) { if (crateByDir.has(d)) return crateByDir.get(d); if (d === '') return null; d = dn(d); } };
  const rsModDir = (f) => {
    const b = basename(f); const d = dn(f); const c = crateOf(f);
    const crateRootLike = b === 'lib.rs' || b === 'main.rs' || b === 'mod.rs' || (c && ['tests', 'benches', 'examples', 'src/bin'].some((x) => d === jn(c.dir, x)));
    return crateRootLike ? d : jn(d, b.replace(/\.rs$/, ''));
  };
  const rsChild = (f, name) => [jn(rsModDir(f), `${name}.rs`), jn(rsModDir(f), name, 'mod.rs')].find(has) ?? null;
  const rsParent = new Map(); // child module file -> declaring file (filled by prepare())
  const prepare = (parsedOf) => {
    for (const f of files) {
      if (!f.endsWith('.rs')) continue;
      for (const r of parsedOf(f)?.raw ?? []) if (r.k === 'mod') { const ch = rsChild(f, r.n); if (ch) rsParent.set(ch, f); }
    }
  };
  const resolveRsPath = (p, from, parsedMods) => {
    const segs = p.split('::'); const head = segs.shift(); const c = crateOf(from);
    let cur; let out = [];
    if (head === 'crate') { cur = c?.root; }
    else if (head === 'self') cur = from;
    else if (head === 'super') { cur = rsParent.get(from) ?? null; while (segs[0] === 'super') { segs.shift(); cur = cur ? rsParent.get(cur) ?? null : null; } }
    else if (c?.deps.has(head)) cur = c.deps.get(head).lib;
    else if (c && head === c.ident && c.lib && from !== c.lib) cur = c.lib; // integration tests of own crate
    else if (parsedMods.has(head)) { cur = from; segs.unshift(head); }
    else return [];
    if (!cur) return [];
    let any = false;
    for (const s of segs) { const ch = rsChild(cur, s); if (!ch) break; out.push(ch); cur = ch; any = true; }
    if (!any && head !== 'self') out.push(head === 'super' ? cur : cur);
    if (head === 'self' && !any) return [];
    return out.filter(Boolean);
  };

  const edges = (file, parsed) => {
    const lang = langOf(file); const out = new Set();
    if (!parsed) return [];
    if (lang === 'js') for (const s of parsed.raw) for (const r of resolveJs(s, file)) out.add(r);
    else if (lang === 'py') for (const r of parsed.raw) for (const h of resolvePy(r, file)) out.add(h);
    else if (lang === 'go') {
      for (const s of parsed.raw) for (const r of resolveGo(s)) out.add(r);
      for (const sib of goPkgFiles(dn(file))) out.add(sib);
    } else if (lang === 'rs') {
      const mods = new Set(parsed.raw.filter((r) => r.k === 'mod').map((r) => r.n));
      const text = read(file);
      for (const r of parsed.raw) {
        if (r.k === 'mod') {
          const ch = rsChild(file, r.n); if (!ch) continue;
          const isRootish = ['lib.rs', 'main.rs', 'mod.rs'].includes(basename(file));
          const refd = new RegExp(`\\b${r.n}\\s*::|\\buse\\b[^;]*\\b${r.n}\\b`).test(text);
          if (!isRootish || refd) out.add(ch);
        }
      }
      for (const r of parsed.raw) if (r.k === 'path') for (const h of resolveRsPath(r.p, file, mods)) out.add(h);
    }
    out.delete(file);
    return [...out].sort();
  };

  return { edges, prepare, ctx: { crates, goMods, pkgs, crateOf, has, byDir } };
}
