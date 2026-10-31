import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/semgrep-scan.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/semgrep-scan.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
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
  execute: (args, context) => impl.execute(args, context),
});
