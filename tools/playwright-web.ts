import { tool } from "@opencode-ai/plugin";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

// Removes boilerplate (nav/ads/scripts), returns plain text up to 6000 chars.
// Uses double-quote string literals only so it is safe inside a single-quoted shell arg.
const EXTRACT_JS =
  `(function(){` +
  `var s=document.querySelector("main,article,[role=main],[data-content],#content,.content,.post-content,.article-body,.entry-content")||document.body;` +
  `var c=s.cloneNode(true);` +
  `["script","style","nav","header","footer","aside","noscript","iframe","form","button"].forEach(function(t){` +
  `c.querySelectorAll(t).forEach(function(e){e.remove()});` +
  `});` +
  `return c.innerText.replace(/[ \\t]+/g," ").replace(/\\n{3,}/g,"\\n\\n").trim().substring(0,6000);` +
  `})()`;

export default tool({
  description: `Browser for web research via playwright-cli. Navigate pages, snapshot structure, extract clean article text.

Commands:
  open <url>    Start browser and navigate. Use for the first URL in a session.
  goto <url>    Navigate to a URL (browser must be open already).
  snapshot      Read page as YAML accessibility tree — use to scan search results and find links.
  extract       Read page as clean plain text — strips nav/ads/scripts, returns up to 6000 chars. Use after goto to read article content.
  go-back       Return to the previous page.
  reload        Reload the current page.
  close         Close the browser when done researching.

Search engines (use URL-encoded query, append year for freshness):
  Bing:   https://www.bing.com/search?q=<query>+2026          ← most reliable with headless browser
  Google: https://www.google.com/search?q=<query>              ← often blocked by reCAPTCHA
  Brave:  https://search.brave.com/search?q=<query>           ← often blocked by Cloudflare

Direct navigation (never blocked — prefer these when you know the source):
  GitHub:     https://github.com/search?q=<query>&type=repositories
  Wikipedia:  https://en.wikipedia.org/wiki/<Topic>
  npm:        https://www.npmjs.com/package/<pkg>
  Docs:       navigate directly to the official docs URL

Timeouts: page loads typically need 15–30s. extract typically needs 10s. Increase timeout for slow sites.

Research workflow:
  1. open <bing-search-url>  →  snapshot  →  find result links in YAML
  2. goto <result-url>       →  extract   →  read clean article text
  3. go-back  →  repeat for next result
  4. close when done`,
  args: {
    command: tool.schema
      .string()
      .describe(
        "Command to run: 'open <url>', 'goto <url>', 'snapshot', 'extract', 'go-back', 'go-forward', 'reload', 'close'",
      ),
    timeout: tool.schema
      .number()
      .default(30)
      .describe(
        "Max seconds to wait (default 30; use 10 for extract, 15 for snapshot, 30 for page loads)",
      ),
  },
  async execute(args) {
    const cmd = args.command.trim();

    if (cmd === "extract") {
      try {
        const { stdout, stderr } = await exec(
          `playwright-cli eval '${EXTRACT_JS}'`,
          { timeout: args.timeout * 1000, maxBuffer: 1024 * 1024 * 2 },
        );
        const text = (stdout || stderr || "").trim();
        return text.length > 0
          ? text
          : "No readable content found — try snapshot instead";
      } catch (error) {
        const err = error as Error & {
          killed?: boolean;
          stdout?: string;
          stderr?: string;
        };
        if (err.killed) return `Timed out after ${args.timeout}s`;
        if (err.stdout || err.stderr)
          return (err.stdout || "") + (err.stderr || "");
        return `Error: ${err.message}`;
      }
    }

    try {
      const { stdout, stderr } = await exec(`playwright-cli ${cmd}`, {
        timeout: args.timeout * 1000,
        maxBuffer: 1024 * 1024 * 5,
      });
      return stdout || stderr || "Done";
    } catch (error) {
      const err = error as Error & {
        killed?: boolean;
        stdout?: string;
        stderr?: string;
      };
      if (err.killed) return `Timed out after ${args.timeout}s`;
      if (err.stdout || err.stderr)
        return (err.stdout || "") + (err.stderr || "");
      return `Error: ${err.message}`;
    }
  },
});
