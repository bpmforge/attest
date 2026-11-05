#!/usr/bin/env node
// select.mjs -- pick the test files a change can break (TEST_IMPACT_PLAN.md §2.3), or force a full run.
//
// Usage:
//   select.mjs [--root .] [--base <ref> [--head <ref>]] [--full] [--json <out.json>]
//              [--ticket-scope <glob[,glob...]>]... [--index auto|off]
//
// Changed files: --base/--head range; otherwise `<ledger full sha>..HEAD` + dirty + files dirty at the
// last recorded run; a missing / non-ancestor ledger forces full. --ticket-scope globs (a ticket's
// write_scope) are treated as changed. Output (stdout, or the --json file):
//   { scope: "impact"|"full", reason, total, selected: [test files], skipped, changed, always, rolling, failed,
//     mapped, native, unmapped, last_full, scope_line,
//     by_runner: { <runner>: { mode: "files"|"args", files: [...], args: [...], union: bool, cwd, native, projects? } } }
//
// Per-runner modes (what validate-tests.sh / T3 must run):
//   vitest      files  `vitest list --filesOnly --changed <ref>` (a dry file list) ∪ map ∪ policy sets
//   jest        files  `jest --listTests --findRelatedTests <changed files>` ∪ map ∪ policy sets
//   playwright  files  `playwright test --list --only-changed=<ref> --reporter=json` ∪ map ∪ policy sets
//   node, pytest (no testmon)
//               files  static impact map ∪ policy sets
//   pytest + pytest-testmon installed
//               args   ["--testmon"], union:false  -> run `pytest --testmon` AND `pytest <files>` (the policy extras)
//   go          args   package dirs ("./pkg"), union:true -> `go test <args>` (reverse import closure of changed pkgs + extras)
//   cargo       args   ["-p","crate",...], union:true -> `cargo test <args>` (crates owning changes + workspace dependents + extras)
// With mode "args" and union:true the args are the complete selection and `files` is informational (the test
// files they cover); with union:false `files` are extras that must be run separately. When a native command is
// missing or fails the runner falls back to files mode from the map (by_runner[r].native says which).
// Policy sets: always (test.always globs; default tests mapped to a P0 use case), last-run fail/skip/flaky,
// rolling (not run for > test.rolling_days, default 7). Forced full: --full, no/non-ancestor ledger (ledger
// mode), global-input change (lockfiles, manifests, runner config, conftest, setup/fixtures dirs, CI,
// .sdlc/sdlc.json, test.global_inputs), > test.max_changed (400) changed files, ledger chain >= 20, no tests found.

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { LEDGER_REL, MAP_REL, dirtyFiles, git, globMatcher, listFiles, parseArgs, readJson, readTestConfig, isMain } from './common.mjs';
import { MAX_CHAIN, failing, isAncestor, readLedger, rolling } from './ledger.mjs';
import { refreshMap } from './map.mjs';

const GLOBAL_BASE = /^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|Pipfile(\.lock)?|uv\.lock|Cargo\.lock|Cargo\.toml|go\.(mod|sum|work)|package\.json|pyproject\.toml|setup\.(py|cfg)|tox\.ini|pytest\.ini|conftest\.py|requirements[\w.-]*\.txt|tsconfig[\w.-]*\.json|jsconfig\.json|babel\.config\.\w+|\.babelrc(\.json)?|(vitest|jest|playwright)\.(config|workspace)\.[\w.]+|(jest|vitest)\.setup\.[\w.]+|vite\.config\.[\w.]+|setup-?tests?\.[\w.]+|global-(setup|teardown)\.[\w.]+)$/i;
const GLOBAL_PATHS = [/(^|\/)(fixtures?|__fixtures__|setup|__mocks__)\//, /^\.github\//, /^\.circleci\//, /^\.gitlab-ci\.yml$/, /^\.sdlc\/sdlc\.json$/];
export const isGlobalInput = (p, extra = () => false) =>
  GLOBAL_BASE.test(posix.basename(p)) || GLOBAL_PATHS.some((r) => r.test(p)) || extra(p);

const sh = (cmd, args, cwd, timeout = 120_000) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
  return { ok: r.status === 0 && !r.error, out: r.stdout ?? '', err: (r.stderr ?? '') + (r.error?.message ?? '') };
};

function findBin(cwd, root, name) {
  let d = resolve(cwd);
  for (;;) {
    const b = join(d, 'node_modules', '.bin', name);
    if (existsSync(b)) return b;
    if (d === resolve(root) || dirname(d) === d) return null;
    d = dirname(d);
  }
}

const pdn = (f) => (posix.dirname(f) === '.' ? '' : posix.dirname(f));
const pjoin = (...p) => posix.normalize(posix.join(...p)).replace(/^\.\//, '').replace(/^\.$/, '');

// ---------------------------------------------------------------- native selectors (each -> Set<test file> | null)
function nativeVitest(ctx, g) {
  const bin = findBin(join(ctx.root, g.project), ctx.root, 'vitest'); if (!bin || !ctx.ref) return { why: 'absent' };
  const r = sh(bin, ['list', '--filesOnly', '--changed', ctx.ref], join(ctx.root, g.project));
  if (!r.ok) return { why: `failed: ${r.err.split('\n')[0].slice(0, 80)}` };
  return { files: r.out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => pjoin(g.project, l.replace(/^\.\//, ''))) };
}
function nativeJest(ctx, g) {
  const bin = findBin(join(ctx.root, g.project), ctx.root, 'jest'); if (!bin) return { why: 'absent' };
  const cwd = join(ctx.root, g.project);
  const inProj = [...ctx.changed].filter((f) => (g.project === '' || f.startsWith(`${g.project}/`)) && existsSync(join(ctx.root, f)))
    .map((f) => posix.relative(g.project || '.', f));
  if (!inProj.length) return { files: [] };
  const r = sh(bin, ['--listTests', '--findRelatedTests', ...inProj, '--passWithNoTests'], cwd);
  if (!r.ok) return { why: `failed: ${r.err.split('\n')[0].slice(0, 80)}` };
  return { files: r.out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('/')).map((l) => posix.relative(resolve(ctx.root), l)) };
}
function nativePlaywright(ctx, g) {
  const bin = findBin(join(ctx.root, g.project), ctx.root, 'playwright'); if (!bin || !ctx.ref) return { why: 'absent' };
  const r = sh(bin, ['test', '--list', `--only-changed=${ctx.ref}`, '--reporter=json'], join(ctx.root, g.project));
  let j; try { j = JSON.parse(r.out); } catch { return { why: `failed: ${(r.err || r.out).split('\n')[0].slice(0, 80)}` }; }
  const rootDir = j.config?.rootDir ?? join(ctx.root, g.project);
  const files = [];
  const walkSuites = (ss) => { for (const s of ss ?? []) { if (s.file) files.push(posix.relative(resolve(ctx.root), join(rootDir, s.file))); walkSuites(s.suites); } };
  walkSuites(j.suites);
  return { files };
}
function changedGoPkgDirs(ctx, pkgDirs) {
  const out = new Set();
  for (const f of ctx.changed) {
    let d = pdn(f);
    for (;;) { if (pkgDirs.has(d)) { out.add(d); break; } if (d === '') break; d = pdn(d); }
  }
  return out;
}
function nativeGo(ctx, g) {
  if (!sh('go', ['version'], ctx.root).ok) return { why: 'absent' };
  const cwd = join(ctx.root, g.project);
  const r = sh('go', ['list', '-deps', '-e', '-f', '{{.ImportPath}}\t{{.Dir}}\t{{join .Imports ","}}\t{{join .TestImports ","}}\t{{join .XTestImports ","}}', './...'], cwd);
  if (!r.ok) return { why: `failed: ${r.err.split('\n')[0].slice(0, 80)}` };
  const base = resolve(cwd); const pk = new Map(); // importPath -> {dir, imps, timps}
  for (const line of r.out.split('\n')) {
    const [ip, dir, imps, t1, t2] = line.split('\t'); if (!ip || !dir) continue;
    if (dir !== base && !dir.startsWith(`${base}/`)) continue;
    pk.set(ip, { dir: pjoin(g.project, posix.relative(base, dir)), imps: (imps ?? '').split(',').filter(Boolean), timps: [...(t1 ?? '').split(','), ...(t2 ?? '').split(',')].filter(Boolean) });
  }
  const byDir = new Map([...pk].map(([ip, v]) => [v.dir, ip]));
  const changedPk = new Set([...changedGoPkgDirs(ctx, new Set(byDir.keys()))].map((d) => byDir.get(d)));
  const rev = new Map();
  for (const [ip, v] of pk) for (const i of v.imps) (rev.get(i) ?? rev.set(i, new Set()).get(i)).add(ip);
  const clo = new Set(changedPk); const q = [...changedPk];
  while (q.length) for (const p of rev.get(q.pop()) ?? []) if (!clo.has(p)) { clo.add(p); q.push(p); }
  const sel = new Set(clo);
  for (const [ip, v] of pk) if (v.timps.some((t) => clo.has(t))) sel.add(ip);
  return { dirs: [...sel].map((ip) => pk.get(ip).dir) };
}
function nativeCargo(ctx, g) {
  if (!sh('cargo', ['--version'], ctx.root).ok) return { why: 'absent' };
  const cwd = join(ctx.root, g.project);
  const r = sh('cargo', ['metadata', '--no-deps', '--format-version', '1', '--offline'], cwd);
  let j; try { j = JSON.parse(r.out); } catch { return { why: `failed: ${r.err.split('\n')[0].slice(0, 80)}` }; }
  const wsRoot = resolve(j.workspace_root);
  const pk = j.packages.map((p) => ({ name: p.name, dir: pjoin(posix.relative(resolve(ctx.root), dirname(p.manifest_path))), deps: p.dependencies.filter((d) => d.path).map((d) => d.name) }));
  void wsRoot;
  const owner = (f) => pk.filter((p) => p.dir === '' || f === p.dir || f.startsWith(`${p.dir}/`)).sort((a, b) => b.dir.length - a.dir.length)[0];
  const hit = new Set();
  for (const f of ctx.changed) { const o = owner(f); if (o) hit.add(o.name); }
  const q = [...hit];
  while (q.length) { const n = q.pop(); for (const p of pk) if (p.deps.includes(n) && !hit.has(p.name)) { hit.add(p.name); q.push(p.name); } }
  return { crates: [...hit] };
}
function pytestmonPresent(root) {
  return sh('python3', ['-c', 'import testmon'], root).ok;
}

// ---------------------------------------------------------------- main
export function select(rootIn, opts = {}) {
  const root = resolve(rootIn ?? '.');
  const cfg = readTestConfig(root);
  const ledger = readLedger(root);
  const prevMap = readJson(join(root, MAP_REL), null);
  const { map } = refreshMap(root, { index: opts.index });
  const tests = map.tests; const allTests = Object.keys(tests).sort(); const total = allTests.length;
  const graph = map.graph ?? {};
  const extraGlobal = globMatcher(cfg.global_inputs);
  const range = opts.base !== undefined && opts.base !== null;
  const changed = new Set(); let ref = null; let forced = null;

  if (range) {
    const d = git(root, ['diff', '--no-renames', '--name-only', '--diff-filter=ACMRD', opts.base, opts.head ?? 'HEAD']);
    if (d === null) forced = 'bad-range'; else d.split('\n').filter(Boolean).forEach((f) => changed.add(f));
    ref = opts.base;
  } else if (!opts.full) {
    if (!ledger?.full?.sha) forced = 'no-ledger';
    else if (!isAncestor(root, ledger.full.sha)) forced = 'ledger-not-ancestor';
    else {
      ref = ledger.full.sha;
      const d = git(root, ['diff', '--no-renames', '--name-only', '--diff-filter=ACMRD', ledger.full.sha, 'HEAD']);
      if (d === null) forced = 'no-git';
      else { d.split('\n').filter(Boolean).forEach((f) => changed.add(f)); dirtyFiles(root).forEach((f) => changed.add(f)); (ledger.dirty_files ?? []).forEach((f) => changed.add(f)); }
    }
  }
  const scopeGlobs = (opts.ticketScope ?? []).flatMap((s) => String(s).split(/[,\s]+/)).filter(Boolean);
  if (scopeGlobs.length) { const m = globMatcher(scopeGlobs); listFiles(root).filter(m).forEach((f) => changed.add(f)); }
  changed.delete(LEDGER_REL); changed.delete(MAP_REL);
  for (const f of [...changed]) if (f.startsWith('docs/work/test/')) changed.delete(f);

  let reason = null;
  if (opts.full) reason = 'full-flag';
  else if (forced) reason = forced;
  else if (total === 0) reason = 'no-tests-found';
  else if ([...changed].some((f) => isGlobalInput(f, extraGlobal))) reason = `global-input:${[...changed].find((f) => isGlobalInput(f, extraGlobal))}`;
  else if (changed.size > cfg.max_changed) reason = `changed>${cfg.max_changed}`;
  else if (ledger && (ledger.chain ?? 0) >= MAX_CHAIN) reason = `chain>=${MAX_CHAIN}`;

  const lastFull = ledger?.full ? { sha: ledger.full.sha, date: ledger.full.date } : null;
  const mk = (scope, selected, extra) => {
    const sel = [...selected].sort();
    const by = {};
    const groups = new Map();
    for (const t of allTests) { const e = tests[t]; const k = `${e.runner}\t${e.project}`; (groups.get(k) ?? groups.set(k, { runner: e.runner, project: e.project, all: [] }).get(k)).all.push(t); }
    const selSet = new Set(sel);
    for (const g of groups.values()) {
      const files = g.all.filter((t) => selSet.has(t));
      const ent = (by[g.runner] ??= { mode: 'files', files: [], args: [], union: true, cwd: g.project, native: 'map', projects: [] });
      ent.projects.push({ cwd: g.project, files, args: [], mode: 'files', native: 'map', ...(extra?.groupInfo?.get(`${g.runner}\t${g.project}`) ?? {}) });
    }
    for (const ent of Object.values(by)) {
      ent.files = ent.projects.flatMap((p) => p.files).sort();
      if (ent.projects.length === 1) { Object.assign(ent, { mode: ent.projects[0].mode, args: ent.projects[0].args, cwd: ent.projects[0].cwd, native: ent.projects[0].native, union: ent.projects[0].union ?? true }); delete ent.projects; }
      else { ent.mode = ent.projects.every((p) => p.mode === 'files') ? 'files' : 'args'; ent.cwd = null; ent.native = [...new Set(ent.projects.map((p) => p.native))].join(','); }
    }
    const res = {
      scope, reason: reason ?? 'impact', total, selected: sel, skipped: total - sel.length, changed: changed.size,
      base: ref, head: opts.head ?? 'HEAD', always: extra?.always ?? 0, rolling: extra?.rolling ?? 0, failed: extra?.failed ?? 0,
      mapped: extra?.mapped ?? 0, native: extra?.native ?? 0, unmapped: extra?.unmapped ?? 0, last_full: lastFull, by_runner: by,
    };
    const lf = lastFull ? `; last full ${lastFull.date.slice(0, 10)} @ ${String(lastFull.sha).slice(0, 7)}` : '';
    res.scope_line = scope === 'full'
      ? `Scope: full — ${sel.length} of ${total} test files (${res.reason})${lf}`
      : `Scope: impact — ${sel.length} of ${total} test files (${res.skipped} unaffected, ${res.always} always, ${res.rolling} rolling, ${res.failed} failed-last-run)${lf}`;
    if (extra?.why) res.why = extra.why;
    return res;
  };

  if (reason) return mk('full', allTests, {});

  // ---- impact selection
  const why = new Map(); const add = (t, r) => { if (tests[t]) (why.get(t) ?? why.set(t, new Set()).get(t)).add(r); };
  const chg = [...changed];
  for (const t of allTests) if (changed.has(t)) add(t, 'changed');
  let mapped = 0;
  for (const t of allTests) {
    const cov = new Set([...(tests[t].covers ?? []), ...(prevMap?.tests?.[t]?.covers ?? [])]);
    if (chg.some((f) => cov.has(f))) { add(t, 'map'); mapped++; }
  }
  const P0 = new Set(Object.entries(map.meta?.uc_priority ?? {}).filter(([, v]) => v === 'P0').map(([k]) => k));
  const alwaysSet = cfg.always ? allTests.filter(globMatcher(cfg.always)) : allTests.filter((t) => tests[t].uc.some((u) => P0.has(u)));
  alwaysSet.forEach((t) => add(t, 'always'));
  const failedSet = failing(allTests, ledger); failedSet.forEach((t) => add(t, 'failed'));
  const rollSet = rolling(allTests, cfg.rolling_days, ledger); rollSet.forEach((t) => add(t, 'rolling'));

  // runner-native selection per (runner, project) group
  const groupInfo = new Map(); let nativeCount = 0;
  const ctx = { root, changed, ref };
  const groups = new Map();
  for (const t of allTests) { const e = tests[t]; const k = `${e.runner}\t${e.project}`; (groups.get(k) ?? groups.set(k, { runner: e.runner, project: e.project, crate: e.crate, tests: [] }).get(k)).tests.push(t); }
  const testmon = [...groups.values()].some((g) => g.runner === 'pytest') ? pytestmonPresent(root) : false;
  if (chg.length) {
    for (const [key, g] of groups) {
      let res = null;
      if (g.runner === 'vitest') res = nativeVitest(ctx, g);
      else if (g.runner === 'jest') res = nativeJest(ctx, g);
      else if (g.runner === 'playwright') res = nativePlaywright(ctx, g);
      else if (g.runner === 'go') res = nativeGo(ctx, g);
      else if (g.runner === 'cargo') res = nativeCargo(ctx, g);
      else if (g.runner === 'pytest' && testmon) res = { testmon: true };
      if (!res) continue;
      if (res.why) { groupInfo.set(key, { native: `map (${g.runner} ${res.why})` }); continue; }
      groupInfo.set(key, { native: g.runner === 'go' ? 'go list -deps' : g.runner === 'cargo' ? 'cargo metadata' : res.testmon ? 'pytest-testmon' : `${g.runner}` });
      if (res.files) for (const f of res.files) if (tests[f]) { add(f, 'native'); nativeCount++; }
      if (res.dirs) {
        const dirs = new Set(res.dirs);
        for (const t of g.tests) if (dirs.has(pdn(t))) { add(t, 'native'); nativeCount++; }
      }
      if (res.crates) {
        const cs = new Set(res.crates);
        for (const t of g.tests) if (cs.has(tests[t].crate)) { add(t, 'native'); nativeCount++; }
      }
    }
  }

  const selected = new Set(why.keys());
  const unmapped = chg.filter((f) => !graph[f] && !/\.(md|txt|rst)$|^docs\//i.test(f)).length;
  // finish arg forms now that the selection is known
  for (const [key, g] of groups) {
    const sel = g.tests.filter((t) => selected.has(t)); const gi = groupInfo.get(key) ?? {};
    const info = { ...gi };
    if (g.runner === 'go' && gi.native === 'go list -deps') {
      info.mode = 'args'; info.union = true;
      info.args = [...new Set(sel.map((t) => `./${posix.relative(g.project || '.', pdn(t)) || '.'}`))].sort();
    } else if (g.runner === 'cargo' && gi.native === 'cargo metadata') {
      info.mode = 'args'; info.union = true;
      info.args = [...new Set(sel.map((t) => tests[t].crate))].sort().flatMap((c) => ['-p', c]);
    } else if (g.runner === 'pytest' && gi.native === 'pytest-testmon') {
      info.mode = 'args'; info.union = false; info.args = ['--testmon'];
    }
    groupInfo.set(key, info);
  }
  return mk('impact', selected, {
    groupInfo, always: alwaysSet.length, rolling: rollSet.length, failed: failedSet.length, mapped, native: nativeCount, unmapped,
    why: Object.fromEntries([...why].map(([k, v]) => [k, [...v].sort()])),
  });
}

function main(argv) {
  const a = parseArgs(argv, { bool: ['full'], multi: ['ticket-scope'] });
  const root = resolve(a.root ?? '.');
  const res = select(root, { base: a.base, head: a.head, full: !!a.full, ticketScope: a['ticket-scope'], index: a.index });
  process.stderr.write(`${res.scope_line}\n`);
  if (a.json) {
    const out = resolve(root, a.json);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(res, null, 1)}\n`);
    process.stdout.write(`${out}\n`);
  } else process.stdout.write(`${JSON.stringify(res, null, 1)}\n`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
