import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import path from "path";

export default tool({
  description:
    "Append content to a file, creating it (with parent directories) if it does not exist - fixes LM Studio append tool bug",
  args: {
    filePath: tool.schema.string().describe("Absolute path to file"),
    content: tool.schema.string().describe("Content to append"),
  },
  async execute(args) {
    if (!args.filePath)
      return "ERROR: 'filePath' argument is required but was not provided.";
    if (args.content === undefined || args.content === null)
      return "ERROR: 'content' argument is required but was not provided.";
    try {
      const existed = await fs.access(args.filePath).then(
        () => true,
        () => false,
      );
      await fs.mkdir(path.dirname(args.filePath), { recursive: true });
      await fs.appendFile(args.filePath, args.content, "utf-8");
      return existed
        ? `Appended ${args.content.length} bytes to ${args.filePath}`
        : `Created (did not exist): ${args.content.length} bytes to ${args.filePath}`;
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  },
});
