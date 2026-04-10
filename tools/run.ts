import { tool } from "@opencode-ai/plugin"
import { spawn } from "child_process"

export default tool({
  description: "Run a command and capture its output",
  args: {
    command: tool.schema.string().describe("Command to run"),
    workdir: tool.schema.string().default("").describe("Working directory"),
    timeout: tool.schema.number().optional().describe("Timeout in seconds"),
  },
  async execute(args, context) {
    const workdir = args.workdir || context.directory
    const timeout = args.timeout || 60
    
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
