// plugins/lib/tool-output.ts — pure tool-result truncation (TOKEN_OPTIMIZATION_PLAN D4 / L14).
// NO opencode imports. A read/grep/glob/list/bash result longer than
// EXPERTS_TOOL_OUTPUT_MAX chars (default 24000 ≈ 6k tokens) keeps its head and tail
// with an explicit omission marker that says how to get the middle. 0 disables.
// Write/edit results are never touched.

export const COMPRESSIBLE_TOOLS = new Set(["read", "grep", "glob", "list", "bash", "run"]);

export function parseToolOutputMax(env: Record<string, string | undefined>): number {
  return env.EXPERTS_TOOL_OUTPUT_MAX === undefined ? 24000 : Number(env.EXPERTS_TOOL_OUTPUT_MAX) || 0;
}

export function omissionHint(tool: string): string {
  return tool === "read"
    ? "re-read this file with offset/limit for the part you need"
    : tool === "grep"
      ? "narrow the pattern or add a path/glob; or grep -c first"
      : tool === "bash"
        ? "re-run piped through head/tail/grep for the lines you need"
        : "narrow the query";
}

/** The truncated text, or null when the result is within budget / not compressible. */
export function truncateToolOutput(tool: string, text: unknown, max: number): { text: string; originalLength: number } | null {
  if (!(max > 0) || !COMPRESSIBLE_TOOLS.has(tool) || typeof text !== "string" || text.length <= max) return null;
  const head = Math.floor(max * 0.65);
  const tail = Math.floor(max * 0.25);
  const omitted = text.length - head - tail;
  return {
    text: `${text.slice(0, head)}\n\n[… ${omitted.toLocaleString()} chars omitted by expert-hooks (EXPERTS_TOOL_OUTPUT_MAX=${max}) — ${omissionHint(tool)} …]\n\n${text.slice(-tail)}`,
    originalLength: text.length,
  };
}

/**
 * v2 `execute.after` (VERIFIED against the OpenCode v2 plugin package 2.2.5 types): the model-visible text is `result.content`,
 * `string | ReadonlyArray<Content>` (Content = {type:'text',text} | {type:'file',uri,mime}), NOT `output.output`.
 * Truncates a string content, or the concatenated text parts of an array (file parts are kept, after the text).
 * Returns the replacement content + original length, or null when within budget / not compressible.
 */
export function truncateToolResultContent(
  tool: string,
  content: unknown,
  max: number,
): { content: string | Array<{ type: string; [k: string]: unknown }>; originalLength: number } | null {
  if (typeof content === "string") {
    const cut = truncateToolOutput(tool, content, max);
    return cut ? { content: cut.text, originalLength: cut.originalLength } : null;
  }
  if (!Array.isArray(content)) return null;
  const parts = content as Array<{ type: string; text?: string; [k: string]: unknown }>;
  const texts = parts.filter((p) => p?.type === "text" && typeof p.text === "string");
  if (!texts.length) return null;
  const joined = texts.map((p) => p.text).join("\n");
  const cut = truncateToolOutput(tool, joined, max);
  if (!cut) return null;
  const rest = parts.filter((p) => !(p?.type === "text" && typeof p.text === "string"));
  return { content: [{ type: "text", text: cut.text }, ...rest], originalLength: cut.originalLength };
}

/** Plain text of a v2 Tool.Result (`content` string / text parts, else a string `output`) for tracing. */
export function toolResultText(result: { content?: unknown; output?: unknown } | undefined): string | undefined {
  const c = result?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const t = c.filter((p: any) => p?.type === "text" && typeof p.text === "string").map((p: any) => p.text);
    if (t.length) return t.join("\n");
  }
  return typeof result?.output === "string" ? result.output : undefined;
}
