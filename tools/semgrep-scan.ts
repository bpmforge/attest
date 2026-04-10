import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Run Semgrep security scan on codebase",
  args: {
    command: tool.schema.string().default("semgrep scan").describe("Semgrep command to run"),
    config: tool.schema.string().optional().describe("Config to use (e.g., p/ci for CI rules)"),
    paths: tool.schema.string().optional().describe("Paths to scan (comma-separated)"),
    timeout: tool.schema.number().default(120).describe("Timeout in seconds"),
  },
  async execute(args, context) {
    const paths = args.paths ? args.paths.split(",").map(p => p.trim()) : [context.directory]
    const config = args.config ? `--config ${args.config}` : ""
    
    let cmd = args.command
    if (config) {
      cmd = `${cmd} ${config}`
    }
    
    if (paths.length === 1) {
      cmd = `${cmd} ${paths[0]}`
    } else {
      // Multiple paths - need special handling
      cmd = `${cmd} ${paths.join(" ")}`
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
        if (code === 0 || code === 1) { // Semgrep returns 1 when findings found
          resolve(output || errorOutput || "Scan complete")
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${errorOutput}`))
        }
      })
      
      proc.on("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }
})
