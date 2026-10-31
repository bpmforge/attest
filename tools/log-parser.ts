import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/log-parser.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/log-parser.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    filePath: tool.schema.string().describe("Path to log file"),
    filter: tool.schema
      .object({
        level: tool.schema.enum(["_trace", "debug", "info", "warn", "error", "fatal"]).default("all").describe("Log level to filter by"),
        start: tool.schema.string().default("").describe("Start date/time ISO string"),
        end: tool.schema.string().default("").describe("End date/time ISO string"),
        pattern: tool.schema.string().default("").describe("Regex pattern to match in logs"),
      })
      .default({})
      .describe("Filter criteria"),
    summary: tool.schema.boolean().default(true).describe("Include log summary/stats"),
    limit: tool.schema.number().default(100).describe("Max lines to return"),
  },
  execute: (args, context) => impl.execute(args, context),
});
