#!/usr/bin/env node
// opencode-hardening.mjs — detect and (optionally) apply OpenCode's plugin-load policy hardening.
//
// WHY: OpenCode autoloads JavaScript/TypeScript from <project>/.opencode/plugins/ and, on v2, reacts to changes
// while a session is running. Anything that can write a file there (a prompt-injected download, a cloned repo)
// gets code execution in the agent runtime with the user's privileges, and the model's later "this looks wrong"
// does not stop an already-running plugin. OpenCode v2.2.3+ has a `plugin.use` policy that refuses to load a
// plugin "however it was configured". It is NOT a sandbox (OpenCode says so), but it is the control that sits
// exactly between "file written" and "code runs". Docs: https://opencode.ai/v2/docs/policies/
//
// This module does two jobs:
//   detect  — read every config layer OpenCode reads, evaluate plugin.use the way OpenCode does (last match
//             wins, no match = allow, broader config evaluated later), and report whether attest's OWN plugins
//             still load. A blanket deny that forgets attest silently disables attest's hooks.
//   apply   — opt-in: add `deny *` + narrow allows for attest's plugins and the plugins the user already had in
//             the global config dir. Never removes or loosens anything the user wrote. Refuses to rewrite a
//             .jsonc that has comments (prints the snippet instead).
//
// Pure functions are exported for tests; the CLI is at the bottom.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DEFAULT_ATTEST_PLUGINS = ['expert-hooks', 'resume-anchor'];
export const MIN_POLICY_VERSION = [2, 2, 3];

// ── matching ────────────────────────────────────────────────────────────────
/** OpenCode policy wildcards are whole-value: `*` = zero or more characters, `?` = exactly one. */
export function wildcardMatch(pattern, value) {
  const re = new RegExp('^' + String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 's');
  return re.test(String(value));
}

// ── JSONC ───────────────────────────────────────────────────────────────────
/** Parse JSON with comments / trailing commas. Returns { value, hadComments } or { error }. */
export function parseJsonc(text) {
  let out = '';
  let hadComments = false;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i++; } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { hadComments = true; while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { hadComments = true; i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  // trailing commas (outside strings): re-scan
  let cleaned = '';
  inStr = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inStr) { cleaned += c; if (c === '\\') { cleaned += out[i + 1] ?? ''; i++; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; cleaned += c; continue; }
    if (c === ',') { let j = i + 1; while (/\s/.test(out[j] ?? '')) j++; if (out[j] === '}' || out[j] === ']') continue; }
    cleaned += c;
  }
  try { return { value: JSON.parse(cleaned), hadComments }; } catch (e) { return { error: String(e.message || e) }; }
}

// ── config layers ───────────────────────────────────────────────────────────
function readLayer(file, kind, readText = (f) => fs.readFileSync(f, 'utf8')) {
  let text;
  try { text = readText(file); } catch { return null; }
  const p = parseJsonc(text);
  if (p.error) return { file, kind, error: p.error, policies: [], permissions: [], plugins: [], hadComments: false, value: null };
  const v = p.value && typeof p.value === 'object' ? p.value : {};
  return { file, kind, hadComments: p.hadComments, value: v, policies: Array.isArray(v.policies) ? v.policies : [], permissions: Array.isArray(v.permissions) ? v.permissions : [], v1permission: v.permission ?? null, plugins: configPluginNames(v) };
}

/** Plugin names a config lists explicitly (`plugin` / `plugins` arrays), version suffix removed. */
export function configPluginNames(v) {
  const out = [];
  for (const key of ['plugin', 'plugins']) {
    const a = v?.[key];
    if (!Array.isArray(a)) continue;
    for (const e of a) {
      const s = typeof e === 'string' ? e : Array.isArray(e) && typeof e[0] === 'string' ? e[0] : null;
      if (s) out.push(s.replace(/^(.+?)@[^@/]+$/, '$1'));
    }
  }
  return out;
}

function readPlist(file) {
  try {
    const json = execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return json;
  } catch { return undefined; }
}

/**
 * Layers in EVALUATION order (last match wins, so the most authoritative layer comes last):
 * .opencode/ (inner→outer), project (inner→outer), global, system, macOS managed.
 */
export function loadLayers({ home = os.homedir(), cwd = process.cwd(), globalDir, platform = process.platform, readText } = {}) {
  const gdir = globalDir ?? path.join(home, '.config', 'opencode');
  const names = ['opencode.json', 'opencode.jsonc'];
  const layers = [];
  const push = (dir, kind) => { for (const n of names) { const l = readLayer(path.join(dir, n), kind, readText); if (l) layers.push(l); } };

  const chain = [];
  for (let d = path.resolve(cwd); ; d = path.dirname(d)) { chain.push(d); if (d === path.dirname(d) || d === path.resolve(home)) break; }
  for (const d of chain) push(path.join(d, '.opencode'), 'project-dot-opencode');   // inner → outer
  for (const d of chain) push(d, 'project');
  push(gdir, 'global');
  const sys = platform === 'darwin' ? ['/Library/Application Support/opencode', '/etc/opencode'] : platform === 'win32' ? [path.join(process.env.ProgramData || 'C:\\ProgramData', 'opencode')] : ['/etc/opencode'];
  for (const d of sys) push(d, 'system');
  if (platform === 'darwin') {
    const plist = '/Library/Managed Preferences/ai.opencode.managed.plist';
    if (fs.existsSync(plist)) {
      const l = readLayer(plist, 'managed', (f) => { const t = readPlist(f); if (t === undefined) throw new Error('unreadable'); return t; });
      layers.push(l ?? { file: plist, kind: 'managed', unreadable: true, policies: [], permissions: [], plugins: [], hadComments: false, value: null });
    }
  }
  return layers;
}

// ── evaluation ──────────────────────────────────────────────────────────────
/** Effective plugin.use decision for one resource: { effect, rule, layer } — last matching statement wins; none = allow. */
export function evaluatePluginUse(layers, resource) {
  let result = { effect: 'allow', rule: null, layer: null };
  for (const layer of layers) {
    for (const s of layer.policies) {
      if (s && s.action === 'plugin.use' && typeof s.resource === 'string' && wildcardMatch(s.resource, resource)) {
        result = { effect: s.effect === 'deny' ? 'deny' : 'allow', rule: s, layer };
      }
    }
  }
  return result;
}

/** Effective shell permission for "*" across layers (v2 permissions[], v1 permission.bash). */
export function evaluateShell(layers) {
  let eff = 'default';
  for (const layer of layers) {
    for (const r of layer.permissions) if (r && (r.action === 'shell' || r.action === 'bash') && wildcardMatch(r.resource ?? '*', '*')) eff = r.effect;
    const b = layer.v1permission?.bash;
    if (typeof b === 'string') eff = b;
    else if (b && typeof b === 'object' && typeof b['*'] === 'string') eff = b['*'];
  }
  return eff;
}

export function parseVersion(s) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(s ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function versionAtLeast(v, min) { for (let i = 0; i < 3; i++) { if (v[i] !== min[i]) return v[i] > min[i]; } return true; }

/** Resources that identify an attest plugin. OpenCode names a plugin "by unversioned package name or absolute path"; the
 *  docs do not say whether a directory plugin is identified by the directory or its entry file, so both forms must load. */
export function attestResources(globalDir, name) {
  const base = path.join(globalDir, 'plugins', name);
  return [base, path.join(base, 'index.ts')];
}

/** Inspect everything and say what attest should do about it. */
export function detect({ layers, globalDir, cwd = process.cwd(), major, version, attestPlugins = DEFAULT_ATTEST_PLUGINS } = {}) {
  const notes = [];
  const ver = parseVersion(version);
  const policyCapable = major === 2 && (!ver || versionAtLeast(ver, MIN_POLICY_VERSION));
  const probe = path.join(path.resolve(cwd), '.opencode', 'plugins', '__attest_probe__.js');
  const drop = evaluatePluginUse(layers, probe);
  const projectDropsBlocked = drop.effect === 'deny';
  const attest = attestPlugins.map((name) => {
    const forms = attestResources(globalDir, name).map((r) => ({ resource: r, ...evaluatePluginUse(layers, r) }));
    const blocked = forms.find((f) => f.effect === 'deny');
    return { name, effective: blocked ? 'deny' : 'allow', by: blocked ? describe(blocked) : null };
  });
  const attestBlocked = policyCapable && attest.some((a) => a.effective === 'deny');
  const managedDeny = [drop, ...attest.map((a) => a)].some((x) => x.layer && (x.layer.kind === 'managed' || x.layer.kind === 'system'));
  const shell = evaluateShell(layers);
  const unreadable = layers.filter((l) => l.unreadable || l.error);

  let verdict;
  if (major === 1) verdict = 'unsupported-v1';
  else if (!policyCapable) verdict = 'unsupported-old-v2';
  else if (attestBlocked) verdict = 'blocked-attest';
  else if (projectDropsBlocked) verdict = 'hardened';
  else verdict = 'open';

  if (verdict === 'unsupported-v1') notes.push('OpenCode v1 has no plugin load policy; project plugins autoload. Upgrade to v2.2.3+ or run untrusted research in a container/VM without your credentials.');
  if (verdict === 'unsupported-old-v2') notes.push(`plugin.use needs OpenCode ${MIN_POLICY_VERSION.join('.')}+; older versions ignore it.`);
  if (unreadable.length) notes.push('Could not read: ' + unreadable.map((l) => `${l.file} (${l.error ?? 'unreadable'})`).join('; ') + ' — verdict may be incomplete.');
  if (verdict === 'blocked-attest') notes.push(managedDeny && attest.some((a) => a.by?.includes('managed') || a.by?.includes('system'))
    ? 'A managed/system policy blocks attest\'s plugins. attest cannot and must not change that; ask whoever manages OpenCode to allow the listed paths.'
    : 'Your plugin policy denies attest\'s own plugins, so its hooks (turn cap, stall guard, gates, resume anchor) will NOT load. Run ./install.sh --harden to add the allow rules.');
  if (shell === 'ask' || shell === 'deny') notes.push(`shell permission is "${shell}": unattended runs (conductor, opencode run) will stall or fail on shell steps. Fine for interactive use.`);
  return { major: major ?? null, version: version ?? null, policyCapable, verdict, projectDropsBlocked, attest, attestBlocked, managedDeny, shell, layers: layers.map((l) => ({ file: l.file, kind: l.kind, policies: l.policies.length, error: l.error ?? null, unreadable: !!l.unreadable })), notes };
}
function describe(f) { return `${f.rule ? JSON.stringify(f.rule) : 'rule'} in ${f.layer?.kind ?? '?'} (${f.layer?.file ?? '?'}) for ${f.resource}`; }

// ── planning / applying ─────────────────────────────────────────────────────
/** Plugins already present in the global config dir that are not attest's — these are grandfathered so hardening
 *  only blocks what shows up LATER (project drops, new downloads). */
export function discoverUserPlugins(globalDir, layers, attestPlugins = DEFAULT_ATTEST_PLUGINS) {
  const own = new Set(attestPlugins.flatMap((n) => [n, `${n}.ts`, `${n}.js`, `${n}.mjs`]));
  const out = new Set();
  const dir = path.join(globalDir, 'plugins');
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { /* none */ }
  for (const e of entries) {
    if (own.has(e.name) || e.name === 'lib' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    out.add(p);
    if (e.isDirectory()) { out.add(path.join(p, '*')); }
  }
  for (const l of layers) for (const n of l.plugins) out.add(n);
  return [...out];
}

const same = (a, b) => a && b && a.action === b.action && a.resource === b.resource && a.effect === b.effect;

/** Statements to add to the user's `policies` so that: unknown/project plugins are denied, attest + grandfathered load. Idempotent. */
export function planPolicies({ existing = [], globalDir, attestPlugins = DEFAULT_ATTEST_PLUGINS, grandfather = [] }) {
  const want = [];
  const hasDenyAll = existing.some((s) => s?.action === 'plugin.use' && s.resource === '*' && s.effect === 'deny');
  if (!hasDenyAll) want.push({ action: 'plugin.use', resource: '*', effect: 'deny' });
  for (const n of attestPlugins) for (const r of [path.join(globalDir, 'plugins', n), path.join(globalDir, 'plugins', n, '*'), path.join(globalDir, 'plugins', n, 'index.ts')]) want.push({ action: 'plugin.use', resource: r, effect: 'allow' });
  for (const g of grandfather) want.push({ action: 'plugin.use', resource: g, effect: 'allow' });
  return want.filter((w) => !existing.some((e) => same(e, w)));
}

/** Apply to the GLOBAL config only (never a project file, never a managed layer). Returns { status, file, added, snippet }. */
export function applyHardening({ globalDir, attestPlugins = DEFAULT_ATTEST_PLUGINS, layers, write = true }) {
  const cand = ['opencode.json', 'opencode.jsonc'].map((n) => path.join(globalDir, n)).find((f) => fs.existsSync(f)) ?? path.join(globalDir, 'opencode.json');
  const layer = layers.find((l) => l.file === cand);
  const grandfather = discoverUserPlugins(globalDir, layers, attestPlugins);
  const existingPolicies = layer?.policies ?? [];
  const added = planPolicies({ existing: existingPolicies, globalDir, attestPlugins, grandfather });
  const snippet = JSON.stringify({ policies: added }, null, 2);
  if (!added.length) return { status: 'already-applied', file: cand, added, snippet, grandfather };
  if (layer?.error) return { status: 'unparseable', file: cand, added, snippet, grandfather };
  if (layer?.hadComments) return { status: 'manual', file: cand, added, snippet, grandfather };   // don't destroy the user's comments
  if (!write) return { status: 'planned', file: cand, added, snippet, grandfather };
  const value = { ...(layer?.value ?? { $schema: 'https://opencode.ai/config.json' }) };
  value.policies = [...existingPolicies, ...added];     // appended: last match wins, so attest's allows follow the deny
  if (fs.existsSync(cand)) fs.copyFileSync(cand, cand + '.attest-bak');
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(cand, JSON.stringify(value, null, 2) + '\n');
  return { status: 'applied', file: cand, backup: fs.existsSync(cand + '.attest-bak') ? cand + '.attest-bak' : null, added, snippet, grandfather };
}

// ── doctor lines ────────────────────────────────────────────────────────────
export function doctorLines(r) {
  const L = [];
  const add = (lvl, msg) => L.push(`${lvl}\t${msg}`);
  switch (r.verdict) {
    case 'hardened': add('PASS', 'plugin load policy: unknown/project plugins are denied, attest plugins load'); break;
    case 'open': add('WARN', 'plugin load policy: none — a file dropped into .opencode/plugins/ is executed automatically (prompt-injection route). Opt in: ./install.sh --harden'); break;
    case 'blocked-attest': add('FAIL', 'plugin load policy denies attest\'s own plugins — turn cap, stall guard, gates and resume anchor are NOT loading'); break;
    case 'unsupported-v1': add('WARN', 'OpenCode v1: project plugins autoload and config cannot stop it — upgrade to v2.2.3+ or isolate untrusted research (container/VM, no host credentials)'); break;
    case 'unsupported-old-v2': add('WARN', `OpenCode ${r.version ?? 'v2'} predates plugin.use (needs ${MIN_POLICY_VERSION.join('.')}+) — update OpenCode`); break;
  }
  if (r.verdict === 'blocked-attest') for (const a of r.attest) if (a.effective === 'deny') add('FAIL', `  blocked: ${a.name} — ${a.by}`);
  // v1 / old-v2: the verdict line above already says it; don't repeat the same note.
  const dup = r.verdict === 'unsupported-v1' || r.verdict === 'unsupported-old-v2';
  for (const n of r.notes) { if (dup && (/^OpenCode v1 has no plugin/.test(n) || /^plugin\.use needs/.test(n))) continue; add('WARN', n); }
  return L;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function arg(argv, name, def) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; }

export function main(argv) {
  const cmd = argv[0] ?? 'detect';
  const home = os.homedir();
  const globalDir = arg(argv, '--global-dir', path.join(home, '.config', 'opencode'));
  const cwd = arg(argv, '--cwd', process.cwd());
  let major = arg(argv, '--major'); major = major ? Number(major) : undefined;
  let version = arg(argv, '--version');
  if (major === undefined || !version) {
    try { const v = execFileSync('opencode', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0]; version = version ?? v; const pv = parseVersion(v); if (pv && major === undefined) major = pv[0]; } catch { /* not installed */ }
  }
  const attestPlugins = (arg(argv, '--plugins', DEFAULT_ATTEST_PLUGINS.join(','))).split(',').filter(Boolean);
  const layers = loadLayers({ home, cwd, globalDir });

  if (cmd === 'detect') {
    const r = detect({ layers, globalDir, cwd, major, version, attestPlugins });
    if (argv.includes('--verdict')) console.log(r.verdict);
    else if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else if (argv.includes('--doctor')) console.log(doctorLines(r).join('\n'));
    else { console.log(`OpenCode ${r.version ?? '(not found)'} — hardening: ${r.verdict}`); for (const l of doctorLines(r)) console.log('  ' + l.replace('\t', ' ')); }
    return 0;
  }
  if (cmd === 'plan' || cmd === 'apply') {
    if (major !== 2) { console.log('Plugin load policy needs OpenCode v2.2.3+. Nothing to apply.'); return 0; }
    const r = applyHardening({ globalDir, attestPlugins, layers, write: cmd === 'apply' });
    const g = r.grandfather.length ? `\nKept loading (already in your global config): ${r.grandfather.join(', ')}` : '';
    if (r.status === 'already-applied') console.log(`Already hardened (${r.file}).`);
    else if (r.status === 'applied') console.log(`Hardened ${r.file}${r.backup ? ` (backup: ${r.backup})` : ''}. Added ${r.added.length} policy statements.${g}\nNew/unknown plugins, including anything dropped into a project's .opencode/plugins/, will no longer load.`);
    else if (r.status === 'planned') console.log(`Would add to ${r.file}:\n${r.snippet}${g}`);
    else console.log(`${r.file} ${r.status === 'manual' ? 'has comments, so it was not rewritten' : 'could not be parsed'}. Add these statements to its "policies" array yourself, keeping the deny BEFORE the allows (last match wins):\n${r.snippet}${g}`);
    const after = detect({ layers: loadLayers({ home, cwd, globalDir }), globalDir, cwd, major, version, attestPlugins });
    if (r.status === 'applied' && after.verdict !== 'hardened') { for (const l of doctorLines(after)) console.log('  ' + l.replace('\t', ' ')); return 2; }
    return 0;
  }
  console.error('usage: opencode-hardening.mjs detect [--json|--doctor|--verdict] | plan | apply  [--verdict] [--global-dir D] [--cwd D] [--major N] [--version X.Y.Z] [--plugins a,b]');
  return 64;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('opencode-hardening.mjs')) process.exit(main(process.argv.slice(2)));
