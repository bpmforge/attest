#!/usr/bin/env node
// model-limits-sync.mjs -- pure sync logic for T30.8 (LOCAL_CONTEXT_INTEGRITY_DESIGN P2).
//
// Probes LM Studio for what is ACTUALLY loaded and reconciles opencode's believed
// `limit.*` to match. Never tells LM Studio what to load (decided constraint: read
// + reconcile, never dictate -- see design doc "Explicitly rejected"). Floor rule
// per live validation V7: a believed context below opencode's ~29k fixed overhead
// + headroom produces an unconverging compaction loop, so sub-floor loads are
// REFUSEd with "load the model bigger", not written. Kept side-effect-free (no
// fetch/fs) so it can be unit-tested against fixtures without a live LM Studio --
// scripts/sync-model-limits.mjs is the thin CLI wrapper that does the I/O.

import { getMaxOutputReal } from './model-tiers.mjs';

// opencode hardcodes max_tokens=32000 regardless of configured limit.output
// (anomalyco/opencode#20078/#29363) -- writing anything above this is a no-op
// at best, so it is the absolute ceiling regardless of a model's real capacity.
export const HARD_OUTPUT_CEILING = 32000;

const DEFAULTS = {
  margin: 2048, // safety margin under the loaded window
  floor: 49152, // V7: ~29k fixed overhead + working headroom (measure per profile)
  outputCapDefault: 8000, // honest local output absent a models.json entry (LM Studio #1829 real ~10k)
  toolOutputMaxLines: 500, // lowered from opencode's default 2000 (local-profile overhead trim)
  toolOutputMaxBytes: 20000, // lowered from opencode's default 51200
};

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false; // not a URL -- never matches, never crashes
  }
}

// planSync: pure function, no I/O. `loadedModels` is the `data` array from LM
// Studio's `/api/v0/models` filtered to `state === 'loaded'`. `cfg` is the parsed
// opencode config object; returns a NEW config object (input is never mutated).
export function planSync(loadedModels, cfg, opts = {}) {
  const {
    baseUrl,
    margin = DEFAULTS.margin,
    floor = DEFAULTS.floor,
    outputCapDefault = DEFAULTS.outputCapDefault,
    toolOutputMaxLines = DEFAULTS.toolOutputMaxLines,
    toolOutputMaxBytes = DEFAULTS.toolOutputMaxBytes,
    modelsConfig = null,
  } = opts;

  const findings = [];
  let changed = false;
  const nextCfg = structuredClone(cfg ?? {});

  for (const [provId, prov] of Object.entries(nextCfg.provider ?? {})) {
    const base = prov.options?.baseURL ?? '';
    // exact host:port match -- startsWith would wrongly match :12345 against :1234
    if (!sameOrigin(base, baseUrl)) continue; // only sync providers pointing at the probed server

    for (const [modelId, modelCfg] of Object.entries(prov.models ?? {})) {
      const live = loadedModels.find((m) => m.id === modelId);
      if (!live) {
        findings.push(`SKIP  ${provId}/${modelId}: not loaded (limits left untouched)`);
        continue;
      }
      const ctx = live.loaded_context_length;
      if (!ctx) {
        findings.push(`SKIP  ${provId}/${modelId}: no loaded_context_length reported`);
        continue;
      }
      if (ctx < floor) {
        findings.push(
          `REFUSE ${provId}/${modelId}: loaded at ${ctx} < floor ${floor}. ` +
            `A believed context this small cannot fit opencode's ~29k fixed overhead -- ` +
            `raise the per-model default context in LM Studio (My Models) and reload.`,
        );
        continue;
      }
      const outputReal = getMaxOutputReal(modelId, modelsConfig);
      const output = Math.min(outputReal ?? outputCapDefault, HARD_OUTPUT_CEILING);
      const want = { context: ctx - margin, output };
      const cur = modelCfg.limit ?? {};
      if (cur.context === want.context && cur.output === want.output) {
        findings.push(`OK    ${provId}/${modelId}: limit already truthful (${want.context}/${want.output})`);
        continue;
      }
      findings.push(
        `SYNC  ${provId}/${modelId}: loaded_ctx=${ctx} -> limit.context ${cur.context ?? 'unset(=0: compaction DISABLED)'} -> ${want.context}, ` +
          `limit.output ${cur.output ?? 'unset'} -> ${want.output}`,
      );
      modelCfg.limit = want;
      changed = true;
    }
  }

  // Local-profile overhead trim (design Part 3/Part 6): only touches these
  // once at least one model limit actually changed above -- a config where
  // nothing needed syncing (already truthful, or no local provider present)
  // is left completely untouched here too. Both moves only ever TIGHTEN
  // (lower) toward the design's targets, never loosen a stricter existing
  // value the user already set.
  if (changed) {
    const priorPrune = nextCfg.compaction?.prune;
    if (priorPrune !== true) {
      nextCfg.compaction = { ...(nextCfg.compaction ?? {}), prune: true };
      findings.push(`SYNC  compaction.prune: ${priorPrune ?? 'unset(default false)'} -> true`);
    }
    const priorLines = nextCfg.tool_output?.max_lines;
    if (priorLines == null || priorLines > toolOutputMaxLines) {
      nextCfg.tool_output = { ...(nextCfg.tool_output ?? {}), max_lines: toolOutputMaxLines };
      findings.push(`SYNC  tool_output.max_lines: ${priorLines ?? 'unset(default 2000)'} -> ${toolOutputMaxLines}`);
    }
    const priorBytes = nextCfg.tool_output?.max_bytes;
    if (priorBytes == null || priorBytes > toolOutputMaxBytes) {
      nextCfg.tool_output = { ...(nextCfg.tool_output ?? {}), max_bytes: toolOutputMaxBytes };
      findings.push(`SYNC  tool_output.max_bytes: ${priorBytes ?? 'unset(default 51200)'} -> ${toolOutputMaxBytes}`);
    }
  }

  const refused = findings.some((f) => f.startsWith('REFUSE'));
  return { findings, changed, refused, cfg: nextCfg };
}

export { DEFAULTS as SYNC_DEFAULTS };
