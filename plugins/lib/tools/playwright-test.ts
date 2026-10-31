// plugins/lib/tools/playwright-test.ts — the body of tools/playwright-test.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/playwright-test.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
const def = {
  description:
    "Run Playwright end-to-end browser tests. Spawns 'npx playwright test' (or a custom command) in the project's working directory with output capture and configurable timeout. Use for end-to-end runs after implementation; for a single file use 'paths'. NOT for unit tests — use test-runner for vitest/jest.",

  async execute(args: any, context: any) {
    let cmd = args.command;
    if (args.paths) {
      cmd = `${cmd} ${args.paths}`;
    }

    return new Promise<string>((resolve, reject) => {
      const { spawn } = require("child_process");
      const proc = spawn(cmd, {
        cwd: context.directory,
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
        reject(new Error(`Command timed out after ${args.timeout}s`));
      }, args.timeout * 1000);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(output || "All tests passed");
        } else {
          reject(
            new Error(`Tests failed with exit code ${code}: ${errorOutput}`),
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

export const name = "playwright-test";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "command": {
      "description": "Playwright command to run",
      "default": "playwright test",
      "type": "string"
    },
    "paths": {
      "description": "Test files or directories to run",
      "type": "string"
    },
    "timeout": {
      "description": "Timeout in seconds",
      "default": 180,
      "type": "number"
    }
  }
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
