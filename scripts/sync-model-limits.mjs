#!/usr/bin/env node
// sync-model-limits.mjs -- T30.8 (LOCAL_CONTEXT_INTEGRITY_DESIGN P2, ports
// docs/research/prototypes/sync-model-limits-proto.mjs from bpm-agent-amplifier).
//
// Thin CLI over scripts/lib/model-limits-sync.mjs's pure planSync(): probes LM
// Studio's /api/v0/models for what is ACTUALLY loaded, then reconciles opencode's
// `provider.<id>.models.<id>.limit.{context,output}` (plus a local-profile
// `compaction.prune`/`tool_output` trim) to match. Never tells LM Studio what to
// load -- read + reconcile, never dictate (Brad's decided constraint).
//
// Usage:
//   node sync-model-limits.mjs --config <opencode.json> [--base http://127.0.0.1:1234]
//        [--models <models.json>] [--write] [--margin 2048] [--floor 49152]
//        [--output-cap 8000] [--tool-output-max-lines 500] [--tool-output-max-bytes 20000]
// Default is dry-run (prints the proposed limits). --write patches the config (with .bak).
// Exit codes: 0 = clean/no refusals, 1 = at least one REFUSE finding (or LM Studio
// unreachable / nothing loaded -- a GAP, not an error), 2 = usage error.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { planSync, SYNC_DEFAULTS } from './lib/model-limits-sync.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const WRITE = process.argv.includes('--write');
const BASE = arg('base', 'http://127.0.0.1:1234');
const CONFIG = arg('config', null);
const MODELS_PATH = arg('models', resolve(HERE, '..', 'models.json'));
const MARGIN = Number(arg('margin', SYNC_DEFAULTS.margin));
const FLOOR = Number(arg('floor', SYNC_DEFAULTS.floor));
const OUTPUT_CAP = Number(arg('output-cap', SYNC_DEFAULTS.outputCapDefault));
const TOOL_MAX_LINES = Number(arg('tool-output-max-lines', SYNC_DEFAULTS.toolOutputMaxLines));
const TOOL_MAX_BYTES = Number(arg('tool-output-max-bytes', SYNC_DEFAULTS.toolOutputMaxBytes));

if (!CONFIG) {
  console.error(
    'usage: sync-model-limits.mjs --config <opencode.json> [--base url] [--models models.json] [--write]',
  );
  process.exit(2);
}
if (!existsSync(CONFIG)) {
  console.error(`usage error: config not found at ${CONFIG}`);
  process.exit(2);
}

const res = await fetch(`${BASE}/api/v0/models`).catch(() => null);
if (!res?.ok) {
  console.error(`GAP: LM Studio unreachable at ${BASE} -- refusing to write stale limits`);
  process.exit(1);
}
const loaded = (await res.json()).data.filter(
  (m) => m.state === 'loaded' && (m.type === 'llm' || m.type === 'vlm'),
);
if (!loaded.length) {
  console.error('GAP: no models loaded -- nothing to sync');
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
const modelsConfig = existsSync(MODELS_PATH) ? JSON.parse(readFileSync(MODELS_PATH, 'utf8')) : null;

const { findings, changed, refused, cfg: nextCfg } = planSync(loaded, cfg, {
  baseUrl: BASE,
  margin: MARGIN,
  floor: FLOOR,
  outputCapDefault: OUTPUT_CAP,
  toolOutputMaxLines: TOOL_MAX_LINES,
  toolOutputMaxBytes: TOOL_MAX_BYTES,
  modelsConfig,
});

console.log(findings.join('\n'));
if (changed && WRITE) {
  copyFileSync(CONFIG, `${CONFIG}.bak`);
  writeFileSync(CONFIG, JSON.stringify(nextCfg, null, 2) + '\n');
  console.log(`\nwrote ${CONFIG} (backup at .bak)`);
} else if (changed) {
  console.log('\ndry-run: re-run with --write to apply');
}
process.exit(refused ? 1 : 0);
