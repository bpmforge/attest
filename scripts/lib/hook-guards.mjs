/**
 * hook-guards.mjs — pure predicates behind the PreToolUse guards in
 * plugins/expert-hooks.ts (Group K, adapted from affaan-m/ECC, MIT).
 *
 * Lives here, not in plugins/, because a plugins/ file must export ONLY its
 * Plugin (OpenCode's loader calls every export as a plugin factory).
 *
 *   isProtectedConfig()  K1 config-protection — an agent that cannot pass a
 *                        check will loosen the check. Block edits to EXISTING
 *                        lint/format/type/test config; creating one is allowed.
 *   gateguardCheck()     K2 gateguard — deny the first edit of a file until the
 *                        agent has stated concrete facts, then allow the retry.
 *                        Opt-in (EXPERTS_GATEGUARD=1) until an eval shows it helps.
 */

import { resolve as resolvePath } from "node:path";

const PROTECTED_BASENAMES = new Set([
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml",
  "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
  ".prettierrc", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml",
  "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs",
  "biome.json", "biome.jsonc",
  "tsconfig.json", "tsconfig.base.json",
  "vitest.config.ts", "vitest.config.js", "vitest.config.mjs", "jest.config.js", "jest.config.ts", "jest.config.cjs",
  ".golangci.yml", ".golangci.yaml", ".golangci.toml",
  "ruff.toml", ".ruff.toml", "mypy.ini", ".mypy.ini", ".flake8", ".pylintrc",
  "clippy.toml", ".clippy.toml", "rustfmt.toml", ".rustfmt.toml", "deny.toml",
  ".editorconfig", ".stylelintrc", ".stylelintrc.json",
]);

export const CONFIG_EDIT_BYPASS_ENV = "EXPERTS_ALLOW_CONFIG_EDIT";

// Vendored / generated / fixture trees hold configs nobody is "loosening" — blocking them only trains bypassing.
const NON_PROJECT_DIR = /(^|[\\/])(node_modules|vendor|dist|build|\.git|fixtures?|__fixtures__)[\\/]/i;

const baseOf = (p) => String(p ?? "").split(/[\\/]/).pop().toLowerCase();

export function isProtectedConfig(filePath) {
  return PROTECTED_BASENAMES.has(baseOf(filePath));
}

/**
 * Returns a block message, or null to allow. `exists` = file already on disk.
 * opts.realPath = the symlink-resolved path (caller supplies it): an alias
 * (`link.json -> tsconfig.json`) must not dodge the guard. Matching is case-insensitive
 * (macOS default filesystem is), and Windows separators count.
 */
export function configProtectionCheck(filePath, exists, env = {}, opts = {}) {
  if (env[CONFIG_EDIT_BYPASS_ENV] === "1") return null;
  if (!exists) return null;
  if (NON_PROJECT_DIR.test(String(filePath ?? ""))) return null;
  const hit = isProtectedConfig(filePath) ? filePath : opts.realPath && isProtectedConfig(opts.realPath) ? opts.realPath : null;
  if (!hit) return null;
  return (
    `BLOCKED: ${filePath} is lint/format/type/test config${hit !== filePath ? ` (resolves to ${hit})` : ""}. Editing it to make a check pass hides the defect instead of fixing it.\n` +
    `Fix the source the check complains about. If the config change IS the task (ticket scope names this file), ` +
    `ask the user to re-run with ${CONFIG_EDIT_BYPASS_ENV}=1.`
  );
}

export const GATEGUARD_TTL_MS = 30 * 60 * 1000; // ECC parity: a session's gate memory expires after 30 min

/**
 * state: a Map<"<session>:<path>", deniedAtMs> (caller owns it).
 * Returns the fact request (deny), or null (allow). Marks the key on deny so the
 * retry passes — same as ECC: the retry is NOT checked for facts, so the treatment
 * is "forced pause + fact request"; the A/B separates the two (see GROUP_K_DESIGN.md).
 * opts.log(rec): called on every deny so a harness can count fires (a run where the
 * gate never fired must be discarded, else both arms are the same treatment).
 * opts.now: injectable clock for tests.
 */
export function gateguardCheck(state, sessionId, filePath, exists, env = {}, opts = {}) {
  if (env.EXPERTS_GATEGUARD !== "1" || !filePath) return null;
  const now = opts.now ?? Date.now();
  const key = `${sessionId ?? "_"}:${resolvePath(filePath)}`;
  const seen = state.get(key);
  if (seen !== undefined && now - seen < GATEGUARD_TTL_MS) return null;
  state.set(key, now);
  if (state.size > 5000) for (const [k, t] of state) if (now - t >= GATEGUARD_TTL_MS) state.delete(k);
  try {
    opts.log?.({ ts: now, event: "gate_denied", session: sessionId ?? "_", file: filePath, exists });
  } catch {
    /* a bad log path must not turn the fact request into an fs error (and skip the gate on retry) */
  }
  // A/B arm D (pure pause): same deny+retry mechanics, NO fact request — separates "made to read" from "forced pause".
  if (env.EXPERTS_GATEGUARD_NEUTRAL === "1") return `GATEGUARD: pausing this ${exists ? "edit" : "write"} of ${filePath}. Retry the same call.`;
  return exists
    ? `GATEGUARD: before editing ${filePath}, state these facts (gather them with grep/read, then retry the same edit):\n` +
        `1. Every file that imports/requires it.\n2. The public functions/classes this change affects.\n` +
        `3. If it reads/writes data files: field names and structure (redacted values).\n4. The user's current instruction, quoted verbatim.`
    : `GATEGUARD: before creating ${filePath}, state these facts (then retry the same write):\n` +
        `1. The file(s)/line(s) that will call it.\n2. That no existing file already serves this purpose (show your search).\n` +
        `3. If it reads/writes data files: field names and structure (redacted values).\n4. The user's current instruction, quoted verbatim.`;
}
