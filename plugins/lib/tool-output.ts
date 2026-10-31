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
