// plugins/lib/tools/file-info.ts — the body of tools/file-info.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/file-info.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import fs from "fs/promises"
import path from "path"

const def = {
  description: "Get file metadata (size, lines, extension)",

  async execute(args: any) {
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
};function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes"
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
}

export const name = "file-info";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "filePath": {
      "description": "Absolute path to file",
      "type": "string"
    }
  },
  "required": [
    "filePath"
  ]
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
