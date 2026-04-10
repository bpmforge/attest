import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Run Playwright E2E tests",
  args: {
    command: tool.schema.string().default("playwright test").describe("Playwright command to run"),
    paths: tool.schema.string().optional().describe("Test files or directories to run"),
    timeout: tool.schema.number().default(180).describe("Timeout in seconds"),
  },
  async execute(args, context) {
    let cmd = args.command
    if (args.paths) {
      cmd = `${cmd} ${args.paths}`
    }
    
    return new Promise<string>((resolve, reject) => {
      const { spawn } = require("child_process")
      const proc = spawn(cmd, {
        cwd: context.directory,
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
        reject(new Error(`Command timed out after ${args.timeout}s`))
      }, args.timeout * 1000)
      
      proc.on("close", (code) => {
        clearTimeout(timer)
        if (code === 0) {
          resolve(output || "All tests passed")
        } else {
          reject(new Error(`Tests failed with exit code ${code}: ${errorOutput}`))
        }
      })
      
      proc.on("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }
})
