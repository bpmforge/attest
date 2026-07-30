import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import path from "path";

export default tool({
  description:
    "Write a file, overwriting it if it exists and creating it (with parent directories) if it does not - fixes LM Studio update tool bug",
  args: {
    filePath: tool.schema.string().describe("Absolute path to file"),
    content: tool.schema
      .string()
      .describe("Content to write (overwrites existing)"),
  },
  async execute(args) {
    if (!args.filePath)
      return "ERROR: 'filePath' argument is required but was not provided.";
    if (args.content === undefined || args.content === null)
      return "ERROR: 'content' argument is required but was not provided.";
    try {
      // Report create-vs-overwrite so a typo'd path is still visible to the
      // caller (the old behaviour ERRORed on a missing file, which dead-ended
      // any agent creating its first handoff/state file).
      const existed = await fs.access(args.filePath).then(
        () => true,
        () => false,
      );
      await fs.mkdir(path.dirname(args.filePath), { recursive: true });
      await fs.writeFile(args.filePath, args.content, "utf-8");
      return existed
        ? `Updated ${args.content.length} bytes to ${args.filePath}`
        : `Created (did not exist): ${args.content.length} bytes to ${args.filePath}`;
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  },
});
