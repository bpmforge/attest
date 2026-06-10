---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Browser Testing Primer

Load when you need to use `playwright-mcp` for browser automation, screenshots, or E2E verification.

This MCP works with any LLM — no vision required (uses accessibility tree snapshots). Works in Claude Code and OpenCode.

---

## When to use what

| Need | Tool |
|------|------|
| Navigate + screenshot + click | `playwright-mcp` (this doc) |
| Research a URL / web search | `playwright-search` |
| Extract markdown from a JS-heavy page | `pullmd` |
| Run Playwright test files (`.spec.ts`) | `bash(command="npx playwright test ...")` |

---

## Core workflow

### Verify a deployed UI feature
```
browser_navigate("http://localhost:3000/your-feature")
browser_wait_for(".loaded-indicator", "visible")
browser_screenshot()                    ← attach to report / PR
browser_snapshot()                      ← check accessibility tree for errors
```

### Fill and submit a form
```
browser_navigate("http://localhost:3000/login")
browser_fill("[name=email]", "test@example.com")
browser_fill("[name=password]", "testpass")
browser_click("[type=submit]")
browser_wait_for(".dashboard", "visible")
browser_screenshot()
```

### E2E verification after implementation
```
browser_navigate("http://localhost:3000")
browser_snapshot()                      ← confirm page loaded cleanly
browser_click("text=Sign In")
browser_fill("[data-testid=email]", "user@example.com")
browser_fill("[data-testid=password]", "password")
browser_click("[data-testid=submit]")
browser_wait_for("[data-testid=dashboard]", "visible")
browser_screenshot()                    ← success state screenshot
browser_get_url()                       ← confirm redirect worked
```

---

## Tool reference

| Tool | Required args | Notes |
|------|--------------|-------|
| `browser_navigate(url)` | url | Always wait after navigate |
| `browser_screenshot()` | — | Returns image — attach to report |
| `browser_snapshot()` | — | Accessibility tree — works without vision |
| `browser_click(element)` | CSS selector or text | `"text=Button Label"` works |
| `browser_fill(element, value)` | selector, value | For `<input>`, `<textarea>` |
| `browser_type(element, text)` | selector, text | Type key-by-key (use for autocomplete) |
| `browser_select_option(element, value)` | selector, value | For `<select>` elements |
| `browser_wait_for(selector, state)` | selector, state | states: `visible`, `hidden`, `attached` |
| `browser_get_url()` | — | Confirm current URL after navigation |
| `browser_evaluate(js)` | js string | Run arbitrary JS; use for assertions |
| `browser_close()` | — | Always close when done |

---

## Verification patterns

### Assert page title
```
browser_evaluate("document.title")
```

### Assert element text
```
browser_evaluate("document.querySelector('.error-message')?.textContent")
```

### Assert URL after redirect
```
browser_get_url()    ← compare to expected
```

### Check for console errors
```
browser_evaluate("window.__errors || []")
```

---

## vs Claude Code browser extension (claude-in-chrome)

| Capability | playwright-mcp | claude-in-chrome |
|-----------|----------------|-----------------|
| LLM-agnostic | ✅ | Claude Code only |
| OpenCode support | ✅ | ❌ |
| Headless mode | ✅ | ❌ |
| CI/CD compatible | ✅ | ❌ |
| Pre-existing browser tab | ❌ | ✅ |
| Live session inspection | ❌ | ✅ |

Use `playwright-mcp` for all automated testing and CI-compatible verification. Use `claude-in-chrome` when you need to inspect or interact with your already-open browser session interactively.

---

## Headed mode (watch the browser)

Set env var before starting your session:
```bash
PLAYWRIGHT_MCP_HEADED=true claude
# or
PLAYWRIGHT_MCP_HEADED=true opencode
```

---

## After testing — always close
```
browser_close()
```

Leaving browsers open across sessions wastes resources and can cause port conflicts.
