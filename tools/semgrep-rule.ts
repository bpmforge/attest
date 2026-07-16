import { tool } from "@opencode-ai/plugin";

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

export default tool({
  description:
    "Write and test a single SAST pattern (Opengrep preferred, Semgrep fallback) against code paths. Useful when authoring custom rules for the in-house rulepacks — provide the pattern expression, the language, and the paths to scan. NOT for full ruleset audits — use semgrep-scan for that. Returns matches with file:line locations and surrounding code.",
  args: {
    expression: tool.schema.string().describe("Pattern expression to test"),
    language: tool.schema
      .string()
      .optional()
      .default("go")
      .describe("Language of the rule"),
    paths: tool.schema
      .string()
      .optional()
      .describe("Paths to scan (comma-separated)"),
    timeout: tool.schema.number().default(60).describe("Timeout in seconds"),
  },
  async execute(args, context) {
    const engine = resolveSastEngine();
    if (!engine) {
      return "No SAST engine found. Install Opengrep (preferred): see references/semgrep-guide.md.";
    }
    let cmd = `${engine} -e "${args.expression}" --lang=${args.language}`;

    if (args.paths) {
      const paths = args.paths.split(",").map((p) => p.trim());
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
          resolve(output || errorOutput || "No matches found");
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
