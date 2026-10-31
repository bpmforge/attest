import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/run.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/run.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    command: tool.schema
      .string()
      .describe("Shell command to execute. Example: 'ls docs/'"),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Working directory (optional)"),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Timeout in seconds (optional)"),
  },
  execute: (args, context) => impl.execute(args, context),
});
