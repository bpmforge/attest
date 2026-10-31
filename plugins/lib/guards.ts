// plugins/lib/guards.ts — pure pre-tool guards: dangerous-bash blocklist, protected-file
// patterns, turn-cap enforcement, config-protection + gateguard. NO opencode imports.
// Shared by the v1 and v2 plugin shells; both call beforeToolCheck() and let it throw.
import { appendFileSync, existsSync, realpathSync } from "node:fs";
import { configProtectionCheck, gateguardCheck } from "../../scripts/lib/hook-guards.mjs";
import { WRITE_TOOLS, turnCapDecision } from "./turn-cap.ts";

// ─── Dangerous bash command blocklist ────────────────────────────────
export const DANGEROUS_BASH: Array<[RegExp, string]> = [
  [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+\/\s*$|rm\s+-rf\s+\/\s*$/i,
    "rm -rf / — would delete the entire filesystem",
  ],
  [/\bDROP\s+TABLE\b/i, "DROP TABLE — destructive database operation"],
  [
    /\bDELETE\s+FROM\s+\S+\s*(?:;|$)(?!.*\bWHERE\b)/i,
    "DELETE FROM without WHERE — would delete all rows",
  ],
  [
    /\bgit\s+push\s+.*--force\b|\bgit\s+push\s+-f\b/i,
    "git push --force — would rewrite remote history",
  ],
  [
    /\bgit\s+reset\s+--hard\b/i,
    "git reset --hard — would discard uncommitted work",
  ],
  [/\bnpm\s+publish\b/i, "npm publish — would publish to the public registry"],
  [
    /\bcurl\s+.*\|\s*bash\b|\bwget\s+.*\|\s*bash\b/i,
    "curl|bash / wget|bash — executing untrusted remote code",
  ],
];

// ─── Files / paths that must never be written ────────────────────────
export const BLOCKED_FILE_PATTERNS: Array<[RegExp, string]> = [
  [
    /\.env(\..+)?$/i,
    ".env file — use environment variables or a secrets manager",
  ],
  [/\/credentials\.json$|\/secrets\.json$/i, "credentials/secrets file"],
  [/\.(key|pem|p12|pfx)$/i, "private-key file"],
  [/\/(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/, "SSH private key"],
];

// ─── Hardcoded-secret scanner patterns ───────────────────────────────
export const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
    "possible hardcoded API key",
  ],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS Access Key ID"],
  [
    /(?:aws[_-]?secret[_-]?access[_-]?key|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/i,
    "possible AWS Secret Access Key",
  ],
  [
    /-----BEGIN\s+(?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    "private key (PEM format)",
  ],
  [
    /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/i,
    "possible hardcoded password",
  ],
  [
    /(?:bearer|token|auth[_-]?token|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-.]{20,}["']/i,
    "possible hardcoded auth/bearer token",
  ],
  [
    /(?:postgres|mysql|mongodb|redis|amqp)(?:ql)?:\/\/[^:]+:[^@]+@/i,
    "DB connection string with embedded credentials",
  ],
  [
    /(?:SECRET|TOKEN|PRIVATE[_-]KEY)\s*=\s*["'][A-Za-z0-9_\-/+=]{16,}["']/,
    "possible hardcoded secret or token",
  ],
];

export const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".lock",
  ".pyc",
  ".pyo",
  ".so",
  ".dylib",
  ".dll",
]);


export function extension(filePath: string): string {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx).toLowerCase();
}

export function basename(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

/**
 * Pre-tool guard. Throws Error(message) to block the call; returns normally to allow.
 * `args` is the tool-call arguments (v1 passes them in `output.args` for the before hook).
 * `gated` is per-plugin-instance gateguard state (Map), `turns` the session's completed turn count.
 */
export function beforeToolCheck(o: {
  tool: string;
  sessionID: string;
  args: any;
  gated: Map<string, number>;
  turns: number;
  maxTurns: number;
  env?: Record<string, string | undefined>;
}): void {
  const env = o.env ?? process.env;
  const args = o.args ?? {};

  // Turn cap — before anything else, so a capped session cannot spend another
  // 40k-token turn on a read it will not get to act on.
  const capMsg = turnCapDecision({ turns: o.turns, max: o.maxTurns, tool: o.tool, filePath: args?.filePath ?? args?.file_path ?? "" });
  if (capMsg) throw new Error(capMsg);

  // Bash: block dangerous commands
  if (o.tool === "bash" || o.tool === "run") {
    const command: string = args?.command ?? "";
    for (const [pattern, reason] of DANGEROUS_BASH) {
      if (pattern.test(command)) {
        throw new Error(
          `BLOCKED: ${reason}\nCommand: ${command}\n\nIf you truly need this, ask the user to run it manually outside opencode.`,
        );
      }
    }
  }

  // Write/edit: block .env and credential files
  if (WRITE_TOOLS.has(o.tool)) {
    const filePath: string = args?.filePath ?? args?.file_path ?? "";
    if (!filePath) return;

    // K1/K2 (ECC): config-protection + opt-in fact-forcing gate.
    const exists = existsSync(filePath);
    let realPath: string | undefined;
    try {
      realPath = exists ? realpathSync(filePath) : undefined;
    } catch {
      /* unresolvable: fall back to the given path */
    }
    const cfg = configProtectionCheck(filePath, exists, env, { realPath });
    if (cfg) throw new Error(cfg);

    for (const [pattern, reason] of BLOCKED_FILE_PATTERNS) {
      if (pattern.test(filePath) || pattern.test(basename(filePath))) {
        throw new Error(
          `BLOCKED: writing to ${reason} is not allowed.\nPath: ${filePath}\n\nUse environment variables, a secrets manager, or have the user place the file manually.`,
        );
      }
    }

    const gate = gateguardCheck(o.gated, o.sessionID, filePath, exists, env, {
      log: (rec: object) => {
        const f = env.EXPERTS_GATEGUARD_LOG;
        if (f) appendFileSync(f, JSON.stringify(rec) + "\n");
      },
    });
    if (gate) throw new Error(gate);
  }
}
