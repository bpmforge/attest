import { tool } from "@opencode-ai/plugin"
import fs from "fs/promises"
import path from "path"

export default tool({
  description: "Get file metadata (size, lines, extension)",
  args: {
    filePath: tool.schema.string().describe("Absolute path to file"),
  },
  async execute(args) {
    try {
      const stat = await fs.stat(args.filePath)
      const content = await fs.readFile(args.filePath, "utf-8")
      const lines = content.split("\n").length
      const ext = path.extname(args.filePath) || "(no extension)"
      
      return JSON.stringify({
        path: args.filePath,
        sizeBytes: stat.size,
        sizeHuman: formatBytes(stat.size),
        lines,
        extension: ext,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        lastModified: stat.mtime.toISOString(),
      }, null, 2)
    } catch (error) {
      return `ERROR: ${(error as Error).message}`
    }
  },
})

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes"
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
}
