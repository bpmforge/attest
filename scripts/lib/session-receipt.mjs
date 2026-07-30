/**
 * session-receipt.mjs — the G1 session-model receipt (T30.2), extracted from
 * plugins/expert-hooks.ts.
 *
 * WHY IT LIVES HERE AND NOT IN THE PLUGIN. OpenCode's plugin loader calls every
 * EXPORT of a file in `plugins/` as a plugin factory. expert-hooks.ts exported
 * its Plugin plus four helpers, so the loader invoked `globToRegExpForTier` with
 * its own context object and the whole plugin failed to load:
 *
 *     failed to load plugin .../expert-hooks.ts
 *     error="glob.replace is not a function"
 *
 * That killed everything the plugin provides — dangerous-bash blocking,
 * .env/credential write blocking, post-edit format/lint/typecheck/secret-scan,
 * telemetry and this receipt — silently, on every session. The control case is
 * resume-anchor.ts, which exports only its Plugin and has never failed to load.
 * A plugin file must therefore export exactly one thing: the Plugin.
 *
 * The tier matching also duplicated model-tiers.mjs, justified by a comment
 * saying "install.sh only ships plugins/ to a target project (not scripts/)".
 * That stopped being true: install.sh copies `scripts/` in BOTH modes ("when
 * project mode skipped this, every script-backed skill resolved to a file that
 * was never placed there"). The duplicate is gone; this imports the real one.
 */
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { resolveTier } from "./model-tiers.mjs";

const tierConfigCache = new Map();

/** Project-level models.json, cached per root. Absent file = unclassified, not an error. */
export function loadTierConfig(root) {
  if (tierConfigCache.has(root)) return tierConfigCache.get(root);
  let config = null;
  try {
    config = JSON.parse(readFileSync(join(root, "models.json"), "utf8"));
  } catch {
    // No project-level models.json — tier resolves to null (unclassified),
    // not an error; the gate only fires for a resolved "frontier" tier.
  }
  tierConfigCache.set(root, config);
  return config;
}

/** Resolve a model id to its tier, or null. Thin alias over the shared registry. */
export function resolveTierForReceipt(modelId, config) {
  if (!modelId || !config?.tiers) return null;
  return resolveTier(modelId, config) ?? null;
}

/** Append one receipt row for the model actually running this session. */
export function logSessionReceipt(projectRoot, info) {
  try {
    const modelId = `${info.providerID}/${info.modelID}`;
    const tier = resolveTierForReceipt(modelId, loadTierConfig(projectRoot));
    const row = {
      ts: new Date(info.time?.created ?? Date.now()).toISOString(),
      source: "plugin",
      session: info.sessionID,
      agent: info.mode ?? null,
      model: modelId,
      tier,
    };
    const file = join(projectRoot, "docs", "work", "session-receipts.jsonl");
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(row) + "\n");
    console.log(
      `[session-model] ${modelId}${tier ? ` (tier: ${tier})` : " (tier: unclassified)"}`,
    );
  } catch {
    // Never block a session on a receipt write.
  }
}
