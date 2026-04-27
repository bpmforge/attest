import { tool } from "@opencode-ai/plugin";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type Result = { title: string; url: string; snippet: string };

function decodeUddg(href: string): string {
  const m = href.match(/uddg=([^&"]+)/);
  return m ? decodeURIComponent(m[1].replace(/&amp;/g, "&")) : href;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function searchDDG(
  query: string,
  limit: number,
  timeout: number,
): Promise<Result[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout * 1000);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const titles: Array<{ title: string; url: string }> = [];
    const titleRe =
      /class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = titleRe.exec(html)) !== null && titles.length < limit) {
      const realUrl = decodeUddg(m[1]);
      if (!realUrl.startsWith("http")) continue;
      titles.push({ title: stripTags(m[2]), url: realUrl });
    }

    const snippets: string[] = [];
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = snippetRe.exec(html)) !== null && snippets.length < limit) {
      snippets.push(stripTags(m[1]));
    }

    return titles.map((t, i) => ({ ...t, snippet: snippets[i] ?? "" }));
  } finally {
    clearTimeout(timer);
  }
}

export default tool({
  description: `Search the web via DuckDuckGo and return structured results (title, URL, snippet).
No API key needed. Works reliably without a browser.

Include the current year in the query for fresh results.
Use web_fetch to read the full content of any result URL.`,
  args: {
    query: tool.schema
      .string()
      .describe(
        "Search query — include year for freshness, e.g. 'react server components 2026'",
      ),
    limit: tool.schema
      .number()
      .default(5)
      .describe("Max results to return (1–10)"),
    timeout: tool.schema
      .number()
      .default(15)
      .describe("Request timeout in seconds"),
  },
  async execute(args) {
    const limit = Math.min(Math.max(args.limit, 1), 10);
    try {
      const results = await searchDDG(args.query, limit, args.timeout);
      if (results.length === 0) {
        return `No results found for "${args.query}". Try a different query or use web_fetch with a direct URL.`;
      }
      const header = `[DuckDuckGo — ${results.length} results for "${args.query}"]\n\n`;
      return (
        header +
        results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet || "(no snippet)"}`,
          )
          .join("\n\n")
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("abort"))
        return `Search timed out after ${args.timeout}s`;
      return `Search error: ${msg}`;
    }
  },
});
