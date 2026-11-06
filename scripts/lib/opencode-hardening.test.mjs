// opencode-hardening.test.mjs — detection + apply semantics for the plugin.use policy hardening.
// Run: node --test scripts/lib/opencode-hardening.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirForms, wildcardMatch, parseJsonc, evaluatePluginUse, detect, planPolicies, applyHardening, loadLayers, discoverUserPlugins, doctorLines, evaluateShell } from './opencode-hardening.mjs';

const G = '/home/u/.config/opencode';
const layer = (kind, policies = [], extra = {}) => ({ file: `/x/${kind}.json`, kind, policies, permissions: [], plugins: [], hadComments: false, value: {}, ...extra });
const deny = (r) => ({ action: 'plugin.use', resource: r, effect: 'deny' });
const allow = (r) => ({ action: 'plugin.use', resource: r, effect: 'allow' });

test('wildcards: * is zero-or-more, ? is one, whole-value', () => {
  assert.ok(wildcardMatch('*', '/a/b'));
  assert.ok(wildcardMatch('/a/*', '/a/b/c.js'));
  assert.ok(wildcardMatch('a?c', 'abc'));
  assert.ok(!wildcardMatch('a?c', 'ac'));
  assert.ok(!wildcardMatch('/a', '/a/b'));
  assert.ok(wildcardMatch('a.b', 'a.b') && !wildcardMatch('a.b', 'axb'));   // dot is literal
});

test('jsonc: comments and trailing commas parse; comment-ness is reported; // inside strings is data', () => {
  const r = parseJsonc('{\n // c\n "u": "http://x//y", /* b */ "a": [1,2,],\n}');
  assert.deepEqual(r.value, { u: 'http://x//y', a: [1, 2] });
  assert.equal(r.hadComments, true);
  assert.equal(parseJsonc('{"a":1}').hadComments, false);
  assert.ok(parseJsonc('{"a":').error);
});

test('evaluation: last match wins, no match = allow, broader layer (later) overrides', () => {
  assert.equal(evaluatePluginUse([layer('global')], '/p').effect, 'allow');
  assert.equal(evaluatePluginUse([layer('global', [deny('*')])], '/p').effect, 'deny');
  assert.equal(evaluatePluginUse([layer('global', [deny('*'), allow('/p')])], '/p').effect, 'allow');
  assert.equal(evaluatePluginUse([layer('global', [allow('/p'), deny('*')])], '/p').effect, 'deny', 'order inside a file decides');
  // project says allow, managed says deny: managed is evaluated later and wins
  assert.equal(evaluatePluginUse([layer('project', [allow('/p')]), layer('managed', [deny('*')])], '/p').effect, 'deny');
});

test('detect: no policy = open; project drops are loadable', () => {
  const r = detect({ layers: [layer('global')], globalDir: G, cwd: '/proj', major: 2, version: '2.2.5' });
  assert.equal(r.verdict, 'open');
  assert.equal(doctorLines(r)[0].startsWith('WARN'), true);
});

test('detect: deny-all that forgets attest is FAIL (attest hooks would silently not load)', () => {
  const r = detect({ layers: [layer('global', [deny('*')])], globalDir: G, cwd: '/proj', major: 2, version: '2.2.5' });
  assert.equal(r.verdict, 'blocked-attest');
  assert.equal(r.attestBlocked, true);
  assert.ok(doctorLines(r).some((l) => l.startsWith('FAIL')));
});

test('detect: deny-all + attest allows = hardened; directory-form-only allow is NOT enough (entry-file form also checked)', () => {
  const full = [deny('*'), allow(`${G}/plugins/expert-hooks*`), allow(`${G}/plugins/resume-anchor*`)];
  assert.equal(detect({ layers: [layer('global', full)], globalDir: G, cwd: '/proj', major: 2, version: '2.2.5' }).verdict, 'hardened');
  const dirOnly = [deny('*'), allow(`${G}/plugins/expert-hooks`), allow(`${G}/plugins/resume-anchor`)];
  assert.equal(detect({ layers: [layer('global', dirOnly)], globalDir: G, cwd: '/proj', major: 2, version: '2.2.5' }).verdict, 'blocked-attest');
});

test('detect: managed deny that blocks attest says attest must not change it', () => {
  const r = detect({ layers: [layer('global', [allow('*')]), layer('managed', [deny('*')])], globalDir: G, cwd: '/proj', major: 2, version: '2.2.5' });
  assert.equal(r.verdict, 'blocked-attest');
  assert.ok(r.notes.some((n) => /managed\/system policy/.test(n)));
});

test('detect: v1 and pre-2.2.3 are reported as unsupported, never as hardened', () => {
  assert.equal(detect({ layers: [layer('global', [deny('*')])], globalDir: G, cwd: '/p', major: 1, version: '1.1.4' }).verdict, 'unsupported-v1');
  assert.equal(detect({ layers: [layer('global', [deny('*')])], globalDir: G, cwd: '/p', major: 2, version: '2.2.2' }).verdict, 'unsupported-old-v2');
  assert.ok(!doctorLines(detect({ layers: [layer('global', [deny('*')])], globalDir: G, cwd: '/p', major: 1, version: '1.1.4' })).some((l) => l.startsWith('FAIL')), 'v1 ignores policies, so no false FAIL');
});

test('doctor: v1 prints the unsupported warning once, not twice', () => {
  const lines = doctorLines(detect({ layers: [layer('global')], globalDir: G, cwd: '/p', major: 1, version: '1.18.30' }));
  assert.equal(lines.filter((l) => /v1/.test(l)).length, 1);
});

test('shell: v2 permissions[] and v1 permission.bash both read; ask is surfaced as a note for unattended runs', () => {
  assert.equal(evaluateShell([layer('global', [], { permissions: [{ action: 'shell', resource: '*', effect: 'ask' }] })]), 'ask');
  assert.equal(evaluateShell([layer('global', [], { v1permission: { bash: 'allow' } })]), 'allow');
  assert.equal(evaluateShell([layer('global')]), 'default');
  const r = detect({ layers: [layer('global', [], { permissions: [{ action: 'shell', resource: '*', effect: 'ask' }] })], globalDir: G, cwd: '/p', major: 2, version: '2.2.5' });
  assert.ok(r.notes.some((n) => /unattended/.test(n)));
});

test('plan: deny first, attest allows after, idempotent, never duplicates the user\'s own deny', () => {
  const p1 = planPolicies({ existing: [], globalDir: G, grandfather: ['/home/u/.config/opencode/plugins/mine.js'] });
  assert.deepEqual(p1[0], deny('*'));
  assert.ok(p1.slice(1).every((s) => s.effect === 'allow'));
  const p2 = planPolicies({ existing: p1, globalDir: G, grandfather: ['/home/u/.config/opencode/plugins/mine.js'] });
  assert.equal(p2.length, 0, 'second run adds nothing');
  const p3 = planPolicies({ existing: [deny('*')], globalDir: G });
  assert.ok(!p3.some((s) => s.effect === 'deny'), 'user\'s deny-all is kept, not duplicated');
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'attest-harden-')); }

test('apply: writes policies, keeps user keys, backs up, grandfathers existing global plugins, ends hardened', () => {
  const home = tmp(); const gdir = path.join(home, '.config', 'opencode'); const proj = path.join(home, 'proj');
  fs.mkdirSync(path.join(gdir, 'plugins', 'expert-hooks'), { recursive: true });
  fs.writeFileSync(path.join(gdir, 'plugins', 'mine.js'), '//');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(gdir, 'opencode.json'), JSON.stringify({ model: 'x', permissions: [{ action: 'external_directory', resource: '*', effect: 'allow' }], plugin: ['some-npm-plugin@1.2.3'] }));
  const layers = loadLayers({ home, cwd: proj, globalDir: gdir, platform: 'linux' });
  const res = applyHardening({ globalDir: gdir, layers });
  assert.equal(res.status, 'applied');
  const out = JSON.parse(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8'));
  assert.equal(out.model, 'x');
  assert.deepEqual(out.permissions, [{ action: 'external_directory', resource: '*', effect: 'allow' }], 'attest\'s external_directory allow is untouched');
  assert.ok(fs.existsSync(path.join(gdir, 'opencode.json.attest-bak')));
  assert.ok(res.grandfather.includes(path.join(gdir, 'plugins', 'mine.js')));
  assert.ok(res.grandfather.includes('some-npm-plugin'));
  const after = detect({ layers: loadLayers({ home, cwd: proj, globalDir: gdir, platform: 'linux' }), globalDir: gdir, cwd: proj, major: 2, version: '2.2.5' });
  assert.equal(after.verdict, 'hardened');
  // the attack path: a plugin dropped into the PROJECT is denied, the user's pre-existing one is not
  const drop = evaluatePluginUse(loadLayers({ home, cwd: proj, globalDir: gdir, platform: 'linux' }), path.join(proj, '.opencode', 'plugins', 'project_mutator.js'));
  assert.equal(drop.effect, 'deny');
  assert.equal(evaluatePluginUse(loadLayers({ home, cwd: proj, globalDir: gdir, platform: 'linux' }), path.join(gdir, 'plugins', 'mine.js')).effect, 'allow');
  assert.equal(applyHardening({ globalDir: gdir, layers: loadLayers({ home, cwd: proj, globalDir: gdir, platform: 'linux' }) }).status, 'already-applied');
});

test('apply: a .jsonc with comments is never rewritten — snippet only', () => {
  const home = tmp(); const gdir = path.join(home, '.config', 'opencode');
  fs.mkdirSync(gdir, { recursive: true });
  const f = path.join(gdir, 'opencode.jsonc');
  const text = '{\n  // my notes\n  "model": "x"\n}\n';
  fs.writeFileSync(f, text);
  const res = applyHardening({ globalDir: gdir, layers: loadLayers({ home, cwd: home, globalDir: gdir, platform: 'linux' }) });
  assert.equal(res.status, 'manual');
  assert.equal(fs.readFileSync(f, 'utf8'), text);
  assert.ok(JSON.parse(res.snippet).policies.length > 0);
});

test('apply: no config yet creates one with a $schema', () => {
  const home = tmp(); const gdir = path.join(home, '.config', 'opencode');
  const res = applyHardening({ globalDir: gdir, layers: loadLayers({ home, cwd: home, globalDir: gdir, platform: 'linux' }) });
  assert.equal(res.status, 'applied');
  assert.equal(JSON.parse(fs.readFileSync(path.join(gdir, 'opencode.json'), 'utf8')).$schema, 'https://opencode.ai/config.json');
});

test('discoverUserPlugins: attest\'s own plugins and lib/ are not grandfathered', () => {
  const home = tmp(); const gdir = path.join(home, 'g');
  fs.mkdirSync(path.join(gdir, 'plugins', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(gdir, 'plugins', 'resume-anchor'));
  fs.writeFileSync(path.join(gdir, 'plugins', 'expert-hooks.ts'), '');
  fs.writeFileSync(path.join(gdir, 'plugins', 'other.ts'), '');
  assert.deepEqual(discoverUserPlugins(gdir, []), [path.join(gdir, 'plugins', 'other.ts')]);
});

test('dirForms/plan: a symlinked config dir gets allow rules for BOTH the written and the resolved path; never by plugin id', () => {
  const home = tmp(); const real = path.join(home, 'real'); const link = path.join(home, 'link');
  fs.mkdirSync(real); fs.symlinkSync(real, link);
  const realResolved = fs.realpathSync(real);
  assert.deepEqual(dirForms(link), [link, realResolved]);
  const plan = planPolicies({ existing: [], globalDir: link });
  for (const base of [link, realResolved]) assert.ok(plan.some((s) => s.resource === path.join(base, 'plugins', 'expert-hooks', 'index.ts') && s.effect === 'allow'), base);
  assert.ok(!plan.some((s) => /^attest\./.test(s.resource)), 'no id-based allow (a project plugin controls its own id)');
});
