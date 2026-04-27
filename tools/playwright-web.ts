import { tool } from "@opencode-ai/plugin";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

export default tool({
  description: `Browser for web research via playwright-cli. Navigate to URLs, take snapshots to read page content, search Bing.

Search workflow:
  1. playwright_web("open https://www.bing.com/search?q=your+search+query")
  2. playwright_web("snapshot")  — read search result titles and URLs from the YAML output
  3. playwright_web("goto <result-url>")  — navigate to a result page
  4. playwright_web("snapshot")  — read the page content
  5. playwright_web("go-back")  — return to search results
  6. playwright_web("close")  — close browser when research is complete

Other commands: reload, go-forward
Tip: Go directly to known sources (docs.site.com, github.com/org/repo, en.wikipedia.org/wiki/Topic) to avoid search engine bot detection.`,
  args: {
    command: tool.schema
      .string()
      .describe(
        "playwright-cli command: 'open <url>', 'goto <url>', 'snapshot', 'go-back', 'go-forward', 'reload', 'close'",
      ),
    timeout: tool.schema
      .number()
      .default(30)
      .describe("Timeout in seconds (increase for slow pages)"),
  },
  async execute(args) {
    try {
      const { stdout, stderr } = await exec(`playwright-cli ${args.command}`, {
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
