import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/test-runner.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/test-runner.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    testFile: tool.schema.string().default("").describe("Specific test file to run (empty = all)"),
    pattern: tool.schema.string().default("").describe("Test name pattern to filter"),
    coverage: tool.schema.boolean().default(false).describe("Run with coverage report"),
    watch: tool.schema.boolean().default(false).describe("Watch mode"),
  },
  execute: (args, context) => impl.execute(args, context),
});
