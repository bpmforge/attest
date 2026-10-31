import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/bash.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/bash.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    command: tool.schema
      .string()
      .describe(
        "Shell command to execute. Example: 'ls ~/.config/opencode/agents/' or 'cat README.md'",
      ),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Working directory (optional, defaults to project root)"),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Timeout in seconds (optional, defaults to 60)"),
  },
  execute: (args, context) => impl.execute(args, context),
});
