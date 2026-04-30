import { tool } from "@opencode-ai/plugin";
import { spawn } from "child_process";

export default tool({
  description:
    "Run a command and capture its output. CALL AS: run({command: 'ls -la'}). 'command' is REQUIRED.",
  args: {
    command: tool.schema
      .string()
      .describe("Shell command to execute. Example: 'ls docs/'"),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Working directory (optional)"),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Timeout in seconds (optional)"),
  },
  async execute(args, context) {
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
});
