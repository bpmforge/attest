import { tool } from "@opencode-ai/plugin"
import fs from "fs/promises"
import path from "path"

export default tool({
  description: "Detect and prevent infinite loops in LLM operations",
  args: {
    action: tool.schema
      .enum(["check", "record", "reset"])
      .default("check")
      .describe("Action to perform"),
    type: tool.schema
      .enum(["write", "read", "edit", "grep", "command"])
      .default("write")
      .describe("Type of operation being performed"),
    file: tool.schema.string().default("").describe("File path (for write/edit operations)"),
    message: tool.schema.string().default("").describe("Current operation message"),
    forceBreak: tool.schema.boolean().default(false).describe("Force break the loop (Emergency)"),
  },
  async execute(args, context) {
    const state = await loadLoopState(context)
    
    if (args.action === "reset") {
      state.loops = []
      await saveLoopState(context, state)
      
      return "Loop detector reset. History cleared."
    }
    
    const key = args.type + (args.file ? ":" + args.file : "")
    
    if (args.action === "record") {
      const loopEntry = state.loops.find((l) => l.key === key)
      
      if (loopEntry) {
        loopEntry.count++
        loopEntry.lastMessage = args.message
        loopEntry.lastTimestamp = new Date().toISOString()
      } else {
        state.loops.push({
          key,
          count: 1,
          type: args.type,
          file: args.file,
          lastMessage: args.message,
          lastTimestamp: new Date().toISOString(),
        })
      }
      
      await saveLoopState(context, state)
      
      return `Operation recorded: ${args.type}${args.file ? " on " + args.file : ""} (count: ${state.loops.find((l) => l.key === key)?.count})`
    }
    
    const loopEntry = state.loops.find((l) => l.key === key)
    
    if (!loopEntry && args.forceBreak) {
      return "Loop break forced. No history entry found."
    }
    
    if (!loopEntry) {
      return "No loop detected. Operation safe to proceed."
    }
    
    if (loopEntry.count >= 5 || args.forceBreak) {
      const suggestedFixes = getSuggestedFixes(args.type, loopEntry.file)
      
      return `⚠️ LOOP DETECTED
Type: ${args.type}${loopEntry.file ? " on file: " + loopEntry.file : ""}
Attempts: ${loopEntry.count}
Last message: ${loopEntry.lastMessage || "(no message)"}

Suggested fixes:
${suggestedFixes.join("\n")}

⚠️ BREAKING LOOP NOW
Please analyze the issue and try a different approach.
`
    }
    
    return `Warning: Potential loop detected (${loopEntry.count}/${5} attempts)
Type: ${args.type}${loopEntry.file ? " on file: " + loopEntry.file : ""}
Last message: ${loopEntry.lastMessage || "(no message)"}

Proceed with caution.`
  },
})

interface LoopRecord {
  key: string
  count: number
  type: string
  file?: string
  lastMessage: string
  lastTimestamp: string
}

interface LoopState {
  loops: LoopRecord[]
}

async function loadLoopState(context: { directory: string }): Promise<LoopState> {
  const stateFile = getLoopStateFilePath(context.directory)
  
  try {
    const content = await fs.readFile(stateFile, "utf-8")
    
    if (!content.trim()) {
      return { loops: [] }
    }
    
    return JSON.parse(content)
  } catch (error) {
    return { loops: [] }
  }
}

async function saveLoopState(context: { directory: string }, state: LoopState): Promise<void> {
  const stateFile = getLoopStateFilePath(context.directory)
  
  try {
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2))
  } catch (error) {
    console.error("Failed to save loop state:", error)
  }
}

function getLoopStateFilePath(projectRoot: string): string {
  const loopDir = path.join(projectRoot, ".opencode-loops")
  
  void fs.mkdir(loopDir, { recursive: true })
  
  return path.join(loopDir, "state.json")
}

function getSuggestedFixes(type: string, file?: string): string[] {
  const fixes = []
  
  switch (type) {
    case "write":
      if (file) {
        fixes.push(`- Review the file ${file} directly before rewriting`)
        fixes.push("- Verify you're writing to the correct location")
        fixes.push("- Check if file exists and has expected content")
      } else {
        fixes.push("- Double-check the filePath argument before writing")
        fixes.push("- Verify you're not overwriting files unintentionally")
      }
      break
      
    case "edit":
      fixes.push("- Make more targeted edits with larger context")
      fixes.push("- Verify the oldString exists exactly as written")
      fixes.push("- Consider rewriting entire file instead of multiple edits")
      break
      
    case "grep":
      fixes.push("- Consider running the command manually to see results")
      fixes.push("- Try broader patterns or fewer filters")
      break
      
    case "command":
      fixes.push("- Verify the command syntax is correct")
      fixes.push("- Check if all dependencies are installed")
      break
      
    default:
      fixes.push("- Add pauses between operations to let LLM process")
      fixes.push("- Break the task into smaller steps")
  }
  
  fixes.push("- Explicitly tell LLM to proceed with a specific action")
  fixes.push("- Review the task requirements and adjust approach")
  
  return fixes
}
