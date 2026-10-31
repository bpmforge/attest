import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/pomodoro.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/pomodoro.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    action: tool.schema
      .enum(["start", "stop", "status", "break", "reset"])
      .default("start")
      .describe("Timer action to perform"),
    duration: tool.schema
      .number()
      .default(25)
      .describe("Duration in minutes (default: 25 for Pomodoro)"),
    intervalName: tool.schema
      .enum(["focus", "short-break", "long-break"])
      .default("focus")
      .describe("Type of interval"),
    message: tool.schema
      .string()
      .default("")
      .describe("Custom notification message"),
  },
  execute: (args, context) => impl.execute(args, context),
});
