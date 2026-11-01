// plugins/lib/v2-tools.ts — OpenCode v2 tool-name / argument canonicalization + registration options. NO opencode imports.
//
// VERIFIED on a real opencode 2.2.5 (fake OpenAI-compatible provider, docs/reviews/MANIFEST_V1b-opencode-v2-contracts.md):
//   - v2's direct built-in tools are: edit, patch, glob, grep, question, read, shell, skill, subagent, webfetch, websearch
//     (+ `execute`, the Code Mode runtime). The shell tool is `shell`, NOT `bash`; there is no built-in `write`.
//   - their file argument is `path` (v1: `filePath`): read{path,offset,limit} edit{path,oldString,newString,replaceAll}
//     shell{command,workdir,timeout,background}. The shared guards read `filePath` / `file_path` / `command`.
//   - a tool added through ctx.tool.transform WITHOUT `options.codemode:false` is hidden behind Code Mode: it is in the registry
//     (`ctx.tool.list()`) but absent from the model's tool list ("No tool named \"bash\" is currently available").
//   - `options.permission` names the permission action the host asserts before execute (built-ins: edit -> "edit"); a plugin tool
//     with no `permission` runs with NO host permission check.
// So: the guards see canonical (v1) names/args, and our 17 tools are registered direct + with a permission action.

export const V2_TOOL_ALIAS: Record<string, string> = { shell: "bash" };

export const canonicalTool = (tool: string): string => V2_TOOL_ALIAS[tool] ?? tool;

/** v2 built-ins pass `path`; the shared guards read `filePath`. Returns args unchanged when there is nothing to add. */
export function canonicalArgs(input: unknown): Record<string, any> {
  const a = input && typeof input === "object" ? (input as Record<string, any>) : {};
  return typeof a.path === "string" && a.filePath === undefined && a.file_path === undefined ? { ...a, filePath: a.path } : a;
}

/** Permission action asserted by the host before each plugin tool runs (undefined = none, for pure/read-only helpers). */
export const V2_TOOL_PERMISSION: Record<string, string | undefined> = {
  bash: "shell",
  run: "shell",
  deploy: "shell",
  "playwright-test": "shell",
  "playwright-web": "shell",
  "semgrep-rule": "shell",
  "semgrep-scan": "shell",
  "test-runner": "shell",
  task: "shell",
  write: "edit",
  append: "edit",
  update: "edit",
  "simplify-file": "edit",
  "file-info": "read",
  "log-parser": "read",
  "loop-detector": undefined,
  pomodoro: undefined,
};

export function v2ToolOptions(name: string): { codemode: false; permission?: string } {
  const permission = V2_TOOL_PERMISSION[name];
  return permission ? { codemode: false, permission } : { codemode: false };
}
