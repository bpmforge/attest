import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";

export default tool({
  description: "Write content to a file - fixes LM Studio write tool bug",
  args: {
    filePath: tool.schema.string().describe("Absolute path to file"),
    content: tool.schema.string().describe("Content to write"),
  },
  async execute(args) {
    if (!args.filePath)
      return "ERROR: 'filePath' argument is required but was not provided.";
    if (args.content === undefined || args.content === null)
      return "ERROR: 'content' argument is required but was not provided.";
    try {
      await fs.writeFile(args.filePath, args.content, "utf-8");
      return `Written ${args.content.length} bytes to ${args.filePath}`;
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  },
});
