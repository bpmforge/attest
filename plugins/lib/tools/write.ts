// plugins/lib/tools/write.ts — the body of tools/write.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/write.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import fs from "fs/promises";
import path from "path";

const def = {
  description:
    "Write content to a file, creating parent directories as needed - fixes LM Studio write tool bug",

  async execute(args: any) {
    if (!args.filePath)
      return "ERROR: 'filePath' argument is required but was not provided.";
    if (args.content === undefined || args.content === null)
      return "ERROR: 'content' argument is required but was not provided.";
    try {
      await fs.mkdir(path.dirname(args.filePath), { recursive: true });
      await fs.writeFile(args.filePath, args.content, "utf-8");
      return `Written ${args.content.length} bytes to ${args.filePath}`;
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  },
};

export const name = "write";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "filePath": {
      "description": "Absolute path to file",
      "type": "string"
    },
    "content": {
      "description": "Content to write",
      "type": "string"
    }
  },
  "required": [
    "filePath",
    "content"
  ]
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
