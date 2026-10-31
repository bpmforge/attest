// plugins/lib/tools/append.ts — the body of tools/append.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/append.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import fs from "fs/promises";
import path from "path";

const def = {
  description:
    "Append content to a file, creating it (with parent directories) if it does not exist - fixes LM Studio append tool bug",

  async execute(args: any) {
    if (!args.filePath)
      return "ERROR: 'filePath' argument is required but was not provided.";
    if (args.content === undefined || args.content === null)
      return "ERROR: 'content' argument is required but was not provided.";
    try {
      const existed = await fs.access(args.filePath).then(
        () => true,
        () => false,
      );
      await fs.mkdir(path.dirname(args.filePath), { recursive: true });
      await fs.appendFile(args.filePath, args.content, "utf-8");
      return existed
        ? `Appended ${args.content.length} bytes to ${args.filePath}`
        : `Created (did not exist): ${args.content.length} bytes to ${args.filePath}`;
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  },
};

export const name = "append";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "filePath": {
      "description": "Absolute path to file",
      "type": "string"
    },
    "content": {
      "description": "Content to append",
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
