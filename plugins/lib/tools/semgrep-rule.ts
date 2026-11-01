// plugins/lib/tools/semgrep-rule.ts — the body of tools/semgrep-rule.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/semgrep-rule.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
// Prefer Opengrep (LGPL fork) over Semgrep for the same licensing reason as
// semgrep-scan: client-facing rule authoring runs on the unrestricted engine.
function resolveSastEngine(): "opengrep" | "semgrep" | null {
  const { execSync } = require("child_process");
  const has = (b: string) => {
    try {
      execSync(`command -v ${b}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  const forced = process.env.SAST_ENGINE;
  if (forced === "opengrep" || forced === "semgrep")
    return has(forced) ? forced : null;
  if (has("opengrep")) return "opengrep";
  if (has("semgrep")) return "semgrep";
  return null;
}

const def = {
  description:
    "Write and test a single SAST pattern (Opengrep preferred, Semgrep fallback) against code paths. Useful when authoring custom rules for the in-house rulepacks — provide the pattern expression, the language, and the paths to scan. NOT for full ruleset audits — use semgrep-scan for that. Returns matches with file:line locations and surrounding code.",

  async execute(args: any, context: any) {
    const engine = resolveSastEngine();
    if (!engine) {
      return "No SAST engine found. Install Opengrep (preferred): see references/semgrep-guide.md.";
    }
    let cmd = `${engine} -e "${args.expression}" --lang=${args.language}`;

    if (args.paths) {
      const paths = args.paths.split(",").map((p: string) => p.trim());
      cmd = `${cmd} ${paths.join(" ")}`;
    }

    return new Promise<string>((resolve, reject) => {
      const { spawn } = require("child_process");
      const proc = spawn(cmd, {
        cwd: context.directory,
        shell: true,
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data: Buffer | string) => {
        output += data.toString();
      });

      proc.stderr.on("data", (data: Buffer | string) => {
        errorOutput += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Command timed out after ${args.timeout}s`));
      }, args.timeout * 1000);

      proc.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (code === 0 || code === 1) {
          resolve(output || errorOutput || "No matches found");
        } else {
          reject(
            new Error(`Command failed with exit code ${code}: ${errorOutput}`),
          );
        }
      });

      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  },
};

export const name = "semgrep-rule";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "expression": {
      "description": "Pattern expression to test",
      "type": "string"
    },
    "language": {
      "description": "Language of the rule",
      "default": "go",
      "type": "string"
    },
    "paths": {
      "description": "Paths to scan (comma-separated)",
      "type": "string"
    },
    "timeout": {
      "description": "Timeout in seconds",
      "default": 60,
      "type": "number"
    }
  },
  "required": [
    "expression"
  ]
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
