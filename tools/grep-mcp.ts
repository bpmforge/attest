import { tool } from "@opencode-ai/plugin";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

export default tool({
  description:
    "Enhanced grep with options for context, line numbers, and file filtering",
  args: {
    pattern: tool.schema.string().describe("Regex pattern to search for"),
    path: tool.schema
      .string()
      .default("")
      .describe("Directory or file path (empty = current directory)"),
    options: tool.schema
      .object({
        caseInsensitive: tool.schema
          .boolean()
          .default(false)
          .describe("Case-insensitive search"),
        invertMatch: tool.schema
          .boolean()
          .default(false)
          .describe("Invert match (show non-matching lines)"),
        contextLines: tool.schema
          .number()
          .default(0)
          .describe("Show N lines before and after match"),
        onlyFilenames: tool.schema
          .boolean()
          .default(false)
          .describe("Show only filenames with matches"),
        lineNumbers: tool.schema
          .boolean()
          .default(true)
          .describe("Show line numbers"),
        recursive: tool.schema
          .boolean()
          .default(true)
          .describe("Search recursively"),
        include: tool.schema
          .string()
          .default("")
          .describe("File pattern to include (e.g., '*.ts')"),
        exclude: tool.schema
          .string()
          .default("")
          .describe("File pattern to exclude"),
      })
      .default({})
      .describe("Optional grep flags"),
  },
  async execute(args) {
    try {
      let cmd = "grep";
      const argsArray: string[] = [];

      if (args.options.contextLines > 0) {
        argsArray.push("-C", args.options.contextLines.toString());
      }

      if (args.options.invertMatch) {
        argsArray.push("-v");
      }

      if (args.options.onlyFilenames) {
        argsArray.push("-l");
      }

      if (args.options.lineNumbers) {
        argsArray.push("-n");
      }

      if (args.options.caseInsensitive) {
        argsArray.push("-i");
      }

      if (!args.options.recursive) {
        argsArray.push("-L");
      }

      if (args.options.include) {
        argsArray.push("--include=" + args.options.include);
      }

      if (args.options.exclude) {
        argsArray.push("--exclude=" + args.options.exclude);
      }

      argsArray.push(args.pattern);
      argsArray.push(args.path || ".");

      cmd += " " + argsArray.join(" ");

      const { stdout, stderr } = await exec(cmd, {
        maxBuffer: 1024 * 1024 * 10,
      });

      if (stderr && !stderr.includes("Binary file")) {
        return `WARNING: ${stderr}\n\nOUTPUT:\n${stdout || "(no matches)"}`;
      }

      return stdout || "No matches found";
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "ENOENT") {
        return "No matches found";
      }
      return `ERROR: ${err.message}`;
    }
  },
});
