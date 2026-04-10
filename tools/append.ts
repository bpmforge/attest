import { tool } from "@opencode-ai/plugin"
import fs from "fs/promises"

export default tool({
  description: "Append content to a file - fixes LM Studio append tool bug",
  args: {
    filePath: tool.schema.string().describe("Absolute path to file"),
    content: tool.schema.string().describe("Content to append"),
  },
  async execute(args) {
    try {
      const exists = await fs.access(args.filePath).then(() => true, () => false)
      if (!exists) {
        return `ERROR: File does not exist: ${args.filePath}`
      }
      
      await fs.appendFile(args.filePath, args.content, "utf-8")
      return `Appended ${args.content.length} bytes to ${args.filePath}`
    } catch (error) {
      return `ERROR: ${(error as Error).message}`
    }
  },
})
