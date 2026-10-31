import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/file-info.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/file-info.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    filePath: tool.schema.string().describe("Absolute path to file"),
  },
  execute: (args, context) => impl.execute(args, context),
});
