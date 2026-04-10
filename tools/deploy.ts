import { tool } from "@opencode-ai/plugin"
import { spawn } from "child_process"

export default tool({
  description: "Build and deploy containerized app using Docker or Podman",
  args: {
    command: tool.schema
      .enum(["build", "push", "deploy", "rebuild", "status"])
      .default("deploy")
      .describe("Deployment command to run"),
    image: tool.schema.string().describe("Container image name"),
    tag: tool.schema.string().default("latest").describe("Image tag"),
    path: tool.schema.string().default(".").describe("Path to Dockerfile"),
    registry: tool.schema.string().default("").describe("Registry to push to (empty = local)"),
    detach: tool.schema.boolean().default(true).describe("Run in background"),
    env: tool.schema
      .array(tool.schema.string())
      .default([])
      .describe("Environment variables as KEY=VALUE pairs"),
  },
  async execute(args, context) {
    try {
      const toolName = process.platform === "darwin" ? "docker" : "docker"
      const img = args.registry ? `${args.registry}/${args.image}` : args.image
      const fullTag = `${img}:${args.tag}`
      
      let output = ""

      if (args.command === "build" || args.command === "rebuild") {
        output += `Building image: ${fullTag}\n`
        const buildArgs = ["build", "-t", fullTag, args.path]
        
        if (args.env.length > 0) {
          args.env.forEach((e) => buildArgs.push("--build-arg", e))
        }
        
        output += await runContainerCommand(toolName, buildArgs)
      }
      
      if (args.command === "push" || args.command === "deploy") {
        const imagetoPush = args.registry ? `${args.registry}/${args.image}` : args.image
        output += `Pushing image: ${imagetoPush}:${args.tag}\n`
        
        const pushOutput = await runContainerCommand(toolName, ["push", `${imagetoPush}:${args.tag}`])
        output += pushOutput
      }
      
      if (args.command === "deploy" || args.command === "rebuild") {
        const deployArgs = ["run"]
        
        if (args.detach) {
          deployArgs.push("-d")
        }
        
        args.env.forEach((e) => deployArgs.push("-e", e))
        
        deployArgs.push("--name", args.image)
        deployArgs.push(fullTag)
        
        output += `Deploying: ${args.command === "rebuild" ? "(stop+remove old first)" : ""}\n`
        
        if (args.command === "rebuild") {
          output += await runContainerCommand(toolName, ["stop", args.image])
          output += await runContainerCommand(toolName, ["rm", "-f", args.image])
        }
        
        output += await runContainerCommand(toolName, deployArgs)
      }
      
      if (args.command === "status") {
        output += await runContainerCommand(toolName, ["ps", "-a", "--filter", `name=${args.image}`])
      }
      
      return output.trim()
    } catch (error) {
      return `ERROR: ${(error as Error).message}`
    }
  },
})

async function runContainerCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args)
    let output = ""
    
    proc.stdout.on("data", (data) => {
      output += data.toString()
    })
    
    proc.stderr.on("data", (data) => {
      output += data.toString()
    })
    
    proc.on("close", (code) => {
      resolve(output + `\n[Exit code: ${code}]\n`)
    })
    
    proc.on("error", (err) => {
      resolve(`Failed to start command: ${err.message}\n`)
    })
  })
}
