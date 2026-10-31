import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/playwright-test.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/playwright-test.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    command: tool.schema
      .string()
      .default("playwright test")
      .describe("Playwright command to run"),
    paths: tool.schema
      .string()
      .optional()
      .describe("Test files or directories to run"),
    timeout: tool.schema.number().default(180).describe("Timeout in seconds"),
  },
  execute: (args, context) => impl.execute(args, context),
});
