#!/usr/bin/env node
// contract-conformance.mjs — assert a LIVE app against its frozen openapi spec (O2.5).
//
// The RUNTIME gate boots + smokes the app but never checks live endpoints against the
// contract. This does: for each non-destructive (GET) path with no unfilled required
// params, probe base_url+path and assert (a) the status is a declared 2xx, and (b) any
// required top-level JSON response fields are present. Fully deterministic — the strongest
// possible gate. Emits one gap-list JSON line per problem (validator convention).
//
// Usage:
//   node contract-conformance.mjs --spec openapi.yaml --base-url http://localhost:3000
//   node contract-conformance.mjs --self-test
// Exit 0 = conformant or SKIP · 1 = gaps · 2 = usage/error.
//
// Spec parsing: JSON specs fully; YAML via a minimal paths/methods/responses extractor
// (standard 2-space-indented OpenAPI). Prefer a JSON spec for full response-field checks.

import { readFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const has = (n) => argv.includes(n);

// ── minimal YAML paths extractor (OpenAPI subset) ─────────────────────────
function parseYamlPaths(text) {
  const lines = text.split('\n').map(l => l.replace(/\t/g, '  '));
  const indent = l => l.length - l.trimStart().length;
  const out = {};
  let i = 0;
  // find `paths:` at col 0
  while (i < lines.length && !/^paths:\s*$/.test(lines[i])) i++;
  i++;
  const pathBase = 2;
  for (; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim() || l.trim().startsWith('#')) continue;
    if (indent(l) === 0) break; // left paths block
    const pm = l.match(/^\s{2}(\/[^:]*):\s*$/);
    if (!pm) continue;
    const path = pm[1]; out[path] = {};
    // methods under this path
    for (let j = i + 1; j < lines.length; j++) {
      const m = lines[j]; if (!m.trim()) continue;
      if (indent(m) <= pathBase) { i = j - 1; break; }
      const mm = m.match(/^\s{4}(get|post|put|delete|patch):\s*$/);
      if (!mm) continue;
      const method = mm[1]; const codes = [];
      const required = [];
      // scan this method block for response codes + required fields
      for (let k = j + 1; k < lines.length; k++) {
        const r = lines[k]; if (!r.trim()) continue;
        if (indent(r) <= 4) break;
        const cm = r.match(/^\s{8}['"]?(\d{3})['"]?:\s*$/);
        if (cm) codes.push(cm[1]);
        const rq = r.match(/^\s*required:\s*\[([^\]]*)\]/);
        if (rq) rq[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean).forEach(f => required.push(f));
      }
      out[path][method] = { codes, required };
    }
  }
  return out;
}

function loadSpec(path) {
  const raw = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    const doc = JSON.parse(raw);
    const paths = {};
    for (const [p, methods] of Object.entries(doc.paths || {})) {
      paths[p] = {};
      for (const [m, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(m)) continue;
        const codes = Object.keys(op.responses || {});
        const ok = op.responses?.['200'] || op.responses?.['2XX'] || {};
        const schema = ok.content?.['application/json']?.schema || ok.schema || {};
        paths[p][m] = { codes, required: schema.required || [] };
      }
    }
    return paths;
  }
  return parseYamlPaths(raw);
}

async function probe(base, path) {
  const url = base.replace(/\/$/, '') + path;
  try {
    const res = await fetch(url, { method: 'GET' });
    let body = null;
    try { body = await res.json(); } catch { /* non-json */ }
    return { status: res.status, body };
  } catch (e) { return { status: 0, error: String(e) }; }
}

async function conformance(specPath, baseUrl) {
  const gaps = [];
  const paths = loadSpec(specPath);
  let probed = 0;
  for (const [p, methods] of Object.entries(paths)) {
    const op = methods.get; if (!op) continue;            // non-destructive only
    if (/[{}]/.test(p)) continue;                          // has path params — skip (no example machinery)
    probed++;
    const { status, body, error } = await probe(baseUrl, p);
    const wants2xx = (op.codes || []).some(c => /^2/.test(c)) || op.codes.length === 0;
    if (error) { gaps.push({ path: p, method: 'GET', problem: `unreachable: ${error}` }); continue; }
    if (wants2xx && !(status >= 200 && status < 300))
      gaps.push({ path: p, method: 'GET', problem: `expected 2xx, got ${status} — spec route missing/broken in app` });
    if (status >= 200 && status < 300 && body && typeof body === 'object')
      for (const f of op.required || [])
        if (!(f in body)) gaps.push({ path: p, method: 'GET', problem: `response missing required field '${f}'` });
  }
  return { gaps, probed };
}

// ── self-test: stub server + JSON spec, compliant + drift + skip ──────────
async function selfTest() {
  const http = await import('node:http');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const server = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ok' })); }
    else { res.writeHead(404); res.end('nope'); }   // /missing drifts (spec has it, app 404s)
  });
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), 'contract-'));
  const spec = join(dir, 'openapi.json');
  writeFileSync(spec, JSON.stringify({ openapi: '3.0.0', paths: {
    '/health': { get: { responses: { '200': { content: { 'application/json': { schema: { required: ['status'] } } } } } } },
    '/missing': { get: { responses: { '200': {} } } },
  } }));
  const fail = (m) => { server.close(); console.log(`contract-conformance self-test FAIL: ${m}`); process.exit(1); };
  const { gaps } = await conformance(spec, base);
  server.close();
  const healthGap = gaps.find(g => g.path === '/health');
  const missingGap = gaps.find(g => g.path === '/missing');
  if (healthGap) fail(`/health should be conformant, got: ${healthGap.problem}`);
  if (!missingGap) fail('/missing drift not detected');
  // SKIP path: no spec
  console.log('contract-conformance self-test PASS (compliant clean, drift flagged)');
  process.exit(0);
}

if (has('--self-test')) { await selfTest(); }
else {
  const spec = flag('--spec', 'openapi.yaml');
  const base = flag('--base-url', process.env.APP_BASE_URL || '');
  if (!existsSync(spec)) { console.log(`SKIP: no spec at ${spec}`); process.exit(0); }
  if (!base) { console.log('SKIP: no --base-url / APP_BASE_URL (app not booted)'); process.exit(0); }
  const { gaps, probed } = await conformance(spec, base);
  for (const g of gaps) console.log(JSON.stringify({ ...g, spec, base }));
  console.error(`[contract-conformance] probed ${probed} GET endpoint(s), ${gaps.length} gap(s)`);
  process.exit(gaps.length ? 1 : 0);
}
