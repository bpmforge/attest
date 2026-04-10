import { tool } from "@opencode-ai/plugin"
import { spawn } from "child_process"

export default tool({
  description: "Execute a shell command with output capture",
  args: {
    command: tool.schema.string().describe("Shell command to execute"),
    workdir: tool.schema.string().default("").describe("Working directory (optional)"),
    timeout: tool.schema.number().default(60).describe("Timeout in seconds"),
  },
  async execute(args, context) {
    const workdir = args.workdir || context.directory
    const timeout = args.timeout
    
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(args.command, { 
        cwd: workdir,
        shell: true,
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
        reject(new Error(`Command timed out after ${timeout}s`))
      }, timeout * 1000)
      
      proc.on("close", (code) => {
        clearTimeout(timer)
        if (code === 0) {
          resolve(output || "Command completed successfully")
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${errorOutput}`))
        }
      })
      
      proc.on("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  },
})
