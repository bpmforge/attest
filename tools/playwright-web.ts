import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/playwright-web.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/playwright-web.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    command: tool.schema
      .string()
      .describe(
        "Command to run: 'open <url>', 'goto <url>', 'snapshot', 'extract', 'go-back', 'go-forward', 'reload', 'close'",
      ),
    timeout: tool.schema
      .number()
      .default(30)
      .describe(
        "Max seconds to wait (default 30; use 10 for extract, 15 for snapshot, 30 for page loads)",
      ),
  },
  execute: (args, context) => impl.execute(args, context),
});
