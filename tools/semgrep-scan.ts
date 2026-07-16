import { tool } from "@opencode-ai/plugin";

// Prefer Opengrep (LGPL fork): the Semgrep-maintained registry rules are licensed
// for internal use only, so client-facing scans must use Opengrep + in-house
// bpm-rulepacks. Opengrep is CLI/rule-format compatible; Semgrep is the fallback.
function resolveEngine(): "opengrep" | "semgrep" | null {
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

// Rewrites a legacy `semgrep …` command to the resolved engine and, when
// RULEPACKS_DIR is set, swaps license-restricted registry configs for our packs.
function buildSastCommand(
  raw: string,
): { command: string } | { error: string } {
  const engine = resolveEngine();
  if (!engine)
    return {
      error:
        "No SAST engine found. Install Opengrep (preferred): see references/semgrep-guide.md.",
    };
  let cmd = raw.replace(/^\s*semgrep\b/, engine);
  const rulepacks = process.env.RULEPACKS_DIR;
  if (rulepacks) {
    cmd = cmd.replace(/--config\s+auto\b/g, `--config ${rulepacks}`);
    cmd = cmd.replace(/--config\s+p\/[^\s]+/g, `--config ${rulepacks}`);
  }
  return { command: cmd };
}

export default tool({
  description:
    "Run a SAST scan (Opengrep preferred, Semgrep fallback) on the codebase",
  args: {
    command: tool.schema
      .string()
      .default("semgrep scan")
      .describe(
        "Scan command; the `semgrep` prefix is rewritten to the resolved engine",
      ),
    config: tool.schema
      .string()
      .optional()
      .describe(
        "Config to use (prefer in-house rulepacks; registry packs are license-restricted for service use)",
      ),
    paths: tool.schema
      .string()
      .optional()
      .describe("Paths to scan (comma-separated)"),
    timeout: tool.schema.number().default(120).describe("Timeout in seconds"),
  },
  async execute(args, context) {
    const paths = args.paths
      ? args.paths.split(",").map((p) => p.trim())
      : [context.directory];
    const config = args.config ? `--config ${args.config}` : "";

    let raw = args.command;
    if (config) {
      raw = `${raw} ${config}`;
    }

    if (paths.length === 1) {
      raw = `${raw} ${paths[0]}`;
    } else {
      // Multiple paths - need special handling
      raw = `${raw} ${paths.join(" ")}`;
    }

    const resolved = buildSastCommand(raw);
    if ("error" in resolved) {
      return resolved.error;
    }
    const cmd = resolved.command;

    return new Promise<string>((resolve, reject) => {
      const { spawn } = require("child_process");
      const proc = spawn(cmd, {
        cwd: context.directory,
        shell: true,
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data) => {
        output += data.toString();
      });

      proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Command timed out after ${args.timeout}s`));
      }, args.timeout * 1000);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 || code === 1) {
          // Semgrep returns 1 when findings found
          resolve(output || errorOutput || "Scan complete");
        } else {
          reject(
            new Error(`Command failed with exit code ${code}: ${errorOutput}`),
          );
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  },
});
