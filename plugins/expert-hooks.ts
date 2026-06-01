import type { Plugin } from "@opencode-ai/plugin";

// expert-hooks.ts — opencode plugin
//
// Ports the high-value subset of claude-experts' hooks to opencode's
// plugin surface. Two phases:
//
//   tool.execute.before   block dangerous bash commands; block writes to
//                         .env / credential / key files.
//
//   tool.execute.after    after a write/edit, run format → lint → type-check
//                         → secret-scan against the file. All formatters
//                         are best-effort: failures inform the LLM via
//                         console.warn but never block the workflow.
//
// Skipped hooks (different abstraction, not portable as plugins):
//   - commit-validator.sh  → use a git pre-commit hook in the user's repo
//   - test-on-stop.sh      → no clean session.idle "wind down" semantic;
//                            users invoke /test-expert when ready
//   - session-start.sh     → opencode has no UserPromptSubmit-equivalent
//                            today; deferred until the event API exposes it

// ─── Dangerous bash command blocklist ────────────────────────────────
const DANGEROUS_BASH: Array<[RegExp, string]> = [
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
const BLOCKED_FILE_PATTERNS: Array<[RegExp, string]> = [
  [
    /\.env(\..+)?$/i,
    ".env file — use environment variables or a secrets manager",
  ],
  [/\/credentials\.json$|\/secrets\.json$/i, "credentials/secrets file"],
  [/\.(key|pem|p12|pfx)$/i, "private-key file"],
  [/\/(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/, "SSH private key"],
];

// ─── Hardcoded-secret scanner patterns ───────────────────────────────
const SECRET_PATTERNS: Array<[RegExp, string]> = [
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

const SKIP_EXTENSIONS = new Set([
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

const WRITE_TOOLS = new Set(["write", "edit"]);

function extension(filePath: string): string {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx).toLowerCase();
}

function basename(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

export const ExpertHooks: Plugin = async ({ $ }) => {
  return {
    "tool.execute.before": async (input, _output) => {
      // Bash: block dangerous commands
      if (input.tool === "bash" || input.tool === "run") {
        const command: string = input.args?.command ?? "";
        for (const [pattern, reason] of DANGEROUS_BASH) {
          if (pattern.test(command)) {
            throw new Error(
              `BLOCKED: ${reason}\nCommand: ${command}\n\nIf you truly need this, ask the user to run it manually outside opencode.`,
            );
          }
        }
      }

      // Write/edit: block .env and credential files
      if (WRITE_TOOLS.has(input.tool)) {
        const filePath: string =
          input.args?.filePath ?? input.args?.file_path ?? "";
        if (!filePath) return;

        for (const [pattern, reason] of BLOCKED_FILE_PATTERNS) {
          if (pattern.test(filePath) || pattern.test(basename(filePath))) {
            throw new Error(
              `BLOCKED: writing to ${reason} is not allowed.\nPath: ${filePath}\n\nUse environment variables, a secrets manager, or have the user place the file manually.`,
            );
          }
        }
      }
    },

    "tool.execute.after": async (input, _output) => {
      if (!WRITE_TOOLS.has(input.tool)) return;

      const filePath: string =
        input.args?.filePath ?? input.args?.file_path ?? "";
      if (!filePath) return;

      const ext = extension(filePath);
      if (SKIP_EXTENSIONS.has(ext)) return;

      // Run all post-edit checks in parallel — they're independent and
      // failures in any one don't affect the others.
      await Promise.allSettled([
        formatFile(filePath, ext, $),
        lintFile(filePath, ext, $),
        typeCheckFile(filePath, ext, $),
        secretScan(filePath, ext, $),
      ]);
    },
  };
};

async function formatFile(filePath: string, ext: string, $: any) {
  try {
    if (
      [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"].includes(
        ext,
      )
    ) {
      await $`prettier --write ${filePath}`.quiet();
    } else if (ext === ".py") {
      await $`black ${filePath}`.quiet();
      await $`isort ${filePath}`.quiet();
    } else if (ext === ".go") {
      await $`gofmt -w ${filePath}`.quiet();
    } else if (ext === ".rs") {
      await $`rustfmt ${filePath}`.quiet();
    }
  } catch {
    // Formatter not installed or file unsupported — silent.
  }
}

async function lintFile(filePath: string, ext: string, $: any) {
  try {
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      const result = await $`eslint ${filePath} --max-warnings 0`
        .quiet()
        .nothrow();
      if (result.exitCode !== 0 && result.stdout?.length) {
        console.warn(
          `[lint] ${filePath}\n${result.stdout.toString().slice(0, 2000)}`,
        );
      }
    } else if (ext === ".py") {
      const result = await $`ruff check ${filePath}`.quiet().nothrow();
      if (result.exitCode !== 0 && result.stdout?.length) {
        console.warn(
          `[lint] ${filePath}\n${result.stdout.toString().slice(0, 2000)}`,
        );
      }
    }
  } catch {
    // Linter not installed — silent.
  }
}

async function typeCheckFile(filePath: string, ext: string, $: any) {
  try {
    if ([".ts", ".tsx"].includes(ext)) {
      const result = await $`tsc --noEmit --pretty false ${filePath}`
        .quiet()
        .nothrow();
      if (result.exitCode !== 0 && result.stdout?.length) {
        const lines = result.stdout
          .toString()
          .split("\n")
          .slice(0, 30)
          .join("\n");
        console.warn(`[tsc] ${filePath}\n${lines}`);
      }
    }
  } catch {
    // tsc not installed — silent.
  }
}

async function secretScan(filePath: string, _ext: string, $: any) {
  try {
    const content = (await $`cat ${filePath}`.quiet().text()) ?? "";
    const findings: string[] = [];
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(content)) findings.push(label);
    }
    if (findings.length) {
      console.warn(
        `[secret-scan] ${filePath} — possible secrets: ${findings.join(", ")}\nMove these to environment variables or a secrets manager.`,
      );
    }
  } catch {
    // File unreadable — silent.
  }
}
