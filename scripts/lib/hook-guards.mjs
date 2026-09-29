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

export function isProtectedConfig(filePath) {
  const base = String(filePath ?? "").split("/").pop();
  return PROTECTED_BASENAMES.has(base);
}

/** Returns a block message, or null to allow. `exists` = file already on disk. */
export function configProtectionCheck(filePath, exists, env = {}) {
  if (env[CONFIG_EDIT_BYPASS_ENV] === "1") return null;
  if (!exists || !isProtectedConfig(filePath)) return null;
  return (
    `BLOCKED: ${filePath} is lint/format/type/test config. Editing it to make a check pass hides the defect instead of fixing it.\n` +
    `Fix the source the check complains about. If the config change IS the task (ticket scope names this file), ` +
    `ask the user to re-run with ${CONFIG_EDIT_BYPASS_ENV}=1.`
  );
}

/**
 * state: a Set<string> of "<session>:<path>" already gated (caller owns it).
 * Returns the fact request (deny), or null (allow). Adds to state on deny so the
 * retry passes — that is the whole mechanism: the investigation is the point.
 */
export function gateguardCheck(state, sessionId, filePath, exists, env = {}) {
  if (env.EXPERTS_GATEGUARD !== "1" || !filePath) return null;
  const key = `${sessionId ?? "_"}:${filePath}`;
  if (state.has(key)) return null;
  state.add(key);
  return exists
    ? `GATEGUARD: before editing ${filePath}, state these facts (gather them with grep/read, then retry the same edit):\n` +
        `1. Every file that imports/requires it.\n2. The public functions/classes this change affects.\n` +
        `3. If it reads/writes data files: field names and structure (redacted values).\n4. The user's current instruction, quoted verbatim.`
    : `GATEGUARD: before creating ${filePath}, state these facts (then retry the same write):\n` +
        `1. The file(s)/line(s) that will call it.\n2. That no existing file already serves this purpose (show your search).\n` +
        `3. The user's current instruction, quoted verbatim.`;
}
