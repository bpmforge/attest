import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/semgrep-rule.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/semgrep-rule.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
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
  execute: (args, context) => impl.execute(args, context),
});
