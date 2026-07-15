#!/usr/bin/env node
// figma.mjs — Figma design-source adapter for the design pipeline.
//
// DESIGN (docs/DESIGN_FIGMA_ADAPTER.md): Figma is to the DESIGN pipeline what
// Jira (scripts/jira/) is to the TICKET pipeline — an external source consumed
// via a NORMALIZED SNAPSHOT, with the internal artifact (docs/design/tokens.json,
// owned by design-system-lead) staying authoritative and graceful fallback to
// the prose-authored path when no Figma is configured. Same shape as the tracker-
// model.mjs pattern: this repo does not become a live Figma client for every use;
// it pulls a normalized export the design agents consume.
//
//   pull          → docs/design/figma-snapshot.json   (variables→tokens,
//                   components→inventory, top-level frames→screen inventory)
//   derive-tokens → maps the snapshot into design-system-lead's tokens.json shape
//   doctor        → config + connectivity + coverage report
//
// Direction is one-way (Figma → code); we never push design back — matching
// frontend-design.md's "two-way sync is how tokens fork" rule.
//
// Auth: Figma personal access token via the `X-Figma-Token` header (not Bearer).
// The REST client takes an injectable fetchImpl so the tests exercise every path
// against a mocked Figma with no live file.
//
// Graceful fallback: no FIGMA_TOKEN → the adapter is disabled; design-system-lead
// authors tokens.json from prose exactly as before. Purely additive.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Config ──────────────────────────────────────────────────────────────────

export function resolveConfig(env = process.env) {
  const token = env.FIGMA_TOKEN || '';
  const fileKey = env.FIGMA_FILE_KEY || env.FIGMA_FILE || '';
  if (!token) return { enabled: false, reason: 'FIGMA_TOKEN unset' };
  return {
    enabled: true,
    token,
    fileKey,
    baseUrl: (env.FIGMA_BASE_URL || 'https://api.figma.com').replace(/\/+$/, ''),
  };
}

// ── REST client (Figma API v1) ──────────────────────────────────────────────

export class FigmaClient {
  constructor(cfg, fetchImpl = globalThis.fetch) {
    if (!cfg || !cfg.enabled) throw new Error('FigmaClient constructed with a disabled config');
    this.cfg = cfg;
    this._fetch = fetchImpl;
  }
  async _get(path) {
    const res = await this._fetch(`${this.cfg.baseUrl}${path}`, {
      method: 'GET',
      headers: { 'X-Figma-Token': this.cfg.token, 'Accept': 'application/json' },
    });
    const text = typeof res.text === 'function' ? await res.text() : '';
    if (!res.ok) {
      const e = new Error(`Figma GET ${path} → ${res.status} ${text.slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }
    return text ? JSON.parse(text) : {};
  }
  getFile(key) { return this._get(`/v1/files/${key}`); }
  getLocalVariables(key) { return this._get(`/v1/files/${key}/variables/local`); }
  getMe() { return this._get('/v1/me'); }
}

// ── Normalization helpers ────────────────────────────────────────────────────

// Figma color {r,g,b,a} in 0..1 → #rrggbb / #rrggbbaa.
export function figmaColorToHex(c) {
  const to255 = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255);
  const hex = (n) => to255(n).toString(16).padStart(2, '0');
  const base = `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  return c.a === undefined || c.a >= 1 ? base : `${base}${hex(c.a)}`;
}

// Reduce a variable's valuesByMode to a single representative value (first mode).
function firstModeValue(v) {
  const vals = v.valuesByMode || {};
  const first = Object.values(vals)[0];
  return first;
}

// ── pull: normalized design snapshot ─────────────────────────────────────────

export async function pull(client) {
  const key = client.cfg.fileKey;
  if (!key) throw new Error('no FIGMA_FILE_KEY configured');
  const file = await client.getFile(key);

  // Variables are the clean token source when available (Figma variables ARE
  // design tokens). Not on every plan — degrade to an empty token set and let
  // the caller know via coverage, never throw.
  let tokens = [];
  try {
    const varsRes = await client.getLocalVariables(key);
    tokens = normalizeVariables(varsRes);
  } catch (e) {
    if (e.status && e.status !== 403 && e.status !== 404) throw e;
    // 403/404 → variables API unavailable on this plan; tokens stay empty.
  }

  const components = Object.values(file.components || {}).map((c) => ({
    name: c.name, key: c.key || null, description: c.description || '',
  }));

  // Top-level frames on the first canvas = the screen inventory.
  const canvases = (file.document?.children || []).filter((n) => n.type === 'CANVAS');
  const screens = [];
  for (const canvas of canvases) {
    for (const node of canvas.children || []) {
      if (node.type === 'FRAME') screens.push({ name: node.name, id: node.id, canvas: canvas.name });
    }
  }

  return {
    generatedAt: nowIso(),
    sourceFile: file.name || key,
    fileKey: key,
    tokens,
    components,
    screens,
  };
}

function normalizeVariables(varsRes) {
  const meta = varsRes.meta || {};
  const out = [];
  for (const v of Object.values(meta.variables || {})) {
    const val = firstModeValue(v);
    if (val === undefined) continue;
    if (v.resolvedType === 'COLOR' && val && typeof val === 'object' && 'r' in val) {
      out.push({ name: v.name, type: 'color', value: figmaColorToHex(val) });
    } else if (v.resolvedType === 'FLOAT') {
      out.push({ name: v.name, type: 'number', value: val });
    } else if (v.resolvedType === 'STRING') {
      out.push({ name: v.name, type: 'string', value: String(val) });
    }
  }
  return out;
}

function nowIso() {
  return process.env.__FIGMA_FAKE_TS || new Date().toISOString();
}

// ── derive-tokens: snapshot → design-system-lead's tokens.json shape ─────────
//
// Maps normalized Figma tokens (named by convention, e.g. "color/primary",
// "spacing/2", "radius/md", "motion/fast") into the required tokens.json shape.
// Best-effort by name; whatever can't be mapped is reported so design-system-
// lead fills the remaining keys by hand rather than inventing the whole file.
export function deriveTokens(snapshot) {
  const t = { color: { semantic: {} }, typography: {}, spacing: [], motion: { duration: {} }, shadow: [] };
  const unmapped = [];
  const seg = (name) => name.toLowerCase().split(/[/.]/).filter(Boolean);

  for (const tok of snapshot.tokens || []) {
    const parts = seg(tok.name);
    const head = parts[0];
    const leaf = parts[parts.length - 1];
    if (tok.type === 'color') {
      if (head === 'color' || head === 'colors') {
        const semantic = ['success', 'warning', 'error', 'info'];
        if (semantic.includes(leaf)) t.color.semantic[leaf] = tok.value;
        else t.color[leaf] = tok.value;
      } else unmapped.push(tok.name);
    } else if (tok.type === 'number') {
      if (head === 'spacing' || head === 'space') t.spacing.push(tok.value);
      else if (head === 'radius' || head === 'shadow' || head === 'elevation') t.shadow.push(`${tok.value}`);
      else if (head === 'duration' || head === 'motion') t.motion.duration[leaf] = `${tok.value}ms`;
      else unmapped.push(tok.name);
    } else {
      if (head === 'font' || head === 'typography' || head === 'type') {
        if (leaf.includes('family')) t.typography.fontFamily = tok.value;
        else unmapped.push(tok.name);
      } else unmapped.push(tok.name);
    }
  }
  // Dedup/sort spacing numerically for a stable scale.
  t.spacing = [...new Set(t.spacing)].sort((a, b) => a - b);

  const requiredColor = ['primary', 'surface', 'border', 'text', 'muted'];
  const missing = [];
  for (const k of requiredColor) if (!(k in t.color)) missing.push(`color.${k}`);
  if (!t.typography.fontFamily) missing.push('typography.fontFamily');
  if (!t.spacing.length) missing.push('spacing');

  return { tokens: t, unmapped, missing };
}

// ── snapshot / tokens IO ─────────────────────────────────────────────────────

const SNAPSHOT_PATH = 'docs/design/figma-snapshot.json';
const TOKENS_PATH = 'docs/design/tokens.json';

function writeJson(path, obj) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), JSON.stringify(obj, null, 2) + '\n');
}

// ── doctor ───────────────────────────────────────────────────────────────────

export async function doctor(client) {
  const out = { config: 'ok', connectivity: null, fileKey: client.cfg.fileKey || '(unset)' };
  try { await client.getMe(); out.connectivity = 'ok'; }
  catch (e) { out.connectivity = `FAIL: ${e.message}`; }
  if (!client.cfg.fileKey) out.config = 'FIGMA_FILE_KEY unset — pull needs a file key';
  return out;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const USAGE = `usage: figma.sh <cmd>   (config via FIGMA_TOKEN, FIGMA_FILE_KEY)
  pull            fetch the file → docs/design/figma-snapshot.json (normalized)
  derive-tokens   figma-snapshot.json → docs/design/tokens.json (design-system-lead shape)
  doctor          config + connectivity check`;

async function main(argv) {
  const cmd = argv[0];
  const cfg = resolveConfig(process.env);
  if (!cmd) { console.error(USAGE); process.exit(2); }

  if (!cfg.enabled) {
    console.error(`[figma] not configured (${cfg.reason}) — design-system-lead authors tokens.json from prose (no Figma source). Set FIGMA_TOKEN + FIGMA_FILE_KEY to enable.`);
    process.exit(cmd === 'doctor' ? 0 : 1);
  }
  const client = new FigmaClient(cfg);

  switch (cmd) {
    case 'pull': {
      const snap = await pull(client);
      writeJson(SNAPSHOT_PATH, snap);
      console.log(`ok — pull: ${snap.tokens.length} token(s), ${snap.components.length} component(s), ${snap.screens.length} screen(s) → ${SNAPSHOT_PATH}`);
      if (!snap.tokens.length) console.log('  note: 0 variables (Figma Variables API needs a paid plan) — tokens.json will need manual authoring; components/screens still captured.');
      process.exit(0); break;
    }
    case 'derive-tokens': {
      if (!existsSync(resolve(SNAPSHOT_PATH))) { console.error(`[x] no ${SNAPSHOT_PATH} — run 'figma.sh pull' first`); process.exit(1); }
      const snap = JSON.parse(readFileSync(resolve(SNAPSHOT_PATH), 'utf8'));
      const { tokens, unmapped, missing } = deriveTokens(snap);
      writeJson(TOKENS_PATH, tokens);
      console.log(`ok — derive-tokens → ${TOKENS_PATH}`);
      if (missing.length) console.log(`  ⚠ ${missing.length} required key(s) not in Figma, author by hand: ${missing.join(', ')}`);
      if (unmapped.length) console.log(`  · ${unmapped.length} Figma token(s) had no tokens.json home (named off-convention): ${unmapped.slice(0, 8).join(', ')}`);
      process.exit(0); break;
    }
    case 'doctor': {
      console.log(JSON.stringify(await doctor(client), null, 2));
      process.exit(0); break;
    }
    default: console.error(`unknown command: ${cmd}\n${USAGE}`); process.exit(2);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main(process.argv.slice(2)).catch((e) => { console.error(`[x] ${e.message}`); process.exit(1); });
