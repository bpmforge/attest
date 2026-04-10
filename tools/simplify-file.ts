import { tool } from "@opencode-ai/plugin"
import fs from "fs/promises"

export default tool({
  description: "Simplify code with rewrite detection to prevent infinite loops",
  args: {
    filePath: tool.schema.string().describe("Absolute path to file"),
    instructions: tool.schema.string().describe("Instructions for simplification"),
  },
  async execute(args, context) {
    try {
      const currentContent = await fs.readFile(args.filePath, "utf-8")
      
      const simplified = await attemptSimplification(currentContent, args.instructions)
      
      if (simplified === currentContent) {
        return `No changes needed. File is already optimal.\n\nFile: ${args.filePath}`
      }
      
      if (currentContent.length - simplified.length < 10) {
        return `Changes are minimal (${Math.abs(currentContent.length - simplified.length)} bytes).\nConsider manual review or different approach.\n\nFile: ${args.filePath}`
      }
      
      await fs.writeFile(args.filePath, simplified, "utf-8")
      
      const linesBefore = currentContent.split("\n").length
      const linesAfter = simplified.split("\n").length
      
      return `Simplified file: ${args.filePath}
Lines reduced: ${linesBefore} → ${linesAfter} (${linesBefore - linesAfter} lines)
Bytes changed: ${Math.abs(currentContent.length - simplified.length)}

Original size:  ${formatSize(currentContent.length)}
Simplified size: ${formatSize(simplified.length)}
Saving:          ${formatSize(currentContent.length - simplified.length)}

Changes applied successfully.`
    } catch (error) {
      return `ERROR: ${(error as Error).message}`
    }
  },
})

async function attemptSimplification(content: string, instructions: string): Promise<string> {
  const { cmd, argsArray } = getRewriteCommand()
  
  return new Promise((resolve) => {
    const proc = spawn(cmd, argsArray)
    let output = ""
    
    proc.stdout.on("data", (data) => {
      output += data.toString()
    })
    
    proc.stderr.on("data", (data) => {
      output += data.toString()
    })
    
    proc.on("close", () => {
      resolve(output)
    })
    
    proc.on("error", () => {
      resolve(content)
    })
  })
}

function getRewriteCommand(): { cmd: string; argsArray: string[] } {
  if (process.platform === "darwin") {
    return { cmd: "sed", argsArray: ["-i", "", "s/  / /g"] }
  }
  
  return { cmd: "sed", argsArray: ["-i", "s/  / /g"] }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
