#!/usr/bin/env node
// model-tiers.mjs -- tier resolution over models.json's `tiers` registry
// (T30.1, M30 model-tier guard), plus the scan primitives backing
// scripts/validators/validate-model-pins.sh (G3, the config-pin lint).
//
// Every model id resolves to exactly one tier by matching its glob patterns
// in declaration order -- config.tiers is a plain object, so Object.entries()
// preserves the JSON file's own key order (local -> cheap -> frontier); first
// matching pattern wins. A model matching no pattern resolves to `null`
// (unknown tier), not an error -- an unrecognized model id is exactly the
// "any raw pin outside models.json" case the G3 lint warns on, not a crash.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function resolveTier(modelId, config) {
  if (!modelId || !config?.tiers) return null;
  for (const [tierName, tier] of Object.entries(config.tiers)) {
    for (const pattern of tier.match ?? []) {
      if (globToRegExp(pattern).test(modelId)) return tierName;
    }
  }
  return null;
}

export function getGatePolicy(modelId, config) {
  const tier = resolveTier(modelId, config);
  return tier ? (config.tiers[tier]?.gate ?? null) : null;
}

export function getMaxOutputReal(modelId, config) {
  return config?.models?.[modelId]?.max_output_real ?? null;
}

export function loadModelsConfig(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// -- role→model routing (T28.2, M28 Conductor) -------------------------------
//
// config.roles is a flat { roleName: modelId } map -- the conductor resolves
// its coder session's model from roles.coder (falling back to an explicit
// --model, then to opencode's own default); reviewer/challenger entries are
// config-level routing declarations, not (yet) live sessions this repo's
// conductor spawns itself -- see conductor.mjs's own header note on scope.

export function resolveRole(role, config, fallback = null) {
  return config?.roles?.[role] ?? fallback;
}

// Maker != verifier, mechanically: a verifier role (reviewer/challenger by
// default) configured to the SAME model id as the coder role defeats the
// never-self-judge principle at the config level, before any session even
// runs. Returns [] when clean or when the coder role isn't configured (no
// coder model -> nothing to compare against). Each violation names the
// offending verifier role + the shared model id.
export function checkMakerVerifierDistinct(config, { coderRole = 'coder', verifierRoles = ['reviewer', 'challenger'] } = {}) {
  const coderModel = resolveRole(coderRole, config);
  if (!coderModel) return [];
  const violations = [];
  for (const role of verifierRoles) {
    const model = resolveRole(role, config);
    if (model && model === coderModel) violations.push({ role, model });
  }
  return violations;
}

// -- G3 config-pin lint primitives -------------------------------------------
//
// "repo config / agent frontmatter" = a YAML frontmatter `model:` key at the
// top of any .md file, or a JSON `"model"` key anywhere in a .json/.jsonc
// file. Deliberately a literal field name, not a prose substring search --
// design docs and tickets talk ABOUT model ids constantly (this program's own
// ADVISOR_MODEL_ROUTING_DESIGN.md ships JSON examples full of them), so a bare
// substring scan would drown in false positives from prose.
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.worktrees', '.claude',
]);
const SCAN_EXTENSIONS = new Set(['.md', '.json', '.jsonc']);
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const YAML_MODEL_KEY = /^[ \t]*model:[ \t]*["']?([^"'\r\n#]+?)["']?[ \t]*(?:#.*)?$/m;
const JSON_MODEL_KEY = /"model"\s*:\s*"([^"]+)"/g;

export function findScannableFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) findScannableFiles(full, out);
    else if (SCAN_EXTENSIONS.has(extname(entry))) out.push(full);
  }
  return out;
}

export function scanFileForModelPins(contents, ext) {
  const ids = [];
  const fm = FRONTMATTER.exec(contents);
  if (fm) {
    const m = YAML_MODEL_KEY.exec(fm[1]);
    if (m) ids.push(m[1].trim());
  }
  if (ext === '.json' || ext === '.jsonc') {
    JSON_MODEL_KEY.lastIndex = 0;
    let m;
    while ((m = JSON_MODEL_KEY.exec(contents))) ids.push(m[1]);
  }
  return ids;
}

// Returns [{file, modelId, tier, severity}], severity: 'gap' (frontier pin,
// hard gap) | 'warn' (any other raw pin -- works today, bypasses the tier
// registry). `modelsJsonPath` itself is excluded -- it's the registry, not a
// pin to lint against itself.
export function scanRepoForModelPins(root, config, modelsJsonPath) {
  const findings = [];
  for (const file of findScannableFiles(root)) {
    if (file === modelsJsonPath) continue;
    const contents = readFileSync(file, 'utf8');
    for (const modelId of scanFileForModelPins(contents, extname(file))) {
      const tier = resolveTier(modelId, config);
      findings.push({
        file: relative(root, file),
        modelId,
        tier,
        severity: tier === 'frontier' ? 'gap' : 'warn',
      });
    }
  }
  return findings;
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'resolve') {
    const [modelId, modelsJsonPath] = rest;
    const config = loadModelsConfig(modelsJsonPath);
    console.log(resolveTier(modelId, config) ?? 'none');
    return;
  }
  if (cmd === 'scan') {
    const [root, modelsJsonPath] = rest;
    const config = loadModelsConfig(modelsJsonPath);
    const findings = scanRepoForModelPins(root, config, modelsJsonPath);
    for (const f of findings) {
      const tag = f.severity === 'gap' ? 'GAP' : 'WARN';
      console.log(`[${tag}] ${f.file}: model "${f.modelId}" (tier=${f.tier ?? 'unknown'})`);
    }
    return;
  }
  if (cmd === 'roles-check') {
    const [modelsJsonPath] = rest;
    const config = loadModelsConfig(modelsJsonPath);
    const violations = checkMakerVerifierDistinct(config);
    for (const v of violations) {
      console.log(`[VIOLATION] roles.${v.role} ("${v.model}") matches roles.coder -- maker and verifier must differ`);
    }
    if (!violations.length) console.log('[CLEAN] coder/reviewer/challenger roles are distinct');
    return;
  }
  console.error(
    'usage: model-tiers.mjs resolve <modelId> <modelsJsonPath> | scan <root> <modelsJsonPath> | roles-check <modelsJsonPath>',
  );
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
