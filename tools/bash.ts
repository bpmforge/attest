import { tool } from "@opencode-ai/plugin";
import { spawn } from "child_process";

export default tool({
  description:
    "Execute a shell command. CALL EXACTLY AS: bash({command: 'ls -la'}). The 'command' field is REQUIRED — omitting it returns an error and you must STOP retrying.",
  args: {
    command: tool.schema
      .string()
      .describe(
        "Shell command to execute. Example: 'ls ~/.config/opencode/agents/' or 'cat README.md'",
      ),
    workdir: tool.schema
      .string()
      .optional()
      .describe("Working directory (optional, defaults to project root)"),
    timeout: tool.schema
      .number()
      .optional()
      .describe("Timeout in seconds (optional, defaults to 60)"),
  },
  async execute(args, context) {
    if (!args.command)
      return "[LOOP STOP] bash called without 'command' argument. This is strike 1 (or 2). Per loop-prevention rules: after 2 schema errors you MUST STOP and write the BLOCKED template to the user. Do NOT call bash again without a specific command string. Example of correct call: bash({command: 'ls ~/.config/opencode/agents/'}).";
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
