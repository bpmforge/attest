// plugins/lib/tools/run.ts — the body of tools/run.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/run.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import { spawn } from "child_process";

const def = {
  description:
    "Run a command and capture its output. CALL AS: run({command: 'ls -la'}). 'command' is REQUIRED.",

  async execute(args: any, context: any) {
    if (!args.command)
      return "[LOOP STOP] run called without 'command' argument. This is strike 1 (or 2). Per loop-prevention rules: after 2 schema errors you MUST STOP and write the BLOCKED template to the user. Do NOT retry without a specific command. Example: run({command: 'ls ~/.config/opencode/agents/'}).";
    const workdir = args.workdir || context.directory;
    const timeout = args.timeout || 60;

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(args.command, {
        cwd: workdir,
        shell: true,
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data) => {
        output += data.toString();
      });

      proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Command timed out after ${timeout}s`));
      }, timeout * 1000);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(output || "Command completed successfully");
        } else {
          reject(
            new Error(`Command failed with exit code ${code}: ${errorOutput}`),
          );
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  },
};

export const name = "run";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "command": {
      "description": "Shell command to execute. Example: 'ls docs/'",
      "type": "string"
    },
    "workdir": {
      "description": "Working directory (optional)",
      "type": "string"
    },
    "timeout": {
      "description": "Timeout in seconds (optional)",
      "type": "number"
    }
  },
  "required": [
    "command"
  ]
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
