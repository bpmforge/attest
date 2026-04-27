import { tool } from "@opencode-ai/plugin";
import { chromium, type Browser } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
`;

// Selectors tried in order — picks the most specific content container available.
const CONTENT_SELECTORS =
  "main, article, [role=main], [data-content], " +
  "#content, #main-content, .content, .post-content, " +
  ".article-body, .entry-content, .prose";

export default tool({
  description: `Fetch a URL and return clean article text — no nav, ads, scripts, or markup.
Uses a stealth-patched Playwright browser for pages that block simple HTTP requests.

Returns up to 8000 characters of the main content. If the page is paywalled or requires
login, returns whatever is publicly visible.

Use web_search to find URLs first, then web_fetch to read each one.`,
  args: {
    url: tool.schema
      .string()
      .describe("Full URL to fetch (must start with http:// or https://)"),
    maxChars: tool.schema
      .number()
      .default(8000)
      .describe("Max characters to return (default 8000, max 16000)"),
    timeout: tool.schema
      .number()
      .default(30)
      .describe("Page load timeout in seconds"),
  },
  async execute(args) {
    if (!/^https?:\/\//i.test(args.url)) {
      return `Invalid URL — must start with http:// or https://`;
    }

    const maxChars = Math.min(Math.max(args.maxChars, 500), 16000);
    let browser: Browser | undefined;

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });

      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
      });
      await context.addInitScript(STEALTH_SCRIPT);

      const page = await context.newPage();

      // Block images, fonts, and media — speeds up load, we only need text
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "media", "font", "stylesheet"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      await page.goto(args.url, {
        waitUntil: "domcontentloaded",
        timeout: args.timeout * 1000,
      });

      // Brief pause for JS-rendered content to settle
      await page.waitForTimeout(600);

      const result = await page.evaluate(
        ({ selectors, max }: { selectors: string; max: number }) => {
          const root = document.querySelector(selectors) || document.body;
          const clone = root.cloneNode(true) as HTMLElement;

          // Strip boilerplate elements
          [
            "script",
            "style",
            "nav",
            "header",
            "footer",
            "aside",
            "noscript",
            "iframe",
            "form",
            "button",
            "[aria-hidden=true]",
            ".advertisement",
            ".ad",
          ].forEach((sel) => {
            clone.querySelectorAll(sel).forEach((el) => el.remove());
          });

          const text = clone.innerText
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          return {
            text: text.substring(0, max),
            totalLength: text.length,
            title: document.title,
            url: location.href,
          };
        },
        { selectors: CONTENT_SELECTORS, max: maxChars },
      );

      if (!result.text || result.text.length < 100) {
        return `Page loaded (${result.title}) but no readable text extracted. The page may require JavaScript rendering or a login.`;
      }

      const truncated =
        result.totalLength > maxChars
          ? `\n\n[Truncated — ${result.totalLength} total chars, showing first ${maxChars}]`
          : "";

      return `[${result.title}]\n${result.url}\n\n${result.text}${truncated}`;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("timeout"))
        return `Timed out after ${args.timeout}s loading ${args.url}`;
      return `Error fetching ${args.url}: ${msg}`;
    } finally {
      await browser?.close();
    }
  },
});
