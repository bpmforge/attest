import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Playwright browser automation via CLI",
  args: {
    command: tool.schema.string().default("playwright open").describe("Playwright command"),
    url: tool.schema.string().optional().describe("URL to open"),
    timeout: tool.schema.number().default(30).describe("Timeout in seconds"),
  },
  async execute(args, context) {
    let cmd = args.command
    if (args.url) {
      cmd = `${cmd} ${args.url}`
    }
    
    return new Promise<string>((resolve, reject) => {
      const { spawn } = require("child_process")
      const proc = spawn(cmd, {
        cwd: context.directory,
        shell: true,
        detached: true,
      })
      
      let output = ""
      proc.stdout.on("data", (data) => {
        output += data.toString()
      })
      
      const timer = setTimeout(() => {
        proc.kill("SIGTERM")
        reject(new Error(`Command timed out after ${args.timeout}s`))
      }, args.timeout * 1000)
      
      proc.on("close", (code) => {
        clearTimeout(timer)
        resolve(output || "Browser launched successfully")
      })
      
      proc.on("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }
})
