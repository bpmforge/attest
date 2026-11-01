// plugins/lib/tools/deploy.ts — the body of tools/deploy.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/deploy.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import { spawn } from "child_process"

const def = {
  description: "Build and deploy containerized app using Docker or Podman",

  async execute(args: any, context: any) {
    try {
      const toolName = process.platform === "darwin" ? "docker" : "docker"
      const img = args.registry ? `${args.registry}/${args.image}` : args.image
      const fullTag = `${img}:${args.tag}`
      
      let output = ""

      if (args.command === "build" || args.command === "rebuild") {
        output += `Building image: ${fullTag}\n`
        const buildArgs = ["build", "-t", fullTag, args.path]
        
        if (args.env.length > 0) {
          args.env.forEach((e: string) => buildArgs.push("--build-arg", e))
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
        
        args.env.forEach((e: string) => deployArgs.push("-e", e))
        
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
};async function runContainerCommand(cmd: string, args: string[]): Promise<string> {
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

export const name = "deploy";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "command": {
      "description": "Deployment command to run",
      "default": "deploy",
      "type": "string",
      "enum": [
        "build",
        "push",
        "deploy",
        "rebuild",
        "status"
      ]
    },
    "image": {
      "description": "Container image name",
      "type": "string"
    },
    "tag": {
      "description": "Image tag",
      "default": "latest",
      "type": "string"
    },
    "path": {
      "description": "Path to Dockerfile",
      "default": ".",
      "type": "string"
    },
    "registry": {
      "description": "Registry to push to (empty = local)",
      "default": "",
      "type": "string"
    },
    "detach": {
      "description": "Run in background",
      "default": true,
      "type": "boolean"
    },
    "env": {
      "description": "Environment variables as KEY=VALUE pairs",
      "default": [],
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "image"
  ]
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
