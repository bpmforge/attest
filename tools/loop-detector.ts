import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/loop-detector.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/loop-detector.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    action: tool.schema
      .enum(["check", "record", "reset"])
      .default("check")
      .describe("Action to perform"),
    type: tool.schema
      .enum(["write", "read", "edit", "grep", "command"])
      .default("write")
      .describe("Type of operation being performed"),
    file: tool.schema.string().default("").describe("File path (for write/edit operations)"),
    message: tool.schema.string().default("").describe("Current operation message"),
    forceBreak: tool.schema.boolean().default(false).describe("Force break the loop (Emergency)"),
  },
  execute: (args, context) => impl.execute(args, context),
});
