import { tool } from "@opencode-ai/plugin"
import { spawn } from "child_process"

export default tool({
  description: "Run a sub-agent task with timeout protection (30s default, max 120s)",
  args: {
    description: tool.schema.string().describe("Short task summary"),
    prompt: tool.schema.string().describe("Detailed task instructions for agent"),
    subagent_type: tool.schema
      .enum([
        "api-designer", "code-reviewer", "container-ops", "db-architect",
        "execute", "general", "performance-engineer", "researcher",
        "security-auditor", "sre-engineer", "test-engineer", "ux-engineer"
      ])
      .describe("Agent type to use"),
    // Validation constraints must come BEFORE the default value
    timeout: tool.schema.number().max(120).default(30).describe("Timeout in seconds"),
  },
  async execute(args, context) {
    const { description, prompt, subagent_type, timeout } = args
    const timeoutMs = Math.min(timeout * 1000, 120000)
    const taskPrompt = description ? `${description}\n\n${prompt}` : prompt
    
    return new Promise<string>((resolve, reject) => {
      const proc = spawn("opencode", [
        "run",
        "--agent",
        subagent_type,
        "--format",
        "json",
        "--dangerously-skip-permissions",
        taskPrompt,
      ], {
        cwd: context.directory,
        shell: false,
      })

      let output = ""
      let errorOutput = ""

      proc.stdout.on("data", (data) => {
        output += data.toString()
      })

      proc.stderr.on("data", (data) => {
        errorOutput += data.toString()
      })

      const timer = setTimeout(() => {
        proc.kill("SIGTERM")
        reject(new Error(`Task agent '${subagent_type}' timed out after ${timeout}s`))
      }, timeoutMs)

      proc.on("close", (code) => {
        clearTimeout(timer)
        if (code === 0) {
          resolve(output || "Task completed successfully")
        } else {
          reject(new Error(`Task agent '${subagent_type}' failed with exit code ${code}: ${errorOutput}`))
        }
      })

      proc.on("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  },
})
