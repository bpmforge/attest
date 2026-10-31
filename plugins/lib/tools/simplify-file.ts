// plugins/lib/tools/simplify-file.ts — the body of tools/simplify-file.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/simplify-file.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import { spawn } from "child_process";
import fs from "fs/promises";

const def = {
  description: "Simplify code with rewrite detection to prevent infinite loops",

  async execute(args: any, context: any) {
    try {
      const currentContent = await fs.readFile(args.filePath, "utf-8");

      const simplified = await attemptSimplification(
        currentContent,
        args.instructions,
      );

      if (simplified === currentContent) {
        return `No changes needed. File is already optimal.\n\nFile: ${args.filePath}`;
      }

      if (currentContent.length - simplified.length < 10) {
        return `Changes are minimal (${Math.abs(currentContent.length - simplified.length)} bytes).\nConsider manual review or different approach.\n\nFile: ${args.filePath}`;
      }

      await fs.writeFile(args.filePath, simplified, "utf-8");

      const linesBefore = currentContent.split("\n").length;
      const linesAfter = simplified.split("\n").length;

      return `Simplified file: ${args.filePath}
Lines reduced: ${linesBefore} → ${linesAfter} (${linesBefore - linesAfter} lines)
Bytes changed: ${Math.abs(currentContent.length - simplified.length)}

Original size:  ${formatSize(currentContent.length)}
Simplified size: ${formatSize(simplified.length)}
Saving:          ${formatSize(currentContent.length - simplified.length)}

Changes applied successfully.`;
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  },
};

async function attemptSimplification(
  content: string,
  instructions: string,
): Promise<string> {
  const { cmd, argsArray } = getRewriteCommand();

  return new Promise((resolve) => {
    const proc = spawn(cmd, argsArray);
    let output = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      resolve(output);
    });

    proc.on("error", () => {
      resolve(content);
    });
  });
}

function getRewriteCommand(): { cmd: string; argsArray: string[] } {
  if (process.platform === "darwin") {
    return { cmd: "sed", argsArray: ["-i", "", "s/  / /g"] };
  }

  return { cmd: "sed", argsArray: ["-i", "s/  / /g"] };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const name = "simplify-file";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "filePath": {
      "description": "Absolute path to file",
      "type": "string"
    },
    "instructions": {
      "description": "Instructions for simplification",
      "type": "string"
    }
  },
  "required": [
    "filePath",
    "instructions"
  ]
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
