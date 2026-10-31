// plugins/lib/tools/update.ts — the body of tools/update.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/update.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import fs from "fs/promises";
import path from "path";

const def = {
  description:
    "Write a file, overwriting it if it exists and creating it (with parent directories) if it does not - fixes LM Studio update tool bug",

  async execute(args: any) {
    if (!args.filePath)
      return "ERROR: 'filePath' argument is required but was not provided.";
    if (args.content === undefined || args.content === null)
      return "ERROR: 'content' argument is required but was not provided.";
    try {
      // Report create-vs-overwrite so a typo'd path is still visible to the
      // caller (the old behaviour ERRORed on a missing file, which dead-ended
      // any agent creating its first handoff/state file).
      const existed = await fs.access(args.filePath).then(
        () => true,
        () => false,
      );
      await fs.mkdir(path.dirname(args.filePath), { recursive: true });
      await fs.writeFile(args.filePath, args.content, "utf-8");
      return existed
        ? `Updated ${args.content.length} bytes to ${args.filePath}`
        : `Created (did not exist): ${args.content.length} bytes to ${args.filePath}`;
    } catch (error) {
      return `ERROR: ${(error as Error).message}`;
    }
  },
};

export const name = "update";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "filePath": {
      "description": "Absolute path to file",
      "type": "string"
    },
    "content": {
      "description": "Content to write (overwrites existing)",
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
